import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, Tray, Menu, nativeImage, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { agentStore, isDev, appVersion } from './store';
import { discoverPrinters } from './printer-discovery';
import { printEngine } from './print-engine';
import { socketClient } from './socket-client';
import { updateManager } from './update-manager';
import { AddTcpPrinterPayload, AgentState } from '../types';

// SEC-01: Bloqueia inicialização com flags de inspeção/debug em produção
if (!isDev) {
  const forbiddenFlags = [
    '--inspect',
    '--inspect-brk',
    '--inspect-port',
    '--debug',
    '--debug-brk',
    '--remote-debugging-port',
    '--remote-debugging-pipe',
    '--js-flags',
    '--expose-internals',
  ];
  const allArgs = [...process.argv, ...process.execArgv].map((arg) => arg.toLowerCase());
  const hasDebugFlag = allArgs.some((arg) => forbiddenFlags.some((flag) => arg.startsWith(flag)));
  if (hasDebugFlag || process.env.ELECTRON_RUN_AS_NODE || process.env.NODE_OPTIONS) {
    app.exit(1);
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Ícone padrão 16x16 transparente com impressora preta/branca para bandeja do sistema
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAXpJREFUOE+N07+LzVEUxfHPve+97zeDYTCb/AOyqYVMih' +
  'KRhSJLymZJmU2kDJQhZRkZ/gMWSgYxSBj/gNms3zvvfe7RffN8n3rfW/Wcc889Hfdcn6M5i+M4yRgncdv5B27iXp7b6f6xGvBqjPGw1vppjL' +
  'GZ59ZaS7/r/00M2I21tNZ6EGNs5XkG9zEw4E0Rj3A0n00R/4oB9/E1r3M4H5E38T1GHOc0/4zTETk6N7/Fp7zO4/zIe9yJ3/i9UeAtrqW1' +
  '1udR/B2j7kY8n6U8G1X3h016259t4sA1PM7lM5xvhXw+j58xD9zBh1zuxZ2tcW10/I8B97Ge76f4gqP4hM941wb3sRpv8R3P8RL38Anvx9e/' +
  'vKfxNbbwHwY7eNcaR1r9/o4v+Bq3t8bRvYv4jC/p7d2I33nO7S08wbNcj3g8k+578351+b5r6+8c+j5+5X1hRz7vjF94g8f596+I5z1mHn' +
  'h3eL/xG59jD77hT8Z6d36e52vjH1Y4w3e1eU7AAAAAElFTkSuQmCC';

function createTrayIcon(): Electron.NativeImage {
  try {
    if (isDev) {
      const devTrayPath = path.resolve(__dirname, '../../build/tray-dev.png');
      if (fs.existsSync(devTrayPath)) {
        return nativeImage.createFromPath(devTrayPath);
      }
    }
    const imgBuffer = Buffer.from(TRAY_ICON_BASE64, 'base64');
    const image = nativeImage.createFromBuffer(imgBuffer);
    if (process.platform === 'darwin') {
      image.setTemplateImage(true);
    }
    return image;
  } catch {
    return nativeImage.createEmpty();
  }
}

// SEC-02: machineToken jamais é incluído no estado enviado ao Renderer
async function getFullAgentState(): Promise<AgentState> {
  const printers = await discoverPrinters(mainWindow);
  const autostart = agentStore.getAutostart();
  const currentDefault = agentStore.getDefaultPrinter() || printers.find((p) => p.isDefault)?.name || null;

  return {
    code: agentStore.getCachedCode(),
    name: agentStore.getCachedName(),
    company: agentStore.getCachedCompany(),
    defaultPrinter: currentDefault,
    hubUrl: agentStore.getHubUrl(),
    connected: socketClient.getConnected(),
    autostart,
    printers,
    history: agentStore.getHistory(),
    version: appVersion,
    updateInfo: updateManager.getInfo(),
    branding: agentStore.getBranding(),
    isDev,
  };
}

function sendStateToRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    getFullAgentState()
      .then((state) => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('agent:state-update', state);
        }
        updateTrayMenu(state);
      })
      .catch((err) => console.error('Erro ao enviar estado para renderer:', err));
  }
}

