import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import { printEngine } from './print-engine';
import { agentStore, isDev, appVersion, validateHubUrl } from './store';
import { UpdateInfo, UpdateStatus } from '../types';

const execFileAsync = promisify(execFile);
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

function isVersionNewer(remoteVersion: string, currentVersion: string): boolean {
  const clean = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const [rMaj = 0, rMin = 0, rPatch = 0] = clean(remoteVersion);
  const [cMaj = 0, cMin = 0, cPatch = 0] = clean(currentVersion);
  if (rMaj !== cMaj) return rMaj > cMaj;
  if (rMin !== cMin) return rMin > cMin;
  return rPatch > cPatch;
}

function fetchTextUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (!isDev && parsed.protocol !== 'https:') {
      reject(new Error('Manifesto de atualização bloqueado: protocolo inseguro (HTTP).'));
      return;
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'SilentPrint-Desktop-Agent' }, timeout: 10000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const redirectUrl = new URL(res.headers.location, url).toString();
        fetchTextUrl(redirectUrl).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} ao consultar manifesto de atualização.`));
        return;
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1024 * 256) {
          req.destroy();
          reject(new Error('Manifesto de atualização excedeu o tamanho máximo permitido.'));
        }
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout ao consultar manifesto de atualização.'));
    });
  });
}

async function computeFileSha512Base64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('base64')));
    stream.on('error', reject);
  });
}

function parseMacManifestYaml(yamlContent: string, fallbackVersion?: string): {
  version: string | null;
  releaseDate?: string;
  zipFileName: string | null;
  sha512: string | null;
} {
  const versionMatch = yamlContent.match(/^version:\s*['"]?([^\s'"]+)['"]?\s*$/m);
  const version = versionMatch?.[1]?.trim() || fallbackVersion || null;

  const releaseDateMatch = yamlContent.match(/^releaseDate:\s*['"]?([^\r\n'"]+)['"]?\s*$/m);
  const releaseDate = releaseDateMatch?.[1]?.trim();

  const pathMatch = yamlContent.match(/^path:\s*['"]?([^\r\n'"]+\.zip)['"]?\s*$/im);
  const urlZipMatch = yamlContent.match(/url:\s*['"]?([^\r\n'"]+\.zip)['"]?\s*$/im);
  const zipFileName =
    pathMatch?.[1]?.trim() ||
    urlZipMatch?.[1]?.trim() ||
    (version ? `SilentPrint-Agent-${version}-arm64-mac.zip` : null);

  let sha512: string | null = null;
  if (zipFileName) {
    const escapedFile = zipFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(`url:\\s*['"]?${escapedFile}['"]?[\\s\\S]*?sha512:\\s*([A-Za-z0-9+/=]+)`, 'i');
    const blockMatch = yamlContent.match(blockRegex);
    if (blockMatch?.[1]) {
      sha512 = blockMatch[1].trim();
    }
  }
  if (!sha512) {
    const topLevelMatch = yamlContent.match(/^sha512:\s*([A-Za-z0-9+/=]+)\s*$/m);
    if (topLevelMatch?.[1]) {
      sha512 = topLevelMatch[1].trim();
    }
  }

  return { version, releaseDate, zipFileName, sha512 };
}

