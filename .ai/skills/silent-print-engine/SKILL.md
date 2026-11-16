---
name: silent-print-engine
description: >-
  Playbook técnico para implementação e manutenção do Motor de Impressão Silenciosa
  no Electron (`apps/desktop`), cobrindo Spooler RAW (Windows/macOS/Linux),
  impressoras térmicas de rede TCP/IP (:9100), comandos ESC/POS e impressão gráfica
  silenciosa (PDF, Imagem e HTML).
---

# Skill: Silent Print Engine (`apps/desktop`)

Use este playbook sempre que for implementar, depurar ou expandir a descoberta de impressoras e o motor de impressão silenciosa no `apps/desktop`.

---

## 1. Descoberta Híbrida de Impressoras (`printer-discovery.ts`)

1. **Impressoras do Sistema Operacional:**
   * Usar `webContents.getPrintersAsync()` do Electron no processo `main`.
   * Mapear cada impressora para `{ name, displayName, description, status, isDefault, type: 'OS_SPOOLER' }`.
2. **Impressoras de Rede Diretas (TCP/IP `:9100`):**
   * Permitir que o usuário cadastre impressoras térmicas de rede customizadas no formato `{ name: 'Térmica Cozinha (192.168.1.200)', host: '192.168.1.200', port: 9100, type: 'NETWORK_TCP' }` salvas no `store.ts`.
   * Validar estritamente `host` e `port` via `validateTcpPrinterTarget` (permitindo rede local e loopback `localhost`/`127.0.0.1` para emuladores e testes, bloqueando metadata `169.254.*`, broadcast e portas sensíveis de sistema).
   * Mesclar as duas listas antes de enviar ao HUB nos eventos `agent:register` e `agent:heartbeat`.

---

## 2. Estratégia de Impressão por Tipo de Conteúdo (`print-engine.ts`)

### 2.1 `RAW` (ESC/POS em Base64 ou Hex) e `TEXT` (Texto Puro)
* **Se a impressora destino for `NETWORK_TCP` (`host:port`):**
  * Revalidar `host:port` com `validateTcpPrinterTarget`, abrir socket `net.Socket()`, conectar em `host:port` (timeout 15s), enviar o `Buffer` bruto (acrescentando sequência de inicialização ESC/POS `0x1B 0x40` e corte de papel `0x1D 0x56 0x41 0x03` caso `options.cut !== false`) e aguardar o encerramento gracioso.
* **Se a impressora destino for `OS_SPOOLER`:**
  * Validar o nome da impressora (`assertSafePrinterName`: sem caracteres de controle e sem iniciar com `-`) e gravar o arquivo temporário com `crypto.randomUUID()` e permissão restrita `{ mode: 0o600 }`.
  * **macOS / Linux:** Executar `execFileAsync('lp', ['-d', printerName, '-o', 'raw', '--', tempFile])`, removendo o arquivo temporário no `finally`.
  * **Windows (Zero Command Injection):** Executar `powershell.exe` com P/Invoke de `winspool.drv` (`RawPrinterHelper`: `OpenPrinterW`, `StartDocPrinterW` com `pDataType="RAW"`, `WritePrinter`) passando `printerName` e `tempFile` exclusivamente como **argumentos posicionais** (`$args[0]` e `$args[1]`), garantindo envio de bytes diretos para qualquer impressora USB, Rede ou COM local sem depender de compartilhamento de rede SMB (`\\localhost\...`). Fallback para escrita direta SMB caso a impressora esteja compartilhada. Nunca usar `print.exe` (que mascara erros).

### 2.2 `HTML`, `IMAGE` (Apenas Base64) e `PDF` (Apenas Base64)
* **Proibição de LFI / SSRF:** Nunca aceitar caminhos `file://` nem URLs `http(s)://` vindos de payloads externos para `PDF` ou `IMAGE`. Exigir conteúdo codificado em Base64.
* Criar uma janela `BrowserWindow` oculta com sessão isolada (`session: getIsolatedPrintSession()`, `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `javascript: false`, `devTools: false`), onde `webRequest.onBeforeRequest` bloqueia qualquer acesso de rede externo ou leitura de arquivos locais não listados em `allowedTempFileUrls`.
* Carregar o conteúdo:
  * **HTML:** Data URL `data:text/html;charset=utf-8,...`.
  * **IMAGE:** Validar Base64 (`data:image/(png|jpeg|jpg|gif|webp|bmp);base64,...`) e gerar um wrapper HTML sem margens.
  * **PDF:**
    * Gravar o buffer decodificado em arquivo temporário com `{ mode: 0o600 }`.
    * No macOS/Linux: Usar `execFileAsync('lp', ['-d', printerName, '--', tempPdfPath])`.
    * No Windows: Autorizar temporariamente o `pathToFileURL(tempPdfPath)` na whitelist `allowedTempFileUrls` e imprimir via `BrowserWindow` oculta.
* **Limpeza Obrigatória:** Sempre destruir a `BrowserWindow` oculta (`win.destroy()`), limpar a whitelist temporária e apagar arquivos temporários no bloco `finally`.
