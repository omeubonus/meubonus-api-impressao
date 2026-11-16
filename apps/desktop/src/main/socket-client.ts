import { io, Socket } from 'socket.io-client';
import os from 'os';
import { app } from 'electron';
import { AgentCompany, PrintJobPayload, PrintJobRecord } from '../types';
import { agentStore, appVersion } from './store';
import { discoverPrinters } from './printer-discovery';
import { printEngine } from './print-engine';
import { updateManager } from './update-manager';

export class SocketClient {
  private socket: Socket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private onStateChangeListeners: Array<() => void> = [];
  private onJobReceivedListeners: Array<(job: PrintJobRecord) => void> = [];

  constructor() {
    //
  }

  public init(): void {
    this.connect();
  }

  private async resolveLogoToDataUrl(logoUrl: string | null): Promise<string | null> {
    if (!logoUrl) return null;
    if (logoUrl.startsWith('data:')) return logoUrl;
    if (logoUrl.startsWith('/brands/meubonus-logo.png')) return logoUrl;
    if (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://')) return null;

    try {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || 'image/png';
      const arrayBuf = await res.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString('base64');
      return `data:${contentType};base64,${base64}`;
    } catch {
      return null;
    }
  }

  private async applyIncomingBranding(branding: any | null): Promise<void> {
    if (!branding) {
      agentStore.setBranding(null);
      this.notifyStateChanged();
      return;
    }

    const resolvedLogo = await this.resolveLogoToDataUrl(branding.logoUrl ?? null);
    agentStore.setBranding({
      id: branding.id || 'custom',
      name: branding.name || 'Meu Bônus',
      logoUrl: resolvedLogo,
      showLogoText: Boolean(branding.showLogoText),
      colors: branding.colors || {},
    });
    this.notifyStateChanged();
  }

  private async syncBrandingFromHub(hubUrl: string): Promise<void> {
    try {
      const res = await fetch(`${hubUrl}/api/branding`);
      if (!res.ok) return;
      const data = (await res.json()) as { branding?: any | null };
      if (data && 'branding' in data) {
        await this.applyIncomingBranding(data.branding ?? null);
      }
    } catch {
      // Mantém cache local se falhar
    }
  }

  public connect(): void {
    if (this.socket) {
      this.disconnect();
    }

    const hubUrl = agentStore.getHubUrl();
    console.log(`🔌 [SocketClient] Conectando ao HUB em ${hubUrl}...`);

    this.socket = io(hubUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });

    this.socket.on('connect', async () => {
      console.log('✅ [SocketClient] Conectado ao Hub com sucesso!');
      this.isConnected = true;
      this.notifyStateChanged();
      await this.registerAgent();
      void this.syncBrandingFromHub(hubUrl);
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('⚠️ [SocketClient] Desconectado do Hub:', reason);
      this.isConnected = false;
      this.stopHeartbeat();
      this.notifyStateChanged();
    });

    this.socket.on('connect_error', (error) => {
      this.isConnected = false;
      this.notifyStateChanged();
    });

    // Evento quando o HUB confirma o registro
    this.socket.on('agent:registered', (data: { code: string; name: string | null; company: AgentCompany | null; defaultPrinter?: string }) => {
      console.log('🎉 [SocketClient] Agente registrado no Hub! Código:', data.code, 'Empresa:', data.company?.name || 'Nenhuma');
      if (data.code) agentStore.setCachedCode(data.code);
      if (data.company !== undefined) agentStore.setCachedCompany(data.company);
      if (data.name !== undefined) agentStore.setCachedName(data.name);
      if (data.defaultPrinter) agentStore.setDefaultPrinter(data.defaultPrinter);
      this.notifyStateChanged();
    });

    // Evento quando o Painel Web atualiza a identidade visual (White-Label)
    this.socket.on('branding:updated', async (branding: any | null) => {
      await this.applyIncomingBranding(branding);
    });

    // Evento quando o HUB atualiza o status do Agente (ex: Claim/Unclaim no Painel Web)
    this.socket.on('agent:updated', (data: { code: string; name: string | null; company: AgentCompany | null; defaultPrinter?: string }) => {
      console.log('🔄 [SocketClient] Agente atualizado pelo Hub:', data);
      if (data.code) agentStore.setCachedCode(data.code);
      if (data.company !== undefined) agentStore.setCachedCompany(data.company);
      if (data.name !== undefined) agentStore.setCachedName(data.name);
      if (data.defaultPrinter) agentStore.setDefaultPrinter(data.defaultPrinter);
      this.notifyStateChanged();
    });

    // Evento quando o Painel Web atualiza a identidade visual (White-Label)
    this.socket.on('branding:updated', async (branding: any | null) => {
      await this.applyIncomingBranding(branding);
    });

    // Evento quando um trabalho de impressão chega do HUB
    this.socket.on('print:job', async (jobData: PrintJobPayload) => {
      if (
        !jobData ||
        typeof jobData !== 'object' ||
        typeof jobData.jobId !== 'string' ||
        !jobData.jobId.trim() ||
        typeof jobData.content !== 'string'
      ) {
        console.warn('⚠️ [SocketClient] Payload de impressão inválido ignorado.');
        return;
      }
      console.log(`📥 [SocketClient] Trabalho de impressão recebido: #${jobData.jobId} - ${jobData.title || 'Sem título'}`);
      await this.handlePrintJob(jobData);
    });

    // Evento quando o HUB solicita atualização do agente
    this.socket.on('agent:trigger_update', async (data: { force?: boolean } | undefined, ackCallback) => {
      console.log(`📡 [SocketClient] Comando remoto de atualização recebido do Hub (force: ${data?.force ?? false})`);
      const info = updateManager.getInfo();

      if (info.status === 'DOWNLOADED') {
        // Já baixado: abre o modal de reinicialização com contador regressivo de 20s
        updateManager.triggerUpdatePrompt('CONFIRM_RESTART', info.availableVersion, 20);
        if (typeof ackCallback === 'function') {
          ackCallback({
            success: true,
            status: 'DOWNLOADED',
            message: 'Atualização pronta. Modal com contador de 20s acionado no agente.',
          });
        }
      } else {
        // Inicia checagem e download automático em segundo plano e, ao concluir, exibe o modal de confirmação (20s)
        updateManager.triggerRemoteUpdate().catch(() => null);

        if (typeof ackCallback === 'function') {
          ackCallback({
            success: true,
            status: info.status === 'DOWNLOADING' ? 'DOWNLOADING' : 'DOWNLOADING_STARTED',
            message: 'Comando recebido. Download iniciado automaticamente no agente.',
            downloadProgress: info.downloadProgress,
          });
        }
      }
    });

    // Evento quando o HUB envia comando remoto de migração para um novo endereço
    this.socket.on('agent:migrate_hub', (data: { hubUrl: string }, ackCallback) => {
      console.log(`🌐 [SocketClient] Comando de migração remota de Hub recebido: ${data?.hubUrl}`);
      try {
        if (!data?.hubUrl || typeof data.hubUrl !== 'string') {
          throw new Error('URL do Hub inválida');
        }
        const oldHubUrl = agentStore.getHubUrl();
        this.setHubUrl(data.hubUrl);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: true, oldHubUrl, newHubUrl: agentStore.getHubUrl() });
        }
      } catch (err: any) {
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err?.message || 'URL do Hub inválida' });
        }
      }
    });

    // Sincroniza mudanças no status do updateManager com o Hub
    updateManager.onUpdateStatus((updateInfo) => {
      this.notifyStateChanged();
      if (this.socket && this.isConnected) {
        this.socket.emit('agent:update_status', {
          machineToken: agentStore.getMachineToken(),
          status: updateInfo.status,
          currentVersion: updateInfo.currentVersion,
          availableVersion: updateInfo.availableVersion,
          downloadProgress: updateInfo.downloadProgress,
        });
      }
    });
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.notifyStateChanged();
  }

  public setHubUrl(newUrl: string): void {
    agentStore.setHubUrl(newUrl);
    this.connect();
  }

  public async registerAgent(): Promise<void> {
    if (!this.socket || !this.isConnected) return;

    try {
      const machineToken = agentStore.getMachineToken();
      const hostname = os.hostname();
      const platform = `${process.platform} (${os.release()})`;
      const version = appVersion;
      const printers = await discoverPrinters();
      const defaultPrinter = agentStore.getDefaultPrinter() || printers.find((p) => p.isDefault)?.name;

      const payload = {
        machineToken,
        hostname,
        os: platform,
        version,
        defaultPrinter,
        printers,
      };

      this.socket.emit('agent:register', payload, (res: any) => {
        if (res?.success && res.agent) {
          if (res.agent.code) agentStore.setCachedCode(res.agent.code);
          if (res.agent.company !== undefined) agentStore.setCachedCompany(res.agent.company);
          if (res.agent.name !== undefined) agentStore.setCachedName(res.agent.name);
          if (res.agent.defaultPrinter) agentStore.setDefaultPrinter(res.agent.defaultPrinter);
          this.notifyStateChanged();
        }
      });
    } catch (err) {
      console.error('Erro ao registrar agente:', err);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(async () => {
      if (!this.socket || !this.isConnected) return;

      try {
        const machineToken = agentStore.getMachineToken();
        const printers = await discoverPrinters();
        const defaultPrinter = agentStore.getDefaultPrinter() || undefined;
        const updateInfo = updateManager.getInfo();

        this.socket.emit('agent:heartbeat', {
          machineToken,
          defaultPrinter,
          printers,
          version: appVersion,
          updateStatus: updateInfo.status,
          downloadProgress: updateInfo.downloadProgress,
        });
      } catch (err) {
        console.warn('Erro ao emitir heartbeat:', err);
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public async setDefaultPrinter(printerName: string): Promise<boolean> {
    agentStore.setDefaultPrinter(printerName);
    this.notifyStateChanged();

    if (this.socket && this.isConnected) {
      return new Promise((resolve) => {
        this.socket!.emit(
          'agent:set-default-printer',
          {
            machineToken: agentStore.getMachineToken(),
            defaultPrinter: printerName,
          },
          (res: any) => {
            resolve(res?.success ?? false);
          }
        );
      });
    }
    return true;
  }

  public async unclaim(): Promise<{ success: boolean; error?: string }> {
    if (!this.socket || !this.isConnected) {
      return { success: false, error: 'Não conectado ao Hub de Impressão' };
    }

    return new Promise((resolve) => {
      this.socket!.emit(
        'agent:unclaim',
        {
          machineToken: agentStore.getMachineToken(),
        },
        (res: any) => {
          if (res?.success && res.agent) {
            agentStore.setCachedCompany(null);
            if (res.agent.code) {
              agentStore.setCachedCode(res.agent.code);
            }
            this.notifyStateChanged();
            resolve({ success: true });
          } else {
            resolve({ success: false, error: res?.error || 'Falha ao desvincular agente' });
          }
        }
      );
    });
  }

  public async requestTestPrint(printerName?: string): Promise<{ success: boolean; error?: string }> {
    if (this.socket && this.isConnected) {
      return new Promise((resolve) => {
        this.socket!.emit(
          'agent:request-test',
          {
            machineToken: agentStore.getMachineToken(),
            printerName,
          },
          async (res: any) => {
            if (res?.success && res.job) {
              try {
                await this.handlePrintJob(res.job);
                resolve({ success: true });
              } catch (err: any) {
                resolve({ success: false, error: err?.message });
              }
            } else {
              // Fallback para execução local se o Hub falhar
              try {
                await printEngine.printTestJob(printerName);
                resolve({ success: true });
              } catch (err: any) {
                resolve({ success: false, error: err?.message });
              }
            }
          }
        );
      });
    }

    // Se estiver offline do Hub, imprime localmente
    try {
      await printEngine.printTestJob(printerName);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  private async handlePrintJob(job: PrintJobPayload): Promise<void> {
    const record: PrintJobRecord = {
      id: job.jobId,
      title: job.title || `Impressão #${job.jobId.slice(0, 8)}`,
      printerName: job.printerName || agentStore.getDefaultPrinter() || 'Padrão',
      type: job.type,
      status: 'PRINTING',
      createdAt: new Date().toISOString(),
    };

    // 1. Registra no histórico local e notifica renderer
    agentStore.addHistory(record);
    this.notifyJobReceived(record);
    this.notifyStateChanged();

    // 2. Reporta status PRINTING para o HUB e aguarda confirmação antes de disparar impressão
    await this.reportJobStatus(job.jobId, 'PRINTING');

    try {
      // 3. Executa a impressão física silenciosa
      await printEngine.print(job);

      // 4. Reporta COMPLETED para o HUB
      await this.reportJobStatus(job.jobId, 'COMPLETED');
      agentStore.updateHistoryStatus(job.jobId, 'COMPLETED');
      this.notifyStateChanged();
      console.log(`✅ [SocketClient] Impressão concluída com sucesso: #${job.jobId}`);
    } catch (err: any) {
      console.error(`❌ [SocketClient] Erro ao executar trabalho #${job.jobId}:`, err);
      const errorMessage = err?.message || 'Erro desconhecido ao imprimir';
      await this.reportJobStatus(job.jobId, 'FAILED', errorMessage);
      agentStore.updateHistoryStatus(job.jobId, 'FAILED', errorMessage);
      this.notifyStateChanged();
    }
  }

  private reportJobStatus(jobId: string, status: 'PRINTING' | 'COMPLETED' | 'FAILED', errorMessage?: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket && this.isConnected) {
        this.socket.emit(
          'print:status',
          {
            jobId,
            status,
            ...(errorMessage && { errorMessage }),
          },
          () => {
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  public onStateChange(listener: () => void): () => void {
    this.onStateChangeListeners.push(listener);
    return () => {
      this.onStateChangeListeners = this.onStateChangeListeners.filter((l) => l !== listener);
    };
  }

  public onJobReceived(listener: (job: PrintJobRecord) => void): () => void {
    this.onJobReceivedListeners.push(listener);
    return () => {
      this.onJobReceivedListeners = this.onJobReceivedListeners.filter((l) => l !== listener);
    };
  }

  private notifyStateChanged(): void {
    for (const listener of this.onStateChangeListeners) {
      listener();
    }
  }

  private notifyJobReceived(job: PrintJobRecord): void {
    for (const listener of this.onJobReceivedListeners) {
      listener(job);
    }
  }
}

export const socketClient = new SocketClient();
