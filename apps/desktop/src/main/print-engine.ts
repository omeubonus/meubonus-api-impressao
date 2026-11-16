import { BrowserWindow, app, shell, Notification, session } from 'electron';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrintJobOptions, PrintJobPayload, PrinterInfo } from '../types';
import { discoverPrinters } from './printer-discovery';
import { agentStore, isDev, validateTcpPrinterTarget } from './store';

const execFileAsync = promisify(execFile);

// Sequências padrão ESC/POS
const ESC_POS_INIT = Buffer.from([0x1b, 0x40]); // ESC @ (Inicializa impressora)
const ESC_POS_CUT = Buffer.from([0x1d, 0x56, 0x41, 0x03]); // GS V 65 3 (Alimenta e corta papel)
const ESC_POS_LINE_FEED = Buffer.from([0x0a, 0x0a, 0x0a]); // 3 Quebras de linha

// Definição C# para P/Invoke nativo em winspool.drv no Windows (Envio RAW de alta fidelidade ao Spooler)
const WIN32_RAW_PRINTER_HELPER = `
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.ComponentModel;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendFileToPrinter(string szPrinterName, string szFileName) {
        if (string.IsNullOrEmpty(szPrinterName)) {
            throw new ArgumentNullException("szPrinterName");
        }
        if (!File.Exists(szFileName)) {
            throw new FileNotFoundException("Arquivo de impressao nao encontrado", szFileName);
        }

        byte[] bytes = File.ReadAllBytes(szFileName);
        if (bytes == null || bytes.Length == 0) {
            return;
        }

        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOW di = new DOCINFOW();
        di.pDocName = "SilentPrint Spooler Job";
        di.pDataType = "RAW";

        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            int err = Marshal.GetLastWin32Error();
            throw new Win32Exception(err, string.Format("Falha ao abrir impressora '{0}' no Spooler do Windows (Código Win32: {1})", szPrinterName, err));
        }

        try {
            if (!StartDocPrinter(hPrinter, 1, di)) {
                int err = Marshal.GetLastWin32Error();
                throw new Win32Exception(err, string.Format("Falha ao iniciar documento RAW no Spooler (Código Win32: {0})", err));
            }

            try {
                if (!StartPagePrinter(hPrinter)) {
                    int err = Marshal.GetLastWin32Error();
                    throw new Win32Exception(err, string.Format("Falha ao iniciar pagina RAW no Spooler (Código Win32: {0})", err));
                }

                try {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    try {
                        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                        int dwWritten = 0;
                        if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten) || dwWritten != bytes.Length) {
                            int err = Marshal.GetLastWin32Error();
                            throw new Win32Exception(err, string.Format("Falha ao gravar bytes na impressora (Código Win32: {0})", err));
                        }
                    } finally {
                        Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    }
                } finally {
                    EndPagePrinter(hPrinter);
                }
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
`;

const POWERSHELL_RAW_PRINT_SCRIPT = `param(
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [Parameter(Mandatory=$true)][string]$FilePath
)
$ErrorActionPreference = 'Stop'
$code = @'
${WIN32_RAW_PRINTER_HELPER}
'@
if (-not ([System.Management.Automation.PSTypeName]'RawPrinterHelper').Type) {
    Add-Type -TypeDefinition $code -ErrorAction Stop
}
try {
    [RawPrinterHelper]::SendFileToPrinter($PrinterName, $FilePath)
} catch {
    $primaryError = $_.Exception.Message
    $uncPath = "\\\\localhost\\$PrinterName"
    try {
        $bytes = [System.IO.File]::ReadAllBytes($FilePath)
        [System.IO.File]::WriteAllBytes($uncPath, $bytes)
    } catch {
        throw $primaryError
    }
}
`;

// Lista branca efêmera de arquivos temporários autorizados a carregar na BrowserWindow de impressão
const allowedTempFileUrls = new Set<string>();
let printSessionConfigured = false;