function updateTrayMenu(state: AgentState): void {
  if (!tray) return;

  const appTitle = state.isDev ? 'SilentPrint Agent [DEV]' : 'SilentPrint Agent';
  const statusText = state.connected ? '● Hub Conectado' : '○ Hub Desconectado';
  const companyText = state.company ? `Empresa: ${state.company.name}` : 'Aguardando Vínculo';
  const codeText = state.code ? `Código: ${state.code}` : 'Código: Gerando...';
  const versionText = `Versão: v${state.version}${state.isDev ? ' (DEV)' : ''}`;

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    { label: `${appTitle} (${codeText})`, enabled: false },
    { label: `${statusText} • ${versionText}`, enabled: false },
    { label: companyText, enabled: false },
    { type: 'separator' },
  ];

  // Notificação com ação se houver atualização baixada
  if (state.updateInfo?.status === 'DOWNLOADED') {
    menuTemplate.push(
      {
        label: `🚀 Atualização ${state.updateInfo.availableVersion ? `v${state.updateInfo.availableVersion}` : ''} Pronta - Reiniciar`,
        click: async () => {
          await updateManager.applyUpdate(true);
        },
      },
      { type: 'separator' }
    );
  } else if (state.updateInfo?.status === 'DOWNLOADING') {
    menuTemplate.push(
      {
        label: `⬇️ Baixando Atualização (${state.updateInfo.downloadProgress ?? 0}%)...`,
        enabled: false,
      },
      { type: 'separator' }
    );
  }

  menuTemplate.push(
    {
      label: 'Abrir Painel do Agente',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Imprimir Teste Local',
      click: async () => {
        try {
          await printEngine.printTestJob();
        } catch (err: any) {
          console.error('Erro ao imprimir teste pelo Tray:', err);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Encerrar SilentPrint',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    }
  );

  const contextMenu = Menu.buildFromTemplate(menuTemplate);

  tray.setToolTip(`${appTitle} - ${state.connected ? 'Conectado' : 'Desconectado'} (${state.code || 'IMP'})`);
  tray.setContextMenu(contextMenu);
}

function createMainWindow(): void {
  // SEC-01: Remove barra de menu padrão do Electron/Chromium (elimina atalhos de DevTools e Reload)
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 430,
    height: 880,
    minWidth: 390,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: isDev ? 'SilentPrint Agent [DEV]' : 'SilentPrint Agent',
    backgroundColor: '#0b0f17',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      devTools: isDev,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  });

  // SEC-09: Bloqueia abertura de novas janelas, webviews e navegação externa
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // SEC-01: Blindagem estrita em produção contra DevTools, menu de contexto e atalhos de navegador
  if (!isDev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });

    mainWindow.webContents.on('context-menu', (event) => {
      event.preventDefault();
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase();
      const ctrlOrCmd = input.control || input.meta;

      const isDevToolsShortcut =
        key === 'f12' ||
        (ctrlOrCmd && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
        (input.meta && input.alt && (key === 'i' || key === 'j' || key === 'c'));

      const isBrowserReloadOrSource =
        key === 'f5' ||
        (ctrlOrCmd && (key === 'r' || key === 'u' || key === 'p' || key === 's'));

      if (isDevToolsShortcut || isBrowserReloadOrSource) {
        event.preventDefault();
      }
    });
  }

  // SEC-01/SEC-09: Só permite URL de servidor de desenvolvimento se estiver comprovadamente em modo isDev
  const devServerUrl = isDev ? process.env.VITE_DEV_SERVER_URL : undefined;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    sendStateToRenderer();
  });

  // Minimizar e Fechar redirecionam para a bandeja do sistema
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('minimize', () => {
    mainWindow?.hide();
  });
}

function createSystemTray(): void {
  const icon = createTrayIcon();
  tray = new Tray(icon);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  getFullAgentState().then((state) => updateTrayMenu(state));
}

// Configura inicialização automática com o SO
function applyAutostartSetting(enabled: boolean): void {
  agentStore.setAutostart(enabled);
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: process.execPath,
    });
  } catch (err) {
    console.warn('Falha ao configurar login item settings:', err);
  }
}

// SEC-09: Valida se a chamada IPC partiu exclusivamente do frame principal confiável da UI
function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('Acesso IPC negado: origem desconhecida.');
  }

  const frameUrl = event.senderFrame?.url || '';
  if (isDev && process.env.VITE_DEV_SERVER_URL && frameUrl.startsWith(process.env.VITE_DEV_SERVER_URL)) {
    return;
  }

  if (!frameUrl.startsWith('file://')) {
    throw new Error('Acesso IPC negado: protocolo de origem não autorizado.');
  }
}

