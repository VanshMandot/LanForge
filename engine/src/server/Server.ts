import WebSocket, { WebSocketServer } from "ws";
import { ClientConnection } from "./Client";
import { parseIncomingMessage, isMessageType } from "../network/Encoder";
import { MessageType } from "../network/MessageTypes";
import {
  NetworkMessage,
  CreateRoomMessage,
  JoinRoomMessage,
  HelloMessage,
  ChatMessage,
  KickMessage,
} from "../network/Protocol";
import { createUniqueId } from "../utils/id";
import { logger } from "../utils/logger";
import { RoomManager } from "./RoomManager";

// Heartbeat config
const HEARTBEAT_INTERVAL_MS = 5000;
const CLIENT_TIMEOUT_MS = 15000;

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
        if (client.deviceId) {
          const room = this.roomManager.leaveRoom(client.deviceId);
          if (room) {
            this.broadcastRoomState(room.roomId);
          }
        }
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
        break;

      case MessageType.HELLO:
        if (isMessageType<HelloMessage>(message, MessageType.HELLO)) {
          client.deviceId = message.payload.deviceId;
          client.name = message.payload.name;
          logger.info(`Client ${client.clientId} identified as ${client.name} (${client.deviceId})`);
          this.sendMessage(client, {
            type: MessageType.WELCOME,
            requestId: message.requestId,
            clientId: "server",
            payload: { clientId: client.clientId }
          });
        }
        break;

      case MessageType.CREATE_ROOM:
        if (isMessageType<CreateRoomMessage>(message, MessageType.CREATE_ROOM)) {
          if (!client.deviceId || !client.name) {
            this.sendErrorMessage(client, "Must send HELLO first");
            break;
          }
          const roomId = createUniqueId("room-");
          const room = this.roomManager.createRoom(
            roomId,
            client.deviceId,
            client.clientId,
            client.name
          );

          logger.info(`Room created: ${room.roomId} by ${client.name}. JoinCode: ${room.joinCode}`);
          this.broadcastRoomState(room.roomId);
        }
        break;

      case MessageType.JOIN_ROOM:
        if (isMessageType<JoinRoomMessage>(message, MessageType.JOIN_ROOM)) {
          if (!client.deviceId || !client.name) {
            this.sendErrorMessage(client, "Must send HELLO first");
            break;
          }
          try {
            const room = this.roomManager.joinRoomByCode(
              message.payload.joinCode,
              client.deviceId,
              client.clientId,
              client.name
            );
            logger.info(`Client ${client.name} joined room ${room.roomId}`);
            this.broadcastRoomState(room.roomId);
          } catch (err: any) {
            this.sendErrorMessage(client, err.message || "Failed to join room");
          }
        }
        break;

      case MessageType.CHAT:
        if (isMessageType<ChatMessage>(message, MessageType.CHAT)) {
          if (!client.deviceId) {
            this.sendErrorMessage(client, "Must send HELLO first");
            break;
          }
          const room = this.roomManager.findRoomByDevice(client.deviceId);
          if (!room) {
            this.sendErrorMessage(client, "Not in a room");
            break;
          }

          // Store the chat message
          const chatMessage = this.roomManager.appendChat(room.roomId, client.deviceId, message.payload.text);

          // Broadcast the CHAT message to all room members for real-time display
          this.broadcastToRoom(room.roomId, {
            type: MessageType.CHAT,
            requestId: createUniqueId("chat-"),
            clientId: "server",
            payload: {
              fromDeviceId: chatMessage.fromDeviceId,
              fromName: chatMessage.fromName,
              text: chatMessage.text,
              timestamp: chatMessage.timestamp
            }
          });

          // Also update the room state snapshot
          this.broadcastRoomState(room.roomId);
        }
        break;

      case MessageType.KICK:
        if (isMessageType<KickMessage>(message, MessageType.KICK)) {
          if (!client.deviceId) {
            this.sendErrorMessage(client, "Must send HELLO first");
            break;
          }
          try {
            const room = this.roomManager.kick(client.deviceId, message.payload.targetDeviceId);
            this.broadcastRoomState(room.roomId);

            // Optionally notify the kicked client
            // This is tricky because they might still be connected but not in room members.
          } catch (err: any) {
            this.sendErrorMessage(client, err.message || "Failed to kick");
          }
        }
        break;

      default:
        this.sendErrorMessage(client, "Unsupported message type");
    }
  }

  // Helper to broadcast full room state (snapshot) to all members
  private broadcastRoomState(roomId: string) {
    const snapshot = this.roomManager.makeSnapshot(roomId);
    if (!snapshot) return;

    const message: NetworkMessage = {
      type: MessageType.STATE_SNAPSHOT,
      requestId: createUniqueId("snap-"),
      clientId: "server",
      payload: { snapshot }
    };

    const room = this.roomManager.getRoom(roomId);
    if (room) {
      for (const member of room.members) {
        const client = this.connectedClients.get(member.clientId);
        if (client) {
          client.sendMessage(message);
        }
      }
    }
  }

  // Helper to broadcast to a specific room
  private broadcastToRoom(roomId: string, message: NetworkMessage) {
    const room = this.roomManager.getRoom(roomId);
    if (room) {
      for (const member of room.members) {
        const client = this.connectedClients.get(member.clientId);
        if (client) {
          client.sendMessage(message);
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
            payload: { timestamp: Date.now() },
          });
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
}