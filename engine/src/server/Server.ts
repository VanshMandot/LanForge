import WebSocket, { WebSocketServer } from "ws";
import { ClientConnection } from "./Client";
import { decodeMessage, isMessageType } from "../network/Encoder";
import { MessageType } from "../network/MessageTypes";
import { HelloMessage, NetworkMessage, CreateRoomMessage, JoinRoomMessage } from "../network/Protocol";
import { createUniqueId } from "../utils/id";
import { logger } from "../utils/logger";
import { RoomManager } from "./RoomManager";

// Heartbeat config
const HEARTBEAT_INTERVAL_MS = 5000;
const CLIENT_TIMEOUT_MS = 15000;
const SERVER_ID = "server";


export class LanForgeServer {
  private websocketServer!: WebSocketServer;
  private roomManager = new RoomManager();

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
        this.roomManager.removeClient(clientId);
        this.connectedClients.delete(clientId);
        logger.info(`Client removed: ${clientId}`);
      });
    });

    this.startHeartbeatLoop();
    logger.info(`LanForge server running on port ${port}`);
  }

  // Handle messages received from clients
  private handleIncomingMessage(client: ClientConnection, rawData: string) {
    const result = decodeMessage(rawData);
    if (!result.ok) {
      this.sendErrorMessage(client, result.error);
      return;
    }
    client.updateLastSeen();
    const message = result.message;

    switch (message.type) {
      case MessageType.PING:
        this.sendMessage(client, {
          type: MessageType.PONG,
          requestId: message.requestId,
          clientId: SERVER_ID,
          payload: { timestamp: Date.now() },
        });
        break;

      case MessageType.PONG:
        break;

      case MessageType.ECHO:
        const safeMsg = {
          ...message,
          clientId: client.clientId,
        };
        this.broadcastMessage(safeMsg, client.clientId);
        break;

      case MessageType.CREATE_ROOM:
        if (isMessageType<CreateRoomMessage>(message, MessageType.CREATE_ROOM)) {
          const roomName = message.payload.roomName || `Room-${createUniqueId()}`;
          const room = this.roomManager.createRoom(roomName, client.clientId, message.payload.maxPlayers);
          this.sendMessage(client, {
            type: MessageType.ROOM_STATE,
            requestId: message.requestId,
            clientId: SERVER_ID,
            payload: {
              roomId: room.id,
              players: room.clients,
              hostId: room.hostId
            }
          });
        }
        break;

      case MessageType.JOIN_ROOM:
        if (isMessageType<JoinRoomMessage>(message, MessageType.JOIN_ROOM)) {
          const room = this.roomManager.joinRoom(message.payload.roomId, client.clientId);
          if (room) {
            // Notify joiner
            this.sendMessage(client, {
              type: MessageType.ROOM_STATE,
              requestId: message.requestId,
              clientId: SERVER_ID,
              payload: {
                roomId: room.id,
                players: room.clients,
                hostId: room.hostId
              }
            });
            // Notify others
            this.broadcastToRoom(room.id, {
              type: MessageType.ROOM_STATE,
              requestId: createUniqueId("update-"),
              clientId: SERVER_ID,
              payload: {
                roomId: room.id,
                players: room.clients,
                hostId: room.hostId
              }
            });
          } else {
            this.sendErrorMessage(client, "Failed to join room (Full or invalid ID)");
          }
        }
        break;
      
      case MessageType.HELLO:
        if (isMessageType<HelloMessage>(message, MessageType.HELLO)) {
          const { deviceId, clientName } = message.payload;

          // Store deviceId on client
          client.deviceId = deviceId;

          logger.info(`Client ${client.clientId} identified as device ${deviceId}`);

          // Reply with WELCOME
          this.sendMessage(client, {
            type: MessageType.WELCOME,
            requestId: message.requestId,
            clientId: SERVER_ID,
            payload: { clientId: client.clientId },
          });
        }
        break;

      default:
        this.sendErrorMessage(client, "Unsupported message type");
    }
  }

  // Helper to broadcast to a specific room
  private broadcastToRoom(roomId: string, message: NetworkMessage) {
    const room = this.roomManager.getRoom(roomId);
    if (room) {
      for (const clientId of room.clients) {
        const client = this.connectedClients.get(clientId);
        if (client) {
          client.sendMessage({
            ...message,
            clientId: SERVER_ID, 
          });
        }
      }
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
      clientId: SERVER_ID,
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
          this.roomManager.removeClient(clientId);
          this.connectedClients.delete(clientId);
        } else {
          client.sendMessage({
            type: MessageType.PING,
            requestId: createUniqueId("ping-"),
            clientId: SERVER_ID,
            payload: { timestamp: Date.now() },
          });
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
}
