import { app, safeStorage } from 'electron';
import Store from 'electron-store';
import crypto from 'crypto';
import net from 'net';
import path from 'path';
import { AgentCompany, PrintJobRecord, PrinterInfo } from '../types';

export interface LocalStoreSchema {
  machineToken?: string | null;
  encryptedMachineToken?: string | null;
  defaultPrinter: string | null;
  hubUrl: string;
  customTcpPrinters: PrinterInfo[];
  history: PrintJobRecord[];
  autostart: boolean;
  cachedCode: string | null;
  cachedCompany: AgentCompany | null;
  cachedName: string | null;
  lastInstalledVersion: string | null;
  stableVersion: string | null;
  bootAttempts: number;
  branding?: any | null;
}

export const isDev = process.env.APP_ENV === 'development' || (!app.isPackaged && process.env.NODE_ENV !== 'production');

export const rawVersion =
  process.env.APP_VERSION && process.env.APP_VERSION !== 'undefined'
    ? process.env.APP_VERSION
    : app.getVersion();

export const appVersion = isDev ? `${rawVersion}-dev` : rawVersion;

// Isola o diretório de dados para que Dev e Produção nunca compartilhem nada
export const appName = process.env.APP_NAME || (isDev ? 'SilentPrint Agent Dev' : 'SilentPrint Agent');
try {
  app.setName(appName);
  const baseDataDir = app.getPath('appData');
  if (baseDataDir) {
    app.setPath('userData', path.join(baseDataDir, appName));
  }
} catch {
  // Ignora se appData ainda não estiver disponível
}

export const DEFAULT_HUB_URL = process.env.HUB_URL || (isDev ? 'http://localhost:3335' : 'https://api.silentprint.fylee.com.br');

const BLOCKED_TCP_PORTS = new Set([
  21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445,
  1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017,
]);

export function validateHubUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Endereço do Hub inválido.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('A URL do Hub não pode conter credenciais embutidas.');
  }

  if (!isDev && parsed.protocol !== 'https:') {
    throw new Error('Em produção, o endereço do Hub deve utilizar conexão segura (https://).');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Protocolo não suportado para o Hub.');
  }

  // Remove barra final redundante
  return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
}

export function validateTcpPrinterTarget(name: string, host: string, port: number): { name: string; host: string; port: number } {
  const cleanName = name.trim().replace(/[\x00-\x1F\x7F]/g, '');
  if (!cleanName || cleanName.length > 64) {
    throw new Error('Nome da impressora inválido (máximo 64 caracteres).');
  }

  const cleanHost = host.trim().toLowerCase();
  if (!cleanHost || cleanHost.length > 253 || /[\s/\\?#@:;'"`$|<>&]/.test(cleanHost)) {
    throw new Error('Endereço IP ou Host da impressora inválido.');
  }

  const ipVersion = net.isIP(cleanHost);
  const isHostname = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(cleanHost);

  if (ipVersion === 0 && !isHostname) {
    throw new Error('Informe um endereço IPv4 ou hostname de rede válido.');
  }

  // Proteção contra metadata de nuvem e broadcast
  if (
    cleanHost === '0.0.0.0' ||
    cleanHost === '255.255.255.255' ||
    cleanHost.startsWith('169.254.')
  ) {
    throw new Error('Endereço reservado de rede não permitido para impressora.');
  }

  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    throw new Error('Porta TCP inválida (deve estar entre 1 e 65535).');
  }

  const isStandardPrinterPort = numericPort === 515 || numericPort === 631 || (numericPort >= 9100 && numericPort <= 9109);
  if (!isStandardPrinterPort && (numericPort < 1024 || BLOCKED_TCP_PORTS.has(numericPort))) {
    throw new Error(`A porta ${numericPort} é reservada do sistema e não pode ser usada para impressão RAW.`);
  }

  return { name: cleanName, host: cleanHost, port: numericPort };
}

const store = new Store<LocalStoreSchema>({
  name: isDev ? 'config-dev' : 'config',
  defaults: {
    encryptedMachineToken: null,
    defaultPrinter: null,
    hubUrl: DEFAULT_HUB_URL,
    customTcpPrinters: [],
    history: [],
    autostart: !isDev,
    cachedCode: null,
    cachedCompany: null,
    cachedName: null,
    lastInstalledVersion: null,
    stableVersion: null,
    bootAttempts: 0,
  },
});

let inMemoryMachineToken: string | null = null;

