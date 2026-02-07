import WebSocket from "ws";
import { NetworkMessage } from "../network/Protocol";
import { serializeMessage } from "../network/Encoder";
import { logger } from "../utils/logger";

// Represents one connected client
export class ClientConnection {
  public lastActiveTime: number = Date.now();
  public isConnected: boolean = true;
  public deviceId?: string;

  constructor(
    public readonly clientId: string,
    private readonly socket: WebSocket
  ) {}

  sendMessage(message: NetworkMessage) {
    if (this.socket.readyState === WebSocket.OPEN) {
      const data = serializeMessage(message);
      if (!data) {
        logger.error("Serialization failed", { clientId: this.clientId, type: message.type });
        return;
      }
      this.socket.send(data);
    } else {
      logger.warn(
        `Cannot send message, socket not open`,
        { clientId: this.clientId, type: message.type }
      );
    }
  }

  // Call this when a valid message is received from the client
  // (for example: PONG, GAME_ACTION, JOIN_ROOM, etc.)
  updateLastSeen() {
    this.lastActiveTime = Date.now();
  }

  // Disconnect client safely
  closeConnection(reason: string) {
    // If already disconnected, do nothing
    if (!this.isConnected) return;

    logger.warn(`Client ${this.clientId} disconnected: ${reason}`);
    this.isConnected = false;

    // Close socket only if it is still open
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.terminate();
    }
  }
}