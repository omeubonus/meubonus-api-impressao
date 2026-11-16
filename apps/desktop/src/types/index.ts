export type PrinterType = 'OS_SPOOLER' | 'NETWORK_TCP' | 'VIRTUAL';

export interface PrinterInfo {
  name: string;
  displayName: string;
  description?: string;
  status: number | string;
  isDefault: boolean;
  type: PrinterType;
  host?: string;
  port?: number;
}

export type PrintContentType = 'RAW' | 'TEXT' | 'PDF' | 'IMAGE' | 'HTML';

export interface PrintJobOptions {
  cut?: boolean;
  copies?: number;
  dpi?: number;
  paperWidth?: number;
  silent?: boolean;
  printBackground?: boolean;
  [key: string]: any;
}

export interface PrintJobPayload {
  jobId: string;
  title?: string;
  printerName?: string;
  type: PrintContentType;
  content: string;
  options?: PrintJobOptions;
}

export interface PrintJobRecord {
  id: string;
  title: string;
  printerName: string;
  type: string;
  status: 'PRINTING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}

export interface AgentCompany {
  id: string;
  name: string;
}

export type UpdateStatus = 'IDLE' | 'CHECKING' | 'AVAILABLE' | 'DOWNLOADING' | 'DOWNLOADED' | 'ERROR';

export interface UpdateInfo {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
  downloadProgress?: number;
  error?: string;
}

export interface AgentState {
  machineToken?: string;
  code: string | null;
  name: string | null;
  company: AgentCompany | null;
  defaultPrinter: string | null;
  hubUrl: string;
  connected: boolean;
  autostart: boolean;
  printers: PrinterInfo[];
  history: PrintJobRecord[];
  version: string;
  updateInfo: UpdateInfo;
  isDev?: boolean;
  branding?: {
    id: string;
    name: string;
    logoUrl: string | null;
    showLogoText: boolean;
    colors: Record<string, string>;
  } | null;
}

export interface AddTcpPrinterPayload {
  name: string;
  host: string;
  port: number;
}

export interface ElectronAPI {
  getState: () => Promise<AgentState>;
  setHubUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
  setDefaultPrinter: (printerName: string) => Promise<{ success: boolean; error?: string }>;
  addTcpPrinter: (printer: AddTcpPrinterPayload) => Promise<{ success: boolean; error?: string }>;
  removeTcpPrinter: (printerName: string) => Promise<{ success: boolean; error?: string }>;
  unclaim: () => Promise<{ success: boolean; error?: string }>;
  setAutostart: (enabled: boolean) => Promise<boolean>;
  printTest: (printerName?: string) => Promise<{ success: boolean; error?: string }>;
  refreshPrinters: () => Promise<PrinterInfo[]>;
  clearHistory: () => Promise<boolean>;
  checkForUpdates: () => Promise<UpdateInfo>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: (force?: boolean) => Promise<{ success: boolean; reason?: string }>;
  onStateUpdate: (callback: (state: AgentState) => void) => () => void;
  onPrintJobReceived: (callback: (job: PrintJobRecord) => void) => () => void;
  onUpdateStatus: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdatePrompt: (callback: (data: { type?: 'CONFIRM_DOWNLOAD' | 'CONFIRM_RESTART'; version: string; countdownSeconds?: number }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
  const __APP_VERSION__: string;
  const __APP_ENV__: string;
  const __HUB_URL__: string;
}
