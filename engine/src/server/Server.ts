import WebSocket, { WebSocketServer } from "ws";
import { ClientConnection } from "./Client";
import { parseIncomingMessage } from "../network/Encoder";
import { MessageType } from "../network/MessageTypes";
import { NetworkMessage } from "../network/Protocol";
import { createUniqueId } from "../utils/id";
import { logger } from "../utils/logger";

// Heartbeat config
const HEARTBEAT_INTERVAL_MS = 5000;
const CLIENT_TIMEOUT_MS = 15000;

export class LanForgeServer {
  private websocketServer!: WebSocketServer;

  // Stores all connected clients
  private connectedClients = new Map<string, ClientConnection>();

  // Start server on given port
  start(port: number) {
    this.websocketServer = new WebSocketServer({ port });

    this.websocketServer.on("connection", (socket) => {
      const clientId = createUniqueId("client-");
      const client = new ClientConnection(clientId, socket);

      this.connectedClients.set(clientId, client);
      logger.info(`Client connected: ${clientId}`);

      socket.on("message", (data) => {
        this.handleIncomingMessage(client, data.toString());
      });

      socket.on("close", () => {
        this.connectedClients.delete(clientId);
        logger.info(`Client removed: ${clientId}`);
      });
    });

    this.startHeartbeatLoop();
    logger.info(`LanForge server running on port ${port}`);
  }

  // Handle messages received from clients
  private handleIncomingMessage(client: ClientConnection, rawData: string) {
    const message = parseIncomingMessage(rawData);

    if (!message) {
      this.sendErrorMessage(client, "Invalid message format");
      return;
    }

    client.updateLastSeen();

    switch (message.type) {
      case MessageType.PING:
        this.sendMessage(client, {
          type: MessageType.PONG,
          requestId: message.requestId,
          clientId: "server",
          payload: { timestamp: Date.now() },
        });
        break;

      case MessageType.PONG:
        // Client responded to heartbeat
        break;

      case MessageType.ECHO:
        this.broadcastMessage(message, client.clientId);
        break;

      default:
        this.sendErrorMessage(client, "Unsupported message type");
    }
  }

  // Send message to one client
  private sendMessage(client: ClientConnection, message: NetworkMessage) {
    client.sendMessage(message);
  }

  // Send message to all clients except sender
  private broadcastMessage(message: NetworkMessage, excludeClientId?: string) {
    for (const [clientId, client] of this.connectedClients) {
      if (clientId !== excludeClientId) {
        client.sendMessage(message);
      }
    }
  }

  // Send error message to client
  private sendErrorMessage(client: ClientConnection, reason: string) {
    this.sendMessage(client, {
      type: MessageType.ERROR,
      requestId: createUniqueId("error-"),
      clientId: "server",
      payload: { reason },
    });
  }

  // Periodically checks client health
  private startHeartbeatLoop() {
    setInterval(() => {
      const currentTime = Date.now();

      for (const [clientId, client] of this.connectedClients) {
        const timeSinceLastSeen = currentTime - client.lastActiveTime;

        if (timeSinceLastSeen > CLIENT_TIMEOUT_MS) {
          client.closeConnection("Heartbeat timeout");
          this.connectedClients.delete(clientId);
        } else {
          client.sendMessage({
            type: MessageType.PING,
            requestId: createUniqueId("ping-"),
            clientId: "server",
            payload: {},
          });
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
}