// Registra todos os handlers IPC
function setupIpcHandlers(): void {
  ipcMain.handle('agent:get-state', async (event) => {
    assertTrustedIpcSender(event);
    return await getFullAgentState();
  });

  ipcMain.handle('agent:set-hub-url', async (event, url: string) => {
    assertTrustedIpcSender(event);
    try {
      if (typeof url !== 'string') {
        throw new Error('URL inválida.');
      }
      socketClient.setHubUrl(url);
      sendStateToRenderer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha ao atualizar URL do Hub' };
    }
  });

  ipcMain.handle('agent:set-default-printer', async (event, printerName: string) => {
    assertTrustedIpcSender(event);
    try {
      if (typeof printerName !== 'string' || !printerName.trim()) {
        throw new Error('Nome da impressora inválido.');
      }
      const ok = await socketClient.setDefaultPrinter(printerName.trim());
      sendStateToRenderer();
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('agent:add-tcp-printer', async (event, payload: AddTcpPrinterPayload) => {
    assertTrustedIpcSender(event);
    try {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Dados da impressora inválidos.');
      }
      agentStore.addCustomTcpPrinter(payload);
      sendStateToRenderer();
      socketClient.registerAgent().catch((err) => console.error('Erro ao sincronizar adição no Hub:', err));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('agent:remove-tcp-printer', async (event, printerName: string) => {
    assertTrustedIpcSender(event);
    try {
      if (typeof printerName !== 'string' || !printerName.trim()) {
        throw new Error('Nome da impressora inválido.');
      }
      agentStore.removeCustomTcpPrinter(printerName);
      sendStateToRenderer();
      socketClient.registerAgent().catch((err) => console.error('Erro ao sincronizar remoção no Hub:', err));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('agent:unclaim', async (event) => {
    assertTrustedIpcSender(event);
    try {
      const res = await socketClient.unclaim();
      sendStateToRenderer();
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('agent:set-autostart', async (event, enabled: boolean) => {
    assertTrustedIpcSender(event);
    const boolVal = Boolean(enabled);
    applyAutostartSetting(boolVal);
    sendStateToRenderer();
    return boolVal;
  });

  ipcMain.handle('agent:print-test', async (event, printerName?: string) => {
    assertTrustedIpcSender(event);
    try {
      const safeName = typeof printerName === 'string' && printerName.trim() ? printerName.trim() : undefined;
      const res = await socketClient.requestTestPrint(safeName);
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao imprimir teste' };
    }
  });

  ipcMain.handle('agent:refresh-printers', async (event) => {
    assertTrustedIpcSender(event);
    const printers = await discoverPrinters(mainWindow);
    sendStateToRenderer();
    return printers;
  });

  ipcMain.handle('agent:clear-history', async (event) => {
    assertTrustedIpcSender(event);
    agentStore.clearHistory();
    sendStateToRenderer();
    return true;
  });

  ipcMain.handle('agent:check-for-updates', async (event) => {
    assertTrustedIpcSender(event);
    return await updateManager.checkForUpdates();
  });

  ipcMain.handle('agent:download-update', async (event) => {
    assertTrustedIpcSender(event);
    return await updateManager.downloadUpdate();
  });

  ipcMain.handle('agent:install-update', async (event, force?: boolean) => {
    assertTrustedIpcSender(event);
    return await updateManager.applyUpdate(Boolean(force));
  });
}

// Single Instance Lock para impedir duas cópias do agente rodando
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // SEC-09: Bloqueia solicitações de permissões de hardware/mídia na sessão padrão do Chromium
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    // SEC-02: Inicializa e migra o machineToken para o cofre criptografado do SO (safeStorage)
    agentStore.getMachineToken();

    setupIpcHandlers();
    createMainWindow();
    createSystemTray();

    // Aplica configuração de autostart salva
    applyAutostartSetting(agentStore.getAutostart());

    // Inicia gerenciador de atualizações automáticas e watchdog
    updateManager.init();
    updateManager.onUpdateStatus(() => {
      sendStateToRenderer();
    });
    updateManager.onPromptUpdate((data) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('agent:prompt-update', data);
      }
    });

    // Inicia conexão WebSocket
    socketClient.init();

    // Ouvintes para manter renderer atualizado
    socketClient.onStateChange(() => {
      sendStateToRenderer();
    });

    socketClient.onJobReceived((job) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('agent:print-job-received', job);
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    updateManager.dispose();
    socketClient.disconnect();
  });

  app.on('window-all-closed', () => {
    // Mantém rodando em segundo plano no Tray
  });
}