export class UpdateManager {
  private status: UpdateStatus = 'IDLE';
  private availableVersion: string | null = null;
  private releaseDate?: string;
  private releaseNotes?: string;
  private downloadProgress = 0;
  private lastError: string | null = null;
  private macDownloadedZipPath: string | null = null;
  private macExpectedZipName: string | null = null;
  private macExpectedSha512: string | null = null;
  private suppressNextAvailablePrompt = false;
  private listeners: Array<(info: UpdateInfo) => void> = [];
  private promptListeners: Array<(data: { type: 'CONFIRM_DOWNLOAD' | 'CONFIRM_RESTART'; version: string; countdownSeconds?: number }) => void> = [];
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    // No macOS usamos o atualizador atômico direto (via ditto + codesign),
    // evitando completamente o Squirrel.Mac (ShipIt) nativo.
    if (process.platform !== 'darwin') {
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowPrerelease = false;

      autoUpdater.logger = {
        info: (msg: any) => console.log(`📦 [AutoUpdater]`, msg),
        warn: (msg: any) => console.warn(`⚠️ [AutoUpdater]`, msg),
        error: (msg: any) => console.error(`❌ [AutoUpdater]`, msg),
        debug: (msg: any) => console.debug(`🔍 [AutoUpdater]`, msg),
      };
    }
  }

  public init(): void {
    if (isDev) {
      console.log('ℹ️ [UpdateManager] Modo de desenvolvimento: AutoUpdater desativado.');
      return;
    }

    if (process.platform !== 'darwin') {
      try {
        const hubUrl = validateHubUrl(agentStore.getHubUrl());
        const feedUrl = `${hubUrl}/api/downloads/updates/win`;
        console.log(`🔗 [UpdateManager] Configurando feed seguro de atualizações via Hub: ${feedUrl}`);
        autoUpdater.setFeedURL({
          provider: 'generic',
          url: feedUrl,
        });
      } catch (err: any) {
        console.warn('⚠️ [UpdateManager] Falha ao configurar feed URL do autoUpdater:', err.message);
      }

      this.setupWindowsListeners();
    }

    this.setupCanaryWatchdog();

    // Primeira checagem após 15 segundos do boot
    setTimeout(() => {
      this.checkForUpdates().catch((err) =>
        console.warn('⚠️ [UpdateManager] Falha na checagem inicial de updates:', err.message)
      );
    }, 15000);

    // Checagem periódica a cada 4 horas
    this.checkInterval = setInterval(() => {
      this.checkForUpdates().catch((err) =>
        console.warn('⚠️ [UpdateManager] Falha na checagem periódica de updates:', err.message)
      );
    }, 1000 * 60 * 60 * 4);
  }

  private setupWindowsListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      this.status = 'CHECKING';
      this.lastError = null;
      this.notifyListeners();
    });

    autoUpdater.on('update-available', (info) => {
      this.status = 'AVAILABLE';
      this.availableVersion = info.version;
      this.releaseDate = info.releaseDate;
      this.releaseNotes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      console.log(`🎉 [UpdateManager] Nova versão disponível: ${info.version}`);
      this.notifyListeners();
      if (!this.suppressNextAvailablePrompt) {
        this.triggerUpdatePrompt('CONFIRM_DOWNLOAD', info.version);
      }
      this.suppressNextAvailablePrompt = false;
    });

    autoUpdater.on('update-not-available', () => {
      this.suppressNextAvailablePrompt = false;
      this.status = 'IDLE';
      this.availableVersion = null;
      console.log(`✅ [UpdateManager] SilentPrint está atualizado na versão ${app.getVersion()}`);
      this.notifyListeners();
    });

    autoUpdater.on('download-progress', (progress) => {
      const nextProgress = Math.min(100, Math.round(progress.percent));
      if (this.status !== 'DOWNLOADING' || nextProgress !== this.downloadProgress) {
        this.status = 'DOWNLOADING';
        this.downloadProgress = nextProgress;
        this.notifyListeners();
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.status = 'DOWNLOADED';
      this.availableVersion = info.version;
      this.downloadProgress = 100;
      console.log(`💾 [UpdateManager] Atualização ${info.version} baixada e pronta para instalação!`);
      this.notifyListeners();
      // Solicita confirmação de reinicialização com contador de 20s
      this.triggerUpdatePrompt('CONFIRM_RESTART', info.version, 20);
    });

    autoUpdater.on('error', (err) => {
      this.suppressNextAvailablePrompt = false;
      this.status = 'ERROR';
      this.lastError = err?.message || 'Erro desconhecido ao verificar atualizações';
      console.warn(`⚠️ [UpdateManager] Erro no fluxo de atualização:`, this.lastError);
      this.notifyListeners();
    });
  }

  /**
   * Watchdog / Canary Boot:
   * Monitora se o agente inicializa e permanece estável por pelo menos 30 segundos.
   * Se crashear 3 vezes consecutivas após um update, ativa o modo de alerta.
   */
  private setupCanaryWatchdog(): void {
    const currentVersion = appVersion;
    const lastVersion = agentStore.getLastInstalledVersion();
    const attempts = agentStore.getBootAttempts();

    if (lastVersion && lastVersion !== currentVersion) {
      console.log(`🚀 [UpdateManager] Nova versão em execução: ${currentVersion} (Versão prévia: ${lastVersion})`);
      agentStore.setBootAttempts(attempts + 1);

      if (attempts >= 2) {
        console.error(`🚨 [UpdateManager] ALERTA DE CRASH LOOP: A versão ${currentVersion} falhou ${attempts + 1} vezes.`);
      }
    } else if (!lastVersion) {
      agentStore.setLastInstalledVersion(currentVersion);
    }

    // Marca como estável após 30 segundos contínuos de execução
    setTimeout(() => {
      console.log(`✅ [UpdateManager] Versão ${currentVersion} confirmada e estável.`);
      agentStore.setStableVersion(currentVersion);
      agentStore.setLastInstalledVersion(currentVersion);
      agentStore.setBootAttempts(0);
    }, 30000);
  }

  /**
   * Trava de segurança:
   * Retorna true apenas se a impressora não estiver imprimindo
   * E se o tempo desde o último trabalho for superior a minIdleSeconds.
   */
  public canSafelyRestart(minIdleSeconds = 60): boolean {
    if (printEngine.isBusy()) {
      console.warn(`🛑 [UpdateManager] Reinício bloqueado: há trabalhos de impressão sendo processados.`);
      return false;
    }

    const lastPrint = printEngine.getLastPrintTimestamp();
    if (lastPrint > 0) {
      const elapsedSeconds = (Date.now() - lastPrint) / 1000;
      if (elapsedSeconds < minIdleSeconds) {
        console.warn(`⏳ [UpdateManager] Reinício adiado: última impressão ocorreu há apenas ${Math.round(elapsedSeconds)}s (mínimo: ${minIdleSeconds}s).`);
        return false;
      }
    }

    return true;
  }

  /**
   * Dispara a checagem manual ou programada
   */
  public async checkForUpdates(options?: { silentPrompt?: boolean }): Promise<UpdateInfo> {
    if (!app.isPackaged || isDev) {
      console.log('ℹ️ [UpdateManager] Modo de desenvolvimento: pulando checagem remota do autoUpdater.');
      return this.getInfo();
    }

    if (process.platform === 'darwin') {
      return await this.checkMacUpdatesDirectly(options?.silentPrompt ?? false);
    }

    try {
      this.suppressNextAvailablePrompt = Boolean(options?.silentPrompt);
      const hubUrl = validateHubUrl(agentStore.getHubUrl());
      const feedUrl = `${hubUrl}/api/downloads/updates/win`;
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: feedUrl,
      });

      await autoUpdater.checkForUpdates();
    } catch (err: any) {
      this.suppressNextAvailablePrompt = false;
      this.status = 'ERROR';
      this.lastError = err?.message || 'Falha ao buscar atualizações';
      this.notifyListeners();
    }

    return this.getInfo();
  }

  private async checkMacUpdatesDirectly(silentPrompt = false): Promise<UpdateInfo> {
    try {
      this.status = 'CHECKING';
      this.lastError = null;
      this.notifyListeners();

      const hubUrl = validateHubUrl(agentStore.getHubUrl());
      const manifestUrl = `${hubUrl}/api/downloads/updates/mac/latest-mac.yml`;
      const manifestYaml = await fetchTextUrl(manifestUrl);
      const parsed = parseMacManifestYaml(manifestYaml);

      if (!parsed.version || !SEMVER_REGEX.test(parsed.version)) {
        throw new Error('Versão inválida no manifesto latest-mac.yml.');
      }

      const currentVersion = app.getVersion();
      if (isVersionNewer(parsed.version, currentVersion)) {
        this.status = 'AVAILABLE';
        this.availableVersion = parsed.version;
        this.releaseDate = parsed.releaseDate;
        this.macExpectedZipName = parsed.zipFileName;
        this.macExpectedSha512 = parsed.sha512;
        console.log(`🎉 [UpdateManager] Nova versão macOS disponível: v${parsed.version} (atual: v${currentVersion})`);
        this.notifyListeners();

        if (!silentPrompt) {
          this.triggerUpdatePrompt('CONFIRM_DOWNLOAD', parsed.version);
        }
      } else {
        this.status = 'IDLE';
        this.availableVersion = null;
        console.log(`✅ [UpdateManager] SilentPrint macOS está atualizado na versão v${currentVersion}`);
        this.notifyListeners();
      }
    } catch (err: any) {
      this.status = 'ERROR';
      this.lastError = err?.message || 'Falha ao buscar atualizações no Hub';
      console.warn('⚠️ [UpdateManager] Erro ao consultar manifesto macOS:', this.lastError);
      this.notifyListeners();
    }

    return this.getInfo();
  }

  /**
   * Fluxo automatizado acionado pelo Hub (agent:trigger_update):
   * 1. Verifica a versão mais recente no Hub
   * 2. Inicia o download imediatamente em segundo plano
   * 3. Ao concluir o download, abre o modal de confirmação (20s / Reiniciar Agora)
   */
  public async triggerRemoteUpdate(): Promise<void> {
    if (!app.isPackaged || isDev) {
      return;
    }

    if (this.status === 'DOWNLOADED') {
      this.triggerUpdatePrompt('CONFIRM_RESTART', this.availableVersion || undefined, 20);
      return;
    }

    if (this.status === 'DOWNLOADING') {
      return;
    }

    this.markCheckingFromRemote();
    const info = await this.checkForUpdates({ silentPrompt: true });

    if (info.status === 'AVAILABLE' && info.availableVersion) {
      await this.downloadUpdate();
    }
  }

  /**
   * Aplica a atualização com garantias de segurança contra interrupção de PDV.
   * - force: se true, ignora o tempo de ociosidade (usado se solicitado explicitamente pelo operador).
   */
  public async applyUpdate(force = false): Promise<{ success: boolean; reason?: string }> {
    if (this.status !== 'DOWNLOADED') {
      return { success: false, reason: 'Nenhuma atualização pronta para ser aplicada.' };
    }

    if (!force && !this.canSafelyRestart()) {
      return {
        success: false,
        reason: 'A impressora está em uso ou esteve ativa nos últimos instantes. A atualização foi adiada para momento ocioso.',
      };
    }

    if (process.platform === 'darwin') {
      return await this.applyMacAtomicUpdate();
    }

    console.log(`🔄 [UpdateManager] Iniciando aplicação atômica da versão ${this.availableVersion}...`);

    try {
      // Salva estado antes de reiniciar
      agentStore.setLastInstalledVersion(this.availableVersion || app.getVersion());

      // Executa fechamento e reinstalação silenciosa no Windows (NSIS)
      autoUpdater.quitAndInstall(false, true);
      return { success: true };
    } catch (err: any) {
      console.error('❌ [UpdateManager] Erro ao executar quitAndInstall:', err);
      return { success: false, reason: err?.message || 'Falha ao reiniciar para atualização.' };
    }
  }

  private async applyMacAtomicUpdate(): Promise<{ success: boolean; reason?: string }> {
    try {
      const zipPath = this.macDownloadedZipPath;
      if (!zipPath || !fs.existsSync(zipPath)) {
        return { success: false, reason: 'Arquivo de atualização zip não encontrado.' };
      }

      const tempDir = os.tmpdir();
      const extractDir = path.join(tempDir, `silentprint_update_${crypto.randomUUID()}`);
      fs.mkdirSync(extractDir, { recursive: true, mode: 0o700 });

      console.log(`📦 [UpdateManager] Extraindo atualização para ${extractDir}...`);
      // SEC-04: Usa execFile (sem shell) para descompactar com ditto preservando integridade
      await execFileAsync('ditto', ['-xk', '--', zipPath, extractDir], { timeout: 60000 });

      // Localiza o .app extraído e valida contra path traversal ou metacaracteres
      const files = fs.readdirSync(extractDir);
      const appName = files.find((f) => f.endsWith('.app'));
      if (
        !appName ||
        appName.includes('/') ||
        appName.includes('\\') ||
        appName.includes('..') ||
        /[\x00-\x1F\x7F]/.test(appName)
      ) {
        throw new Error('Nenhum pacote .app válido encontrado no arquivo baixado.');
      }

      const newAppPath = path.join(extractDir, appName);
      if (!fs.existsSync(path.join(newAppPath, 'Contents', 'MacOS'))) {
        throw new Error('Estrutura do pacote .app extraído está incompleta.');
      }

      // Remove quarentena e garante assinatura ad-hoc íntegra no bundle extraído antes da troca
      await execFileAsync('xattr', ['-cr', newAppPath]).catch(() => {});
      await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', newAppPath]).catch(() => {});
      await execFileAsync('codesign', [
        '--force',
        '--sign',
        '-',
        '-r=designated => identifier "com.silentprint.desktop"',
        newAppPath,
      ]).catch(() => {});

      // Caminho atual da aplicação instalada (ex: /Applications/SilentPrint Agent.app)
      const currentExecPath = process.execPath;
      const appBundleMatch = currentExecPath.match(/^(.+?\.app)(\/.*)?$/);
      let targetAppPath = appBundleMatch ? appBundleMatch[1] : '/Applications/SilentPrint Agent.app';
      if (targetAppPath.startsWith('/Volumes/') || targetAppPath.includes('/AppTranslocation/')) {
        targetAppPath = '/Applications/SilentPrint Agent.app';
      }

      console.log(`🚀 [UpdateManager] Substituindo ${targetAppPath} por ${newAppPath}...`);

      // SEC-04: Passa caminhos e PID exclusivamente como argumentos posicionais ($1, $2, $3, $4, $5)
      // eliminando 100% qualquer risco de Command Injection no bash.
      const script = `
        for i in $(seq 1 40); do
          if ! kill -0 "$5" 2>/dev/null; then
            break
          fi
          sleep 0.25
        done
        sleep 0.5
        rm -rf -- "$1"
        ditto -- "$2" "$1" 2>/dev/null || mv -f -- "$2" "$1"
        xattr -cr "$1" 2>/dev/null || true
        open -n -- "$1" 2>/dev/null || open -- "$1"
        rm -rf -- "$3" "$4"
      `;

      spawn(
        '/bin/bash',
        ['-c', script, 'silentprint-updater', targetAppPath, newAppPath, extractDir, zipPath, String(process.pid)],
        {
          detached: true,
          stdio: 'ignore',
        }
      ).unref();

      // Salva estado antes de fechar e encerra o processo de forma determinística
      agentStore.setLastInstalledVersion(this.availableVersion || app.getVersion());
      setTimeout(() => {
        app.quit();
        setTimeout(() => {
          app.exit(0);
        }, 800);
      }, 150);

      return { success: true };
    } catch (err: any) {
      console.error('❌ [UpdateManager] Falha na substituição atômica macOS:', err);
      this.status = 'ERROR';
      this.lastError = err?.message || 'Falha ao aplicar atualização no macOS.';
      this.notifyListeners();
      return { success: false, reason: this.lastError || undefined };
    }
  }

  public async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!app.isPackaged || isDev) {
      return { success: false, error: 'Download indisponível em modo de desenvolvimento.' };
    }

    if (process.platform === 'darwin') {
      return await this.downloadMacZipDirectly();
    }

    try {
      console.log(`⬇️ [UpdateManager] Iniciando download manual da versão ${this.availableVersion || 'mais recente'}...`);
      this.status = 'DOWNLOADING';
      this.downloadProgress = 0;
      this.notifyListeners();
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      console.error('❌ [UpdateManager] Erro ao baixar atualização:', err);
      this.status = 'ERROR';
      this.lastError = err?.message || 'Falha ao baixar atualização';
      this.notifyListeners();
      return { success: false, error: this.lastError || undefined };
    }
  }

  private async downloadMacZipDirectly(): Promise<{ success: boolean; error?: string }> {
    let tempZipPath: string | null = null;
    try {
      this.status = 'DOWNLOADING';
      this.downloadProgress = 0;
      this.lastError = null;
      this.notifyListeners();

      const hubUrl = validateHubUrl(agentStore.getHubUrl());
      const manifestUrl = `${hubUrl}/api/downloads/updates/mac/latest-mac.yml`;

      // SEC-04: Consulta manifesto latest-mac.yml para obter nome do arquivo e assinatura SHA-512 esperada
      const manifestYaml = await fetchTextUrl(manifestUrl);
      const parsed = parseMacManifestYaml(manifestYaml, this.availableVersion || undefined);

      const version = (parsed.version || this.availableVersion || '').trim();
      if (!SEMVER_REGEX.test(version)) {
        throw new Error('Formato de versão inválido para download de atualização.');
      }

      this.availableVersion = version;
      const fileName = parsed.zipFileName || this.macExpectedZipName || `SilentPrint-Agent-${version}-arm64-mac.zip`;
      const expectedSha512 = parsed.sha512 || this.macExpectedSha512;
      if (!expectedSha512) {
        throw new Error('Assinatura criptográfica SHA-512 ausente no manifesto de atualização.');
      }

      const downloadUrl = `${hubUrl}/api/downloads/updates/mac/${encodeURIComponent(fileName)}`;
      tempZipPath = path.join(os.tmpdir(), `silentprint-${version}-${crypto.randomUUID()}.zip`);

      console.log(`⬇️ [UpdateManager] Baixando pacote macOS diretamente via Hub: ${downloadUrl}`);

      const targetZip = tempZipPath;
      await new Promise<void>((resolve, reject) => {
        const fileStream = fs.createWriteStream(targetZip, { mode: 0o600 });

        const makeRequest = (targetUrl: string) => {
          const parsedTarget = new URL(targetUrl);
          if (!isDev && parsedTarget.protocol !== 'https:') {
            reject(new Error('Download de atualização bloqueado: redirecionamento inseguro (HTTP).'));
            return;
          }

          const client = targetUrl.startsWith('https') ? https : http;
          client
            .get(targetUrl, { headers: { 'User-Agent': 'SilentPrint-Desktop-Agent' } }, (res) => {
              if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                const redirectUrl = new URL(res.headers.location, targetUrl).toString();
                makeRequest(redirectUrl);
                return;
              }

              if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`Erro HTTP ${res.statusCode} ao baixar atualização.`));
                return;
              }

              const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
              let downloadedBytes = 0;

              res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                  const nextProgress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
                  if (nextProgress !== this.downloadProgress) {
                    this.downloadProgress = nextProgress;
                    this.notifyListeners();
                  }
                }
              });

              res.pipe(fileStream);

              fileStream.on('finish', () => {
                fileStream.close();
                resolve();
              });
            })
            .on('error', (err) => {
              fs.unlink(targetZip, () => {});
              reject(err);
            });
        };

        makeRequest(downloadUrl);
      });

      // SEC-04: Verifica integridade SHA-512 do pacote zip baixado antes de autorizar instalação
      const actualSha512 = await computeFileSha512Base64(targetZip);
      if (actualSha512 !== expectedSha512) {
        await fs.promises.unlink(targetZip).catch(() => {});
        throw new Error('Falha na verificação de integridade SHA-512 da atualização. O arquivo foi descartado.');
      }

      this.macDownloadedZipPath = targetZip;
      this.status = 'DOWNLOADED';
      this.downloadProgress = 100;
      console.log(`💾 [UpdateManager] Pacote macOS baixado e verificado (SHA-512 OK) em: ${targetZip}`);
      this.notifyListeners();

      // Etapa 2: Exibe modal de confirmação de reinicialização com contador de 20s
      this.triggerUpdatePrompt('CONFIRM_RESTART', this.availableVersion || undefined, 20);
      return { success: true };
    } catch (err: any) {
      if (tempZipPath && fs.existsSync(tempZipPath)) {
        fs.unlink(tempZipPath, () => {});
      }
      console.error('❌ [UpdateManager] Erro no download direto macOS:', err);
      this.status = 'ERROR';
      this.lastError = err?.message || 'Falha ao baixar pacote de atualização';
      this.notifyListeners();
      return { success: false, error: this.lastError || undefined };
    }
  }

  public getInfo(): UpdateInfo {
    return {
      status: this.status,
      currentVersion: app.getVersion(),
      availableVersion: this.availableVersion || undefined,
      releaseDate: this.releaseDate,
      releaseNotes: this.releaseNotes,
      downloadProgress: this.downloadProgress,
      error: this.lastError || undefined,
    };
  }

  public onUpdateStatus(listener: (info: UpdateInfo) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public onPromptUpdate(listener: (data: { type: 'CONFIRM_DOWNLOAD' | 'CONFIRM_RESTART'; version: string; countdownSeconds?: number }) => void): () => void {
    this.promptListeners.push(listener);
    return () => {
      this.promptListeners = this.promptListeners.filter((l) => l !== listener);
    };
  }

  public markCheckingFromRemote(): void {
    if (this.status !== 'DOWNLOADING' && this.status !== 'DOWNLOADED') {
      this.status = 'CHECKING';
      this.lastError = null;
      this.notifyListeners();
    }
  }

  public triggerUpdatePrompt(type: 'CONFIRM_DOWNLOAD' | 'CONFIRM_RESTART', version?: string, countdownSeconds = 20): void {
    const targetVersion = version || this.availableVersion || app.getVersion();
    console.log(`🔔 [UpdateManager] Notificando prompt [${type}] para v${targetVersion} (countdown: ${countdownSeconds}s)`);
    for (const listener of this.promptListeners) {
      try {
        listener({ type, version: targetVersion, countdownSeconds });
      } catch (err) {
        console.error('Erro ao notificar promptListener:', err);
      }
    }
  }

  private notifyListeners(): void {
    const info = this.getInfo();
    for (const listener of this.listeners) {
      listener(info);
    }
  }

  public dispose(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.listeners = [];
  }
}

export const updateManager = new UpdateManager();
