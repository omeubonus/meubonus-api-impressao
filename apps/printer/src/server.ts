import net from 'net';
import { EventEmitter } from 'events';
import { printerState, PrinterMode } from './state';
import { EscPosParser, ParsedJob } from './escpos';

export interface PrintEvent {
  id: string;
  timestamp: Date;
  parsed: ParsedJob;
  status: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
  durationMs: number;
  clientIp: string;
}

export class MockPrinterServer extends EventEmitter {
  private server: net.Server | null = null;
  private port: number;
  private host: string;

  constructor(port = 9100, host = '0.0.0.0') {
    super();
    this.port = port;
    this.host = host;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.handleConnection(socket));

      this.server.on('error', (err: any) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }

  private async handleConnection(socket: net.Socket) {
    const clientIp = socket.remoteAddress || '127.0.0.1';
    const startTime = Date.now();

    // REGRA DE OURO: Registra o listener de erro imediatamente para prevenir Unhandled 'error' event no Node.js
    socket.on('error', () => {
      // no-op: previne crash do servidor ao destruir socket com erro
    });

    const state = printerState.getState();

    // 1. Simulação: OFFLINE (Desligada / Recusa de Conexão)
    if (state.mode === 'OFFLINE') {
      this.emitPrintEvent({
        id: `err-${Date.now()}`,
        timestamp: new Date(),
        parsed: { text: '', lines: [], hasCut: false, hasInit: false, rawByteCount: 0 },
        status: 'FAILED',
        errorMessage: 'Conexão rejeitada: Impressora está OFFLINE (Desligada)',
        durationMs: Date.now() - startTime,
        clientIp,
      });
      socket.destroy(new Error('ECONNREFUSED'));
      return;
    }

    // 2. Simulação: Falhas ativas de hardware já na abertura da conexão
    if (state.mode === 'COVER_OPEN') {
      printerState.recordFailure();
      const errorMsg = 'ERRO MECÂNICO: Tampa do compartimento de bobina está ABERTA';
      this.emitPrintEvent({
        id: `job-${Date.now()}`,
        timestamp: new Date(),
        parsed: { text: '', lines: [], hasCut: false, hasInit: false, rawByteCount: 0 },
        status: 'FAILED',
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
        clientIp,
      });
      socket.destroy(new Error(errorMsg));
      return;
    }

    if (state.mode === 'NO_PAPER') {
      printerState.recordFailure();
      const errorMsg = 'ERRO TÉRMICO: Sensor detectou FIM DO ROLO DE PAPEL (Paper Out)';
      this.emitPrintEvent({
        id: `job-${Date.now()}`,
        timestamp: new Date(),
        parsed: { text: '', lines: [], hasCut: false, hasInit: false, rawByteCount: 0 },
        status: 'FAILED',
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
        clientIp,
      });
      socket.destroy(new Error(errorMsg));
      return;
    }

    if (state.mode === 'CUTTER_ERROR') {
      printerState.recordFailure();
      const errorMsg = 'ERRO DE GUILHOTINA: Lâmina do cortador mecânico travada';
      this.emitPrintEvent({
        id: `job-${Date.now()}`,
        timestamp: new Date(),
        parsed: { text: '', lines: [], hasCut: false, hasInit: false, rawByteCount: 0 },
        status: 'FAILED',
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
        clientIp,
      });
      socket.destroy(new Error(errorMsg));
      return;
    }

    const chunks: Buffer[] = [];

    socket.on('data', async (chunk) => {
      // 3. Comandos de telemetria bidirecional ESC/POS (DLE EOT n)
      if (chunk.length >= 3 && chunk[0] === 0x10 && chunk[1] === 0x04) {
        const n = chunk[2];
        const responseByte = this.getDleEotResponse(n, printerState.getState().mode);
        socket.write(Buffer.from([responseByte]));
        return;
      }

      chunks.push(chunk);
    });

    socket.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) return;

      const currentState = printerState.getState();

      // 4. Simulação de Latência / Buffer Ocupado
      if (currentState.delayMs > 0) {
        await new Promise((res) => setTimeout(res, currentState.delayMs));
      }

      // Se entrou em falha durante a transmissão
      if (currentState.mode !== 'ONLINE') {
        printerState.recordFailure();
        const errorMsg = `ERRO DE IMPRESSÃO: Status da impressora alterado para ${currentState.mode}`;
        this.emitPrintEvent({
          id: `job-${Date.now()}`,
          timestamp: new Date(),
          parsed: EscPosParser.parse(buffer),
          status: 'FAILED',
          errorMessage: errorMsg,
          durationMs: Date.now() - startTime,
          clientIp,
        });
        socket.destroy(new Error(errorMsg));
        return;
      }

      // 5. Sucesso normal na impressão
      const parsed = EscPosParser.parse(buffer);
      printerState.recordSuccess(parsed.hasCut);

      this.emitPrintEvent({
        id: `job-${Date.now()}`,
        timestamp: new Date(),
        parsed,
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
        clientIp,
      });

      // Fecha graciosamente a conexão confirmando a impressão
      socket.end();
    });
  }

  private getDleEotResponse(n: number, mode: PrinterMode): number {
    switch (n) {
      case 1: // Printer status
        return mode === 'OFFLINE' ? 0x08 : 0x00;
      case 2: // Offline cause / Paper status
        if (mode === 'NO_PAPER') return 0x1e; // Sem papel
        if (mode === 'COVER_OPEN') return 0x04; // Tampa aberta
        return 0x00;
      case 3: // Error status
        if (mode === 'CUTTER_ERROR') return 0x08; // Cutter error
        return 0x00;
      case 4: // Paper roll sensor
        return mode === 'NO_PAPER' ? 0x60 : 0x00;
      default:
        return 0x00;
    }
  }

  private emitPrintEvent(event: PrintEvent) {
    this.emit('print', event);
  }
}
