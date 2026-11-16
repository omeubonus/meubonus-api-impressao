export type PrinterMode = 'ONLINE' | 'NO_PAPER' | 'COVER_OPEN' | 'CUTTER_ERROR' | 'OFFLINE';

export interface PrinterState {
  mode: PrinterMode;
  delayMs: number;
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalCuts: number;
  lastJobAt: Date | null;
}

class StateManager {
  private state: PrinterState = {
    mode: 'ONLINE',
    delayMs: 0,
    totalJobs: 0,
    successfulJobs: 0,
    failedJobs: 0,
    totalCuts: 0,
    lastJobAt: null,
  };

  private listeners: Array<(state: PrinterState) => void> = [];

  getState(): PrinterState {
    return { ...this.state };
  }

  setMode(mode: PrinterMode) {
    this.state.mode = mode;
    this.notify();
  }

  toggleDelay(delayMs = 3500) {
    this.state.delayMs = this.state.delayMs > 0 ? 0 : delayMs;
    this.notify();
  }

  recordSuccess(hasCut: boolean) {
    this.state.totalJobs++;
    this.state.successfulJobs++;
    if (hasCut) this.state.totalCuts++;
    this.state.lastJobAt = new Date();
    this.notify();
  }

  recordFailure() {
    this.state.totalJobs++;
    this.state.failedJobs++;
    this.state.lastJobAt = new Date();
    this.notify();
  }

  subscribe(listener: (state: PrinterState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }
}

export const printerState = new StateManager();
