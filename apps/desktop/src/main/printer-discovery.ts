import { BrowserWindow } from 'electron';
import { PrinterInfo } from '../types';
import { agentStore } from './store';

export async function discoverPrinters(activeWindow?: BrowserWindow | null): Promise<PrinterInfo[]> {
  const osPrinters: PrinterInfo[] = [];

  try {
    let win = activeWindow;
    let createdTempWin = false;

    if (!win || win.isDestroyed()) {
      const all = BrowserWindow.getAllWindows();
      if (all.length > 0 && !all[0].isDestroyed()) {
        win = all[0];
      } else {
        win = new BrowserWindow({
          show: false,
          width: 100,
          height: 100,
          webPreferences: {
            sandbox: true,
          },
        });
        createdTempWin = true;
      }
    }

    const detected = await win.webContents.getPrintersAsync();

    if (createdTempWin && win && !win.isDestroyed()) {
      win.destroy();
    }

    for (const p of detected) {
      osPrinters.push({
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description || '',
        status: p.status,
        isDefault: p.isDefault,
        type: 'OS_SPOOLER',
      });
    }
  } catch (err) {
    console.warn('[PrinterDiscovery] Falha ao obter impressoras do SO:', err);
  }

  // Impressoras customizadas TCP cadastradas manualmente
  const tcpPrinters = agentStore.getCustomTcpPrinters();

  // Junta as listas
  const allPrinters = [...osPrinters, ...tcpPrinters];

  if (allPrinters.length === 0) {
    agentStore.setDefaultPrinter(null);
    return [];
  }

  // Determina impressora padrão
  let currentDefault = agentStore.getDefaultPrinter();
  const defaultExists = allPrinters.some((p) => p.name.toLowerCase() === currentDefault?.toLowerCase());

  if (!currentDefault || !defaultExists) {
    const osDefault = allPrinters.find((p) => p.isDefault);
    if (osDefault) {
      currentDefault = osDefault.name;
    } else {
      currentDefault = allPrinters[0].name;
    }
    agentStore.setDefaultPrinter(currentDefault);
  }

  // Ajusta flags isDefault baseado na escolha do usuário
  return allPrinters.map((p) => ({
    ...p,
    isDefault: p.name.toLowerCase() === currentDefault?.toLowerCase(),
  }));
}
