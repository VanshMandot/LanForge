import WebSocket from "ws";
import { NetworkMessage } from "../network/Protocol";
import { serializeMessage } from "../network/Encoder";
import { logger } from "../utils/logger";

// Represents one connected client
export class ClientConnection {
  public lastActiveTime: number = Date.now();
  public isConnected: boolean = true;
  public deviceId?: string;
  public name?: string;

  constructor(
    public readonly clientId: string,
    private readonly socket: WebSocket
  ) { }

  // Send message to this client
  sendMessage(message: NetworkMessage) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(serializeMessage(message));
    }
  }

  // Update last activity timestamp
  updateLastSeen() {
    this.lastActiveTime = Date.now();
  }

  // Disconnect client safely
  closeConnection(reason: string) {
    logger.warn(`Client ${this.clientId} disconnected: ${reason}`);
    this.isConnected = false;
    this.socket.close();
  }
}
