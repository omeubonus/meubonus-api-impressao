import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from './api';
import { SocketDashboardEvent } from '../types';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
type DashboardUpdateListener = (event: SocketDashboardEvent) => void;
type StatusChangeListener = (status: SocketStatus) => void;

class SocketManager {
  private socket: Socket | null = null;
  private status: SocketStatus = 'disconnected';
  private dashboardListeners: Set<DashboardUpdateListener> = new Set();
  private statusListeners: Set<StatusChangeListener> = new Set();
  private reconnectInterval: any = null;

  constructor() {
    // Escuta evento de logout para desconectar o socket
    if (typeof window !== 'undefined') {
      window.addEventListener('auth:unauthorized', () => {
        this.disconnect();
      });
    }
  }

  public getStatus(): SocketStatus {
    return this.status;
  }

  public isConnected(): boolean {
    return this.status === 'connected';
  }

  private setStatus(newStatus: SocketStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((listener) => {
        try {
          listener(newStatus);
        } catch (e) {
          console.error('Error in status listener:', e);
        }
      });
    }
  }

  public connect(token?: string) {
    const authToken = token || localStorage.getItem('silentprint_token');
    if (!authToken) {
      this.disconnect();
      return;
    }

    if (this.socket?.connected) {
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.setStatus('connecting');

    this.socket = io(API_BASE_URL, {
      auth: {
        token: authToken,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      this.setStatus('connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.setStatus('disconnected');
      if (reason === 'io server disconnect') {
        // o servidor forçou desconexão, tentar reconectar manualmente
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.warn('Socket connection error:', error.message);
      this.setStatus('error');
    });

    this.socket.on('dashboard:update', (data: SocketDashboardEvent) => {
      const eventWithTime = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      this.dashboardListeners.forEach((listener) => {
        try {
          listener(eventWithTime);
        } catch (e) {
          console.error('Error in dashboard listener:', e);
        }
      });
    });
  }

  public disconnect() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  public onDashboardUpdate(listener: DashboardUpdateListener): () => void {
    this.dashboardListeners.add(listener);
    return () => {
      this.dashboardListeners.delete(listener);
    };
  }

  public onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    // Dispara status atual imediatamente
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
}

export const socketManager = new SocketManager();
