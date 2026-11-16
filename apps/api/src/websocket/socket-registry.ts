import { Server, Socket } from 'socket.io';

class SocketRegistry {
  private io: Server | null = null;
  private agentIdToSocket: Map<string, Socket> = new Map();
  private socketIdToAgentId: Map<string, string> = new Map();
  private machineTokenToAgentId: Map<string, string> = new Map();

  setIo(io: Server) {
    this.io = io;
  }

  getIo(): Server | null {
    return this.io;
  }

  registerAgentSocket(agentId: string, machineToken: string, socket: Socket) {
    this.agentIdToSocket.set(agentId, socket);
    this.socketIdToAgentId.set(socket.id, agentId);
    this.machineTokenToAgentId.set(machineToken, agentId);
  }

  unregisterSocket(socketId: string): string | null {
    const agentId = this.socketIdToAgentId.get(socketId);
    if (agentId) {
      this.socketIdToAgentId.delete(socketId);
      const activeSocket = this.agentIdToSocket.get(agentId);
      if (activeSocket && activeSocket.id === socketId) {
        this.agentIdToSocket.delete(agentId);
      }
      return agentId;
    }
    return null;
  }

  getSocketByAgentId(agentId: string): Socket | undefined {
    return this.agentIdToSocket.get(agentId);
  }

  isAgentOnline(agentId: string): boolean {
    const socket = this.agentIdToSocket.get(agentId);
    return Boolean(socket && socket.connected);
  }

  emitToAgent(agentId: string, event: string, payload: any): boolean {
    const socket = this.agentIdToSocket.get(agentId);
    if (socket && socket.connected) {
      socket.emit(event, payload);
      return true;
    }
    return false;
  }

  broadcastToAdmins(event: string, payload: any): void {
    if (this.io) {
      this.io.to('admins').emit(event, payload);
    }
  }

  broadcastGlobal(event: string, payload: any): void {
    if (this.io) {
      this.io.emit(event, payload);
    }
  }
}

export const socketRegistry = new SocketRegistry();