function getIsolatedPrintSession(): Electron.Session {
  const printSession = session.fromPartition('print-sandbox', { cache: false });
  if (!printSessionConfigured) {
    printSessionConfigured = true;
    printSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
    printSession.setPermissionCheckHandler(() => false);
    // SEC-05: Bloqueia qualquer acesso de rede externo (SSRF) ou leitura de arquivo local não autorizado (LFI)
    printSession.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url;
      if (url.startsWith('data:') || url === 'about:blank') {
        callback({ cancel: false });
        return;
      }
      if (url.startsWith('file://') && allowedTempFileUrls.has(url)) {
        callback({ cancel: false });
        return;
      }
      callback({ cancel: true });
    });
  }
  return printSession;
}

function assertSafePrinterName(printerName: string): void {
  if (
    !printerName ||
    printerName.length > 128 ||
    /[\x00-\x1F\x7F]/.test(printerName) ||
    printerName.trim().startsWith('-')
  ) {
    throw new Error('Nome de impressora inválido ou contém caracteres proibidos.');
  }
}

function escapeHtmlEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class PrintEngine {
  private activeJobsCount = 0;
  private lastPrintTimestamp = 0;

  isBusy(): boolean {
    return this.activeJobsCount > 0;
  }

  getLastPrintTimestamp(): number {
    return this.lastPrintTimestamp;
  }

  /**
   * Ponto de entrada universal e agnóstico para impressão silenciosa.
   */
  async print(job: PrintJobPayload): Promise<void> {
    this.activeJobsCount++;
    try {
      const printers = await discoverPrinters();
      const targetPrinterName = job.printerName || agentStore.getDefaultPrinter() || printers.find((p) => p.isDefault)?.name || printers[0]?.name;

      if (!targetPrinterName) {
        throw new Error('Nenhuma impressora especificada e nenhuma impressora encontrada no agente.');
      }

      const printer = printers.find((p) => p.name.toLowerCase() === targetPrinterName.toLowerCase());

      if (!printer) {
        throw new Error(`Impressora "${targetPrinterName}" não foi encontrada no agente (verifique se foi excluída ou renomeada).`);
      }

      assertSafePrinterName(printer.name);

      console.log(`🖨️ [PrintEngine] Executando job ${job.jobId} na impressora "${printer.name}" (${printer.type}) - Formato: ${job.type}`);

      if (printer.type === 'VIRTUAL' || printer.name.includes('Virtual')) {
        console.log(`✨ [PrintEngine] [Simulador Virtual] Processando impressão: "${job.title || job.jobId}" (${job.type})`);
        await new Promise((resolve) => setTimeout(resolve, 600));
        console.log(`✅ [PrintEngine] [Simulador Virtual] Trabalho #${job.jobId} finalizado com sucesso!`);
        return;
      }

      // Intercepta impressoras virtuais de documentos (ex: Microsoft Print to PDF, XPS Document Writer)
      // No Windows, essas impressoras operam na porta PORTPROMPT: e descartam jobs silenciosos.
      if (this.isVirtualDocumentPrinter(printer.name)) {
        await this.handleVirtualDocumentPrint(printer, job);
        return;
      }

      switch (job.type) {
        case 'RAW':
        case 'TEXT':
          await this.printRawOrText(printer, job.content, job.type, job.options);
          break;

        case 'PDF':
          await this.printPdf(printer, job.content, job.options);
          break;

        case 'IMAGE':
          await this.printImage(printer, job.content, job.options);
          break;

        case 'HTML':
          await this.printHtml(printer, job.content, job.options);
          break;

        default:
          throw new Error(`Tipo de conteúdo não suportado: ${(job as any).type}`);
      }
    } finally {
      this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
      this.lastPrintTimestamp = Date.now();
    }
  }

  /**
   * Imprime RAW (ESC/POS) ou TEXT diretamente via TCP :9100 ou Spooler do SO
   */
  private async printRawOrText(
    printer: PrinterInfo,
    content: string,
    type: 'RAW' | 'TEXT',
    options?: PrintJobOptions
  ): Promise<void> {
    let buffer: Buffer;

    if (type === 'RAW') {
      // Tenta decodificar de Base64 se parecer Base64, senão usa UTF-8
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(content.trim()) && content.trim().length % 4 === 0;
      if (isBase64) {
        buffer = Buffer.from(content, 'base64');
      } else {
        buffer = Buffer.from(content, 'utf-8');
      }
    } else {
      // TEXT puro
      buffer = Buffer.from(content, 'utf-8');
    }

    // 1. Envio Direto via Rede TCP/IP (ex: porta 9100)
    if (printer.type === 'NETWORK_TCP' && printer.host) {
      const port = printer.port || 9100;
      // SEC-08: Revalida destino TCP antes de abrir socket
      const validTarget = validateTcpPrinterTarget(printer.name, printer.host, port);
      await this.sendToTcpSocket(validTarget.host, validTarget.port, buffer, options?.cut !== false);
      return;
    }

    // 2. Envio via Spooler do Sistema Operacional
    await this.sendToOsSpoolerRaw(printer.name, buffer, options);
  }

  /**
   * Envia buffer bruto diretamente para porta TCP da impressora térmica (ex: 9100)
   */
  private sendToTcpSocket(host: string, port: number, rawData: Buffer, shouldCut: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket({ allowHalfOpen: true });
      let isDone = false;

      socket.setTimeout(15000);

      const fail = (err: Error) => {
        if (!isDone) {
          isDone = true;
          socket.destroy();
          reject(err);
        }
      };

      const success = () => {
        if (!isDone) {
          isDone = true;
          socket.destroy();
          resolve();
        }
      };

      socket.on('timeout', () => {
        fail(new Error(`Timeout ao conectar à impressora TCP em ${host}:${port}`));
      });

      socket.on('error', (err) => {
        fail(new Error(`Erro de conexão com impressora de rede (${host}:${port}): ${err.message}`));
      });

      socket.on('end', () => {
        // Dispositivo remoto encerrou a transmissão (impressão física concluída)
        success();
      });

      socket.on('close', (hadError) => {
        if (hadError) {
          fail(new Error(`Conexão com a impressora TCP (${host}:${port}) foi interrompida com erro de hardware.`));
        } else {
          success();
        }
      });

      socket.connect(port, host, () => {
        try {
          const chunks: Buffer[] = [ESC_POS_INIT, rawData];
          if (shouldCut) {
            chunks.push(ESC_POS_LINE_FEED, ESC_POS_CUT);
          }
          const payload = Buffer.concat(chunks);

          socket.write(payload, () => {
            // Half-close: encerra escrita e aguarda o dispositivo remoto confirmar e fechar
            socket.end();
          });
        } catch (err: any) {
          fail(err);
        }
      });
    });
  }

  /**
   * Envia buffer RAW para o spooler do SO sem exibir janelas ou diálogos
   */
  private async sendToOsSpoolerRaw(printerName: string, buffer: Buffer, options?: PrintJobOptions): Promise<void> {
    assertSafePrinterName(printerName);
    const jobUuid = crypto.randomUUID();
    const tempFile = path.join(os.tmpdir(), `silentprint_raw_${jobUuid}.bin`);
    const tempPs1 = path.join(os.tmpdir(), `silentprint_spooler_${jobUuid}.ps1`);

    try {
      // Se solicitado corte e for buffer simples, concatena corte
      let finalBuffer = buffer;
      if (options?.cut !== false) {
        finalBuffer = Buffer.concat([buffer, ESC_POS_LINE_FEED, ESC_POS_CUT]);
      }

      // SEC-10: Permissão 0600 (somente leitura/escrita pelo dono do processo)
      await fs.promises.writeFile(tempFile, finalBuffer, { mode: 0o600 });

      if (process.platform === 'win32') {
        // SEC-03: Executa script .ps1 estático via -File passando printerName e tempFile como parâmetros literais,
        // eliminando 100% qualquer interpolação ou concatenação de comandos no PowerShell.
        // O RawPrinterHelper utiliza P/Invoke direto em winspool.drv (OpenPrinterW/StartDocPrinterW com pDataType="RAW")
        // garantindo envio de bytes brutos (ESC/POS e texto) para o Spooler do Windows em qualquer impressora (USB, Rede ou COM)
        // sem exigir compartilhamento de rede SMB.
        await fs.promises.writeFile(tempPs1, POWERSHELL_RAW_PRINT_SCRIPT, { encoding: 'utf8', mode: 0o600 });
        try {
          await execFileAsync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tempPs1, printerName, tempFile],
            {
              windowsHide: true,
              timeout: 20000,
            }
          );
        } catch (psErr: any) {
          const rawError = psErr?.stderr?.trim() || psErr?.message || 'Falha ao despachar dados para o Spooler do Windows';
          throw new Error(`Falha no Spooler RAW do Windows para "${printerName}": ${rawError}`);
        }
      } else {
        // macOS ou Linux: lp -d "<printer>" -o raw -- "<tempFile>"
        await execFileAsync('lp', ['-d', printerName, '-o', 'raw', '--', tempFile], {
          timeout: 15000,
        });
      }
    } finally {
      // Limpeza obrigatória dos arquivos temporários
      for (const file of [tempFile, tempPs1]) {
        try {
          if (fs.existsSync(file)) {
            await fs.promises.unlink(file);
          }
        } catch {
          // ignora erro ao remover temp
        }
      }
    }
  }

  /**
   * Imprime PDF de forma 100% silenciosa
   */
  private async printPdf(printer: PrinterInfo, content: string, options?: PrintJobOptions): Promise<void> {
    assertSafePrinterName(printer.name);

    // SEC-05: Bloqueia caminhos file:// ou URLs externas vindas do payload para impedir leitura de arquivos locais
    const trimmed = content.trim();
    if (/^(file|https?|ftp|ws|wss):\/\//i.test(trimmed)) {
      throw new Error('Por motivos de segurança, o envio de PDF exige conteúdo codificado em Base64 (URLs ou caminhos locais não são permitidos).');
    }

    const base64Payload = trimmed.replace(/^data:application\/pdf;base64,/i, '');
    const isBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(base64Payload);
    const tempPdf = path.join(os.tmpdir(), `silentprint_pdf_${crypto.randomUUID()}.pdf`);

    try {
      if (isBase64) {
        await fs.promises.writeFile(tempPdf, Buffer.from(base64Payload, 'base64'), { mode: 0o600 });
      } else {
        await fs.promises.writeFile(tempPdf, Buffer.from(content, 'utf-8'), { mode: 0o600 });
      }

      await this.executeNativeOrElectronPdf(printer.name, tempPdf, options);
    } finally {
      try {
        if (fs.existsSync(tempPdf)) {
          await fs.promises.unlink(tempPdf);
        }
      } catch {
        // ignora erro ao remover temp
      }
    }
  }

  private async executeNativeOrElectronPdf(printerName: string, filePath: string, options?: PrintJobOptions): Promise<void> {
    assertSafePrinterName(printerName);
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // No macOS e Linux, lp nativo é infinitamente mais rápido e preserva fidelidade do CUPS
      const args = ['-d', printerName];
      const copies = Number(options?.copies);
      if (Number.isInteger(copies) && copies > 1 && copies <= 100) {
        args.push('-n', String(copies));
      }
      args.push('--', filePath);
      await execFileAsync('lp', args, { timeout: 15000 });
    } else {
      // Fallback Electron BrowserWindow oculta para Windows usando URL file:// autorizada temporariamente
      const fileUrl = pathToFileURL(filePath).toString();
      allowedTempFileUrls.add(fileUrl);
      try {
        await this.printViaHiddenBrowserWindow(fileUrl, printerName, options);
      } finally {
        allowedTempFileUrls.delete(fileUrl);
      }
    }
  }

  /**
   * Imprime imagem silenciosa encapsulando em HTML sem bordas
   */
  private async printImage(printer: PrinterInfo, content: string, options?: PrintJobOptions): Promise<void> {
    const trimmed = content.trim();
    // SEC-05: Permite apenas data:image/*;base64 ou Base64 puro (bloqueia file:// e http(s)://)
    let imgSrc: string;
    if (/^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(trimmed)) {
      imgSrc = trimmed;
    } else if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
      imgSrc = `data:image/png;base64,${trimmed}`;
    } else {
      throw new Error('Formato de imagem inválido. Envie a imagem codificada em Base64.');
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page {
              margin: 0;
              size: auto;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              background: transparent;
            }
            .wrapper {
              display: flex;
              justify-content: center;
              align-items: flex-start;
              width: 100%;
            }
            img {
              max-width: 100%;
              height: auto;
              display: block;
            }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <img src="${imgSrc}" />
          </div>
        </body>
      </html>
    `;

    await this.printHtml(printer, html, options);
  }

  /**
   * Imprime HTML renderizado silenciosamente em BrowserWindow oculta (show: false)
   */
  private async printHtml(printer: PrinterInfo, htmlContent: string, options?: PrintJobOptions): Promise<void> {
    const encodedHtml = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    await this.printViaHiddenBrowserWindow(encodedHtml, printer.name, options);
  }

  /**
   * Renderiza qualquer DataURL ou tempFile autorizado em BrowserWindow oculta e isolada
   */
  private printViaHiddenBrowserWindow(targetUrl: string, printerName: string, options?: PrintJobOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          session: getIsolatedPrintSession(),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          javascript: false,
          devTools: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });

      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

      let timeout: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeout);
        if (!win.isDestroyed()) {
          win.destroy();
        }
      };

      timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout de renderização da página na impressão silenciosa (15s)'));
      }, 15000);

      win.webContents.once('did-finish-load', () => {
        const copies = Number(options?.copies);
        const safeCopies = Number.isInteger(copies) && copies >= 1 && copies <= 100 ? copies : 1;

        win.webContents.print(
          {
            silent: true,
            printBackground: options?.printBackground ?? true,
            deviceName: printerName,
            copies: safeCopies,
          },
          (success, failureReason) => {
            cleanup();
            if (!success) {
              reject(new Error(`Falha ao imprimir silenciosamente: ${failureReason || 'Erro desconhecido'}`));
            } else {
              resolve();
            }
          }
        );
      });

      win.webContents.once('did-fail-load', (_, errorCode, errorDescription) => {
        cleanup();
        reject(new Error(`Falha ao carregar conteúdo para impressão: ${errorDescription} (${errorCode})`));
      });

      win.loadURL(targetUrl).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  /**
   * Dispara um teste de impressão na impressora especificada ou na padrão
   */
  async printTestJob(targetPrinterName?: string): Promise<void> {
    const printers = await discoverPrinters();
    const printerName = targetPrinterName || agentStore.getDefaultPrinter() || printers[0]?.name;

    if (!printerName) {
      throw new Error('Nenhuma impressora disponível para impressão de teste.');
    }

    const printer = printers.find((p) => p.name.toLowerCase() === printerName.toLowerCase());
    const isTcp = printer?.type === 'NETWORK_TCP';
    const isThermal =
      isTcp ||
      /caixa|cupom|balc[aã]o|cozinha|termic[ao]|thermal|pos|receipt|ticket|bematech|elgin|daruma|epson.*tm|tm-t|mp-4200|i9/i.test(printerName);

    const dateStr = escapeHtmlEntities(new Date().toLocaleString('pt-BR'));
    const hostname = escapeHtmlEntities(os.hostname());
    const safePrinterLabel = escapeHtmlEntities(printerName);

    if (isThermal) {
      // Gera layout de cupom formatado para impressora térmica (USB local ou Rede TCP)
      const text = [
        '================================',
        '        SILENTPRINT HUB         ',
        '    TESTE DE IMPRESSAO LOCAL    ',
        '================================',
        `Data/Hora: ${new Date().toLocaleString('pt-BR')}`,
        `Host: ${os.hostname()}`,
        `Impressora: ${printerName}`,
        `Tipo: ${isTcp ? 'Rede TCP (:9100)' : 'Spooler Local (Térmica)'}`,
        '--------------------------------',
        'Comunicacao direta com a impressora',
        'e Spooler realizada com SUCESSO!',
        '================================',
        '',
      ].join('\n');

      await this.print({
        jobId: `test-${Date.now()}`,
        title: 'Teste de Impressão Local (Cupom)',
        printerName,
        type: 'TEXT',
        content: text,
        options: { cut: true },
      });
    } else {
      // HTML formatado
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Teste de Impressão</title>
            <style>
              @page { margin: 10mm; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
                color: #111827;
                padding: 12px;
                max-width: 480px;
                margin: 0 auto;
                border: 2px dashed #4f46e5;
                border-radius: 8px;
              }
              h2 {
                text-align: center;
                margin: 0 0 6px 0;
                color: #4f46e5;
                font-size: 18px;
              }
              p {
                margin: 4px 0;
                font-size: 13px;
                line-height: 1.4;
              }
              .badge {
                display: inline-block;
                background: #e0e7ff;
                color: #3730a3;
                font-size: 11px;
                font-weight: bold;
                padding: 2px 6px;
                border-radius: 4px;
              }
              .divider {
                border-top: 1px dashed #cbd5e1;
                margin: 10px 0;
              }
              .footer {
                text-align: center;
                font-size: 11px;
                color: #64748b;
                margin-top: 12px;
              }
            </style>
          </head>
          <body>
            <h2>🖨️ SILENTPRINT AGENT</h2>
            <p style="text-align: center; font-weight: bold;">Teste de Impressão Silenciosa Local</p>
            <div class="divider"></div>
            <p><strong>Impressora:</strong> ${safePrinterLabel}</p>
            <p><strong>Tipo:</strong> <span class="badge">Spooler do Sistema Operacional</span></p>
            <p><strong>Computador:</strong> ${hostname}</p>
            <p><strong>Data/Hora:</strong> ${dateStr}</p>
            <div class="divider"></div>
            <p style="color: #059669; font-weight: bold; text-align: center;">
              ✓ O Motor de Impressão está configurado e respondendo normalmente!
            </p>
            <div class="footer">SilentPrint Ecosystem • Comunicação 100% Silenciosa</div>
          </body>
        </html>
      `;

      await this.print({
        jobId: `test-${Date.now()}`,
        title: 'Teste de Impressão Local',
        printerName,
        type: 'HTML',
        content: html,
        options: { cut: true },
      });
    }
  }

  /**
   * Identifica se a impressora é uma impressora virtual de arquivos do sistema (ex: Microsoft Print to PDF)
   */
  private isVirtualDocumentPrinter(name: string): boolean {
    const n = name.toLowerCase();
    return (
      n.includes('print to pdf') ||
      n.includes('xps document') ||
      n.includes('onenote') ||
      n.includes('fax')
    );
  }

  /**
   * Processa a impressão em impressoras virtuais exportando para a pasta Downloads.
   * SEC-10: Só abre o arquivo automaticamente se for um teste local ou ambiente de desenvolvimento.
   */
  private async handleVirtualDocumentPrint(printer: PrinterInfo, job: PrintJobPayload): Promise<void> {
    const downloadsFolder = app.getPath('downloads') || app.getPath('desktop') || os.tmpdir();
    const safeTitle = (job.title || 'Impressao')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .substring(0, 30);
    const timestamp = Date.now();
    const shouldAutoOpen = isDev || String(job.jobId || '').startsWith('test-');

    if (job.type === 'RAW' || job.type === 'TEXT') {
      let textContent = job.content;
      if (job.type === 'RAW') {
        const isBase64 = /^[A-Za-z0-9+/=]+$/.test(job.content.trim()) && job.content.trim().length % 4 === 0;
        if (isBase64) {
          textContent = Buffer.from(job.content, 'base64').toString('utf-8');
        }
        // Remove comandos binários ESC/POS (0x00 a 0x1F, exceto quebras de linha e tabulação)
        textContent = textContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      }

      const filePath = path.join(downloadsFolder, `SilentPrint_${safeTitle}_${timestamp}.txt`);
      await fs.promises.writeFile(filePath, textContent, { encoding: 'utf-8', mode: 0o600 });

      console.log(`📄 [PrintEngine] Impressora virtual detectada ("${printer.name}"). Arquivo salvo em: ${filePath}`);

      try {
        if (Notification.isSupported()) {
          new Notification({
            title: 'SilentPrint Agent',
            body: `Documento salvo em Downloads: ${path.basename(filePath)}`,
          }).show();
        }
        if (shouldAutoOpen) {
          await shell.openPath(filePath);
        }
      } catch (err) {
        console.warn('⚠️ Não foi possível abrir arquivo de texto automaticamente:', err);
      }
      return;
    }

    if (job.type === 'PDF') {
      const filePath = path.join(downloadsFolder, `SilentPrint_${safeTitle}_${timestamp}.pdf`);
      const trimmed = job.content.trim().replace(/^data:application\/pdf;base64,/i, '');
      const isBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && !trimmed.startsWith('http');
      if (isBase64) {
        await fs.promises.writeFile(filePath, Buffer.from(trimmed, 'base64'), { mode: 0o600 });
      } else {
        await fs.promises.writeFile(filePath, Buffer.from(job.content, 'utf-8'), { mode: 0o600 });
      }

      console.log(`📄 [PrintEngine] Impressora virtual detectada ("${printer.name}"). Arquivo PDF salvo em: ${filePath}`);

      try {
        if (Notification.isSupported()) {
          new Notification({
            title: 'SilentPrint Agent',
            body: `PDF salvo em Downloads: ${path.basename(filePath)}`,
          }).show();
        }
        if (shouldAutoOpen) {
          await shell.openPath(filePath);
        }
      } catch (err) {
        console.warn('⚠️ Não foi possível abrir PDF automaticamente:', err);
      }
      return;
    }

    let htmlToRender = '';
    if (job.type === 'HTML') {
      htmlToRender = job.content;
    } else if (job.type === 'IMAGE') {
      const trimmed = job.content.trim();
      let imgSrc: string;
      if (/^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(trimmed)) {
        imgSrc = trimmed;
      } else if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
        imgSrc = `data:image/png;base64,${trimmed}`;
      } else {
        throw new Error('Formato de imagem inválido.');
      }
      htmlToRender = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;padding:20px;text-align:center;}img{max-width:100%;height:auto;}</style></head><body><img src="${imgSrc}"/></body></html>`;
    }

    const pdfPath = path.join(downloadsFolder, `SilentPrint_${safeTitle}_${timestamp}.pdf`);
    await this.exportHtmlToPdf(htmlToRender, pdfPath);

    console.log(`📄 [PrintEngine] Impressora virtual detectada ("${printer.name}"). PDF gerado e salvo em: ${pdfPath}`);

    try {
      if (Notification.isSupported()) {
        new Notification({
          title: 'SilentPrint Agent',
          body: `Documento salvo em Downloads: ${path.basename(pdfPath)}`,
        }).show();
      }
      if (shouldAutoOpen) {
        await shell.openPath(pdfPath);
      }
    } catch (err) {
      console.warn('⚠️ Não foi possível abrir PDF automaticamente:', err);
    }
  }

  /**
   * Converte HTML em arquivo PDF usando o motor Chromium do Electron em sessão isolada.
   */
  private exportHtmlToPdf(htmlContent: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          session: getIsolatedPrintSession(),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          javascript: false,
          devTools: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });

      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

      const timeout = setTimeout(() => {
        if (!win.isDestroyed()) win.destroy();
        reject(new Error('Timeout ao gerar PDF para impressora virtual (15s)'));
      }, 15000);

      win.webContents.once('did-finish-load', async () => {
        try {
          const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
          });
          await fs.promises.writeFile(targetPath, pdfBuffer, { mode: 0o600 });
          clearTimeout(timeout);
          if (!win.isDestroyed()) win.destroy();
          resolve();
        } catch (err) {
          clearTimeout(timeout);
          if (!win.isDestroyed()) win.destroy();
          reject(err);
        }
      });

      win.webContents.once('did-fail-load', (_, errorCode, errorDescription) => {
        clearTimeout(timeout);
        if (!win.isDestroyed()) win.destroy();
        reject(new Error(`Falha ao carregar conteúdo para PDF: ${errorDescription} (${errorCode})`));
      });

      const encodedHtml = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
      win.loadURL(encodedHtml).catch((err) => {
        clearTimeout(timeout);
        if (!win.isDestroyed()) win.destroy();
        reject(err);
      });
    });
  }
}

export const printEngine = new PrintEngine();
