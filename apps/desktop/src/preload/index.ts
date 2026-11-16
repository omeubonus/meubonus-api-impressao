import { contextBridge, ipcRenderer } from 'electron';
import { AddTcpPrinterPayload, AgentState, ElectronAPI, PrintJobRecord } from '../types';

const api: ElectronAPI = {
  getState: (): Promise<AgentState> => {
    return ipcRenderer.invoke('agent:get-state');
  },

  setHubUrl: (url: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:set-hub-url', url);
  },

  setDefaultPrinter: (printerName: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:set-default-printer', printerName);
  },

  addTcpPrinter: (printer: AddTcpPrinterPayload): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:add-tcp-printer', printer);
  },

  removeTcpPrinter: (printerName: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:remove-tcp-printer', printerName);
  },

  unclaim: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:unclaim');
  },

  setAutostart: (enabled: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('agent:set-autostart', enabled);
  },

  printTest: (printerName?: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:print-test', printerName);
  },

  refreshPrinters: () => {
    return ipcRenderer.invoke('agent:refresh-printers');
  },

  clearHistory: (): Promise<boolean> => {
    return ipcRenderer.invoke('agent:clear-history');
  },

  checkForUpdates: () => {
    return ipcRenderer.invoke('agent:check-for-updates');
  },

  downloadUpdate: () => {
    return ipcRenderer.invoke('agent:download-update');
  },

  installUpdate: (force?: boolean) => {
    return ipcRenderer.invoke('agent:install-update', force);
  },

  onStateUpdate: (callback: (state: AgentState) => void) => {
    const handler = (_: any, state: AgentState) => callback(state);
    ipcRenderer.on('agent:state-update', handler);
    return () => {
      ipcRenderer.removeListener('agent:state-update', handler);
    };
  },

  onPrintJobReceived: (callback: (job: PrintJobRecord) => void) => {
    const handler = (_: any, job: PrintJobRecord) => callback(job);
    ipcRenderer.on('agent:print-job-received', handler);
    return () => {
      ipcRenderer.removeListener('agent:print-job-received', handler);
    };
  },

  onUpdateStatus: (callback: (info: any) => void) => {
    const handler = (_: any, info: any) => callback(info);
    ipcRenderer.on('agent:update-status', handler);
    return () => {
      ipcRenderer.removeListener('agent:update-status', handler);
    };
  },

  onUpdatePrompt: (callback: (data: { type?: 'CONFIRM_DOWNLOAD' | 'CONFIRM_RESTART'; version: string; countdownSeconds?: number }) => void) => {
    const handler = (_: any, data: { type?: 'CONFIRM_DOWNLOAD' | 'CONFIRM_RESTART'; version: string; countdownSeconds?: number }) => callback(data);
    ipcRenderer.on('agent:prompt-update', handler);
    return () => {
      ipcRenderer.removeListener('agent:prompt-update', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