function resolveAndSecureMachineToken(): string {
  if (inMemoryMachineToken) {
    return inMemoryMachineToken;
  }

  const canEncrypt = app.isReady() && safeStorage.isEncryptionAvailable();

  // 1. Tenta ler token criptografado pelo cofre do SO (DPAPI / Keychain)
  const encryptedBase64 = store.get('encryptedMachineToken');
  if (encryptedBase64 && canEncrypt) {
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encryptedBase64, 'base64'));
      if (decrypted && decrypted.length >= 16) {
        inMemoryMachineToken = decrypted;
        if (store.get('machineToken')) {
          store.delete('machineToken');
        }
        return inMemoryMachineToken;
      }
    } catch {
      // Fallback caso o cofre do SO tenha sido redefinido
    }
  }

  // 2. Migra token legado em texto puro ou gera um novo UUID criptograficamente seguro
  const legacyPlain = store.get('machineToken');
  const token = legacyPlain && typeof legacyPlain === 'string' && legacyPlain.length >= 16
    ? legacyPlain
    : crypto.randomUUID();

  inMemoryMachineToken = token;

  if (canEncrypt) {
    try {
      const encrypted = safeStorage.encryptString(token).toString('base64');
      store.set('encryptedMachineToken', encrypted);
      store.delete('machineToken');
      return token;
    } catch {
      // Se falhar a criptografia do SO, mantém apenas em fallback
    }
  }

  if (!encryptedBase64) {
    store.set('machineToken', token);
  }

  return token;
}

export const agentStore = {
  getMachineToken(): string {
    return resolveAndSecureMachineToken();
  },

  getDefaultPrinter(): string | null {
    return store.get('defaultPrinter');
  },

  setDefaultPrinter(printerName: string | null): void {
    store.set('defaultPrinter', printerName);
  },

  getHubUrl(): string {
    const stored = store.get('hubUrl') || DEFAULT_HUB_URL;
    try {
      return validateHubUrl(stored);
    } catch {
      store.set('hubUrl', DEFAULT_HUB_URL);
      return DEFAULT_HUB_URL;
    }
  },

  setHubUrl(url: string): void {
    const validated = validateHubUrl(url);
    store.set('hubUrl', validated);
  },

  getCustomTcpPrinters(): PrinterInfo[] {
    return store.get('customTcpPrinters') || [];
  },

  addCustomTcpPrinter(printer: { name: string; host: string; port: number }): PrinterInfo {
    const valid = validateTcpPrinterTarget(printer.name, printer.host, printer.port);
    const printers = this.getCustomTcpPrinters();
    const newPrinter: PrinterInfo = {
      name: valid.name,
      displayName: `${valid.name} (${valid.host}:${valid.port})`,
      description: `Impressora de Rede TCP (${valid.host}:${valid.port})`,
      status: 0,
      isDefault: false,
      type: 'NETWORK_TCP',
      host: valid.host,
      port: valid.port,
    };

    // Remove se já houver com mesmo nome
    const filtered = printers.filter((p) => p.name !== valid.name);
    filtered.push(newPrinter);
    store.set('customTcpPrinters', filtered);
    return newPrinter;
  },

  removeCustomTcpPrinter(printerName: string): void {
    const target = printerName.trim().toLowerCase();
    const printers = this.getCustomTcpPrinters().filter(
      (p) => p.name.trim().toLowerCase() !== target && p.displayName.trim().toLowerCase() !== target
    );
    store.set('customTcpPrinters', printers);
    if (this.getDefaultPrinter()?.trim().toLowerCase() === target) {
      this.setDefaultPrinter(null);
    }
  },

  getHistory(): PrintJobRecord[] {
    return store.get('history') || [];
  },

  addHistory(job: PrintJobRecord): void {
    const current = this.getHistory();
    // Prepend and limit to 100 entries
    const updated = [job, ...current.filter((j) => j.id !== job.id)].slice(0, 100);
    store.set('history', updated);
  },

  updateHistoryStatus(jobId: string, status: 'PRINTING' | 'COMPLETED' | 'FAILED', errorMessage?: string): void {
    const current = this.getHistory();
    const updated = current.map((item) => {
      if (item.id === jobId) {
        return { ...item, status, errorMessage: errorMessage ?? item.errorMessage };
      }
      return item;
    });
    store.set('history', updated);
  },

  clearHistory(): void {
    store.set('history', []);
  },

  getAutostart(): boolean {
    return store.get('autostart') ?? true;
  },

  setAutostart(enabled: boolean): void {
    store.set('autostart', enabled);
  },

  getCachedCode(): string | null {
    return store.get('cachedCode');
  },

  setCachedCode(code: string | null): void {
    store.set('cachedCode', code);
  },

  getCachedCompany(): AgentCompany | null {
    return store.get('cachedCompany');
  },

  setCachedCompany(company: AgentCompany | null): void {
    store.set('cachedCompany', company);
  },

  getCachedName(): string | null {
    return store.get('cachedName');
  },

  setCachedName(name: string | null): void {
    store.set('cachedName', name);
  },

  getLastInstalledVersion(): string | null {
    return store.get('lastInstalledVersion');
  },

  setLastInstalledVersion(version: string | null): void {
    store.set('lastInstalledVersion', version);
  },

  getStableVersion(): string | null {
    return store.get('stableVersion');
  },

  setStableVersion(version: string | null): void {
    store.set('stableVersion', version);
  },

  getBootAttempts(): number {
    return store.get('bootAttempts') ?? 0;
  },

  setBootAttempts(count: number): void {
    store.set('bootAttempts', count);
  },

  getBranding(): any | null {
    return store.get('branding') ?? null;
  },

  setBranding(branding: any | null): void {
    store.set('branding', branding);
  },
};
