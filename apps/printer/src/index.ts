import readline from 'readline';
import { MockPrinterServer, PrintEvent } from './server';
import { printerState, PrinterMode } from './state';
import { EscPosParser } from './escpos';

// Córes ANSI
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BG_RED = '\x1b[41m';
const BG_GREEN = '\x1b[42m';

const port = parseInt(process.env.PORT || process.env.PRINTER_PORT || '9100', 10);
const server = new MockPrinterServer(port);

const recentEvents: PrintEvent[] = [];

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0f');
}

function getModeBadge(mode: PrinterMode): string {
  switch (mode) {
    case 'ONLINE':
      return `${BG_GREEN}${WHITE}${BOLD} ONLINE / PRONTA ${RESET}`;
    case 'NO_PAPER':
      return `${BG_RED}${WHITE}${BOLD} SEM PAPEL (PAPER OUT) ${RESET}`;
    case 'COVER_OPEN':
      return `${BG_RED}${WHITE}${BOLD} TAMPA ABERTA ${RESET}`;
    case 'CUTTER_ERROR':
      return `${BG_RED}${WHITE}${BOLD} GUILHOTINA TRAVADA ${RESET}`;
    case 'OFFLINE':
      return `${BG_RED}${WHITE}${BOLD} DESLIGADA (OFFLINE) ${RESET}`;
  }
}

function renderUI() {
  clearScreen();
  const state = printerState.getState();

  console.log(`${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}${BOLD}║              🖨️  SILENTPRINT — EMULADOR DE IMPRESSORA TÉRMICA         ║${RESET}`);
  console.log(`${CYAN}${BOLD}║                   Servidor Socket TCP ESC/POS (:9100)                ║${RESET}`);
  console.log(`${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log('');
  console.log(`  ${BOLD}Status Atual:${RESET}      ${getModeBadge(state.mode)}`);
  console.log(`  ${BOLD}Porta TCP:${RESET}         ${YELLOW}${server.getPort()}${RESET} ${DIM}(Conecte via IP: 127.0.0.1:${server.getPort()})${RESET}`);
  console.log(`  ${BOLD}Simulação Atraso:${RESET}  ${state.delayMs > 0 ? `${YELLOW}${state.delayMs}ms (Buffer Ocupado)${RESET}` : `${GREEN}Desativado (Instantâneo)${RESET}`}`);
  console.log(`  ${BOLD}Estatísticas:${RESET}      ${GREEN}${state.successfulJobs} impressões OK${RESET} │ ${RED}${state.failedJobs} falhas${RESET} │ ${BLUE}${state.totalCuts} cortes de papel${RESET}`);
  console.log('');
  console.log(`${DIM}─────────────────────────────────────────────────────────────────────────${RESET}`);
  console.log(`${BOLD}Comandos Interativos (pressione a tecla desejada no teclado):${RESET}`);
  console.log(`  ${GREEN}[1]${RESET} Modo Normal (Online)      ${RED}[2]${RESET} Simular Sem Papel     ${RED}[3]${RESET} Simular Tampa Aberta`);
  console.log(`  ${RED}[4]${RESET} Simular Guilhotina Travada ${YELLOW}[5]${RESET} Alternar Atraso (3.5s) ${RED}[6]${RESET} Desligar Impressora`);
  console.log(`  ${WHITE}[L]${RESET} Limpar tela                ${WHITE}[Q]${RESET} Encerrar Emulador`);
  console.log(`${DIM}─────────────────────────────────────────────────────────────────────────${RESET}`);
  console.log('');

  if (recentEvents.length === 0) {
    console.log(`${DIM}  Aguardando conexões TCP ou trabalhos de impressão...${RESET}`);
    console.log(`  ${DIM}Dica: No SilentPrint Desktop, clique em "+ Adicionar IP:9100" e informe 127.0.0.1:${server.getPort()}${RESET}`);
  } else {
    console.log(`${BOLD}Último Trabalho Recebido:${RESET}`);
    const last = recentEvents[recentEvents.length - 1];
    const timeStr = last.timestamp.toLocaleTimeString('pt-BR');

    if (last.status === 'SUCCESS') {
      console.log(`  ${GREEN}${BOLD}✓ Impressão Concluída (${last.durationMs}ms) — Cliente: ${last.clientIp} às ${timeStr}${RESET}`);
      console.log(`  ${DIM}Bytes brutos: ${last.parsed.rawByteCount} │ Corte mecânico: ${last.parsed.hasCut ? 'Sim' : 'Não'}${RESET}`);
      console.log('');
      const receiptBox = EscPosParser.renderReceiptBox(last.parsed, 46);
      for (const line of receiptBox) {
        console.log(`  ${WHITE}${line}${RESET}`);
      }
    } else {
      console.log(`  ${RED}${BOLD}✗ Falha na Impressão (${last.durationMs}ms) — Cliente: ${last.clientIp} às ${timeStr}${RESET}`);
      console.log(`  ${RED}Motivo: ${last.errorMessage}${RESET}`);
    }
  }
}

// Configura eventos da impressora
server.on('print', (event: PrintEvent) => {
  recentEvents.push(event);
  if (recentEvents.length > 20) recentEvents.shift();
  renderUI();
});

printerState.subscribe(() => {
  renderUI();
});

// Configura leitura de teclas do terminal (Raw Mode)
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      process.exit();
    }

    const char = (str || '').toLowerCase();

    switch (char) {
      case '1':
        printerState.setMode('ONLINE');
        break;
      case '2':
        printerState.setMode('NO_PAPER');
        break;
      case '3':
        printerState.setMode('COVER_OPEN');
        break;
      case '4':
        printerState.setMode('CUTTER_ERROR');
        break;
      case '5':
        printerState.toggleDelay(3500);
        break;
      case '6':
        printerState.setMode('OFFLINE');
        break;
      case 'l':
      case 'c':
        recentEvents.length = 0;
        renderUI();
        break;
      case 'q':
        console.log(`\n${YELLOW}Encerrando Emulador de Impressora...${RESET}`);
        server.stop().then(() => process.exit(0));
        break;
    }
  });
}

// Inicia servidor
server
  .start()
  .then(() => {
    renderUI();
  })
  .catch((err) => {
    console.error(`${RED}Erro ao iniciar o servidor TCP na porta ${port}:${RESET}`, err);
    process.exit(1);
  });
