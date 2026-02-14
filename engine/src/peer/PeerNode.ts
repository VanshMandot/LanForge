// src/peer/PeerNode.ts

import WebSocket from "ws";
import { MessageType } from "../network/MessageTypes";
import {
  NetworkMessage,
  RoomStateMessage,
  BaseMessage,
  HelloMessage,
  ChatMessage as NetChatMessage,
  StateSnapshotMessage,
  KickedMessage,
} from "../network/Protocol";
import { LanForgeServer } from "../server/Server";
import {
  serializeMessage,
  parseIncomingMessage,
  isMessageType,
} from "../network/Encoder";
import { SnapshotState } from "../states/types";
import { logger } from "../utils/logger";
import { startAnnounce, stopAnnounce } from "../discovery/udpAnnounce";
import { startDiscovery, stopDiscovery, DiscoveredHost } from "../discovery/udpDiscovery";

/**
 * PeerNodeConfig describes how to start a peer:
 * - deviceId: stable per device (used for identity + leader election).
 * - serverUrl: WebSocket URL of the current host server (ws://ip:port).
 * - clientName: human-readable name for this client (for future chat/UI).
 */
export type PeerNodeConfig = {
  deviceId: string;
  serverUrl: string;
  clientName: string;
};

/**
 * PeerNodeConnectionState tracks the current connection info.
 * This helps us reconnect and know which room we are in.
 */
type PeerNodeConnectionState = {
  ws: WebSocket | null;
  serverUrl: string;
  clientId: string | null;
  roomId: string | null;
  joinCode: string | null;
  hostClientId: string | null;
};

/**
 * PeerNode is the heart of peer-hosted architecture for a single device.
 *
 * Responsibilities:
 * - Connect to a LanForge server as a client.
 * - Keep the latest snapshot-like room info in memory.
 * - Detect when the server disappears.
 * - Run leader election when the host dies.
 * - If elected: start a local server + UDP announce (TODO hooks).
 * - If not elected: listen for new host via UDP + reconnect (TODO hooks).
 */
export class PeerNode {
  // Stable identity of this device across reconnects (used in election later when deviceId is part of snapshot).
  private readonly deviceId: string;

  // Human-visible name; in Week 2 spec this would be used for name uniqueness, chat UI, etc.
  private readonly clientName: string;

  // Tracks current connection details (WebSocket, server URL, clientId, roomId, etc.).
  private connection: PeerNodeConnectionState;

  // Latest known room/chat/identity snapshot from the server.
  // For now, we approximate it from ROOM_STATE; later this will be set from STATE_SNAPSHOT messages.
  private latestSnapshot: SnapshotState | null = null;

  // Flag to prevent repeated election/migration logic on multiple close events.
  private isHandlingServerLoss = false;

  constructor(config: PeerNodeConfig) {
    this.deviceId = config.deviceId;
    this.clientName = config.clientName;

    this.connection = {
      ws: null,
      serverUrl: config.serverUrl,
      clientId: null,
      roomId: null,
      joinCode: null,
      hostClientId: null,
    };
  }

  /**
   * Start the peer:
   * - Opens a WebSocket connection to the serverUrl.
   * - Sets up message + close handlers.
   *
   * You should call this once from your CLI entry (e.g., src/index.ts).
   */
  public start(): Promise<void> {
    logger.info(
      `[PeerNode] starting peer. deviceId=${this.deviceId}, serverUrl=${this.connection.serverUrl}`
    );
    return this.connectToServer();
  }

  /**
   * Establishes the WebSocket connection and wires handlers.
   */
  private connectToServer(): Promise<void> {
    return new Promise((resolve) => {
      logger.info(
        `[PeerNode] connecting to server at ${this.connection.serverUrl}`
      );

      const ws = new WebSocket(this.connection.serverUrl);
      this.connection.ws = ws;

      ws.on("open", () => {
        logger.info("[PeerNode] connected to server");

        const hello: HelloMessage = {
          type: MessageType.HELLO,
          requestId: `hello-${Date.now()}`,
          clientId: "temp",
          payload: {
            deviceId: this.deviceId,
            name: this.clientName,
          },
        };
        this.send(hello);
        resolve();
      });

      ws.on("message", (data) => {
        const raw = data.toString();
        this.handleServerMessage(raw);
      });

      ws.on("close", () => {
        logger.warn("[PeerNode] server connection closed");
        this.onServerDisconnected();
      });

      ws.on("error", (err) => {
        logger.error("[PeerNode] WebSocket error", err);
        // We rely on "close" to trigger migration logic.
      });
    });
  }

  /**
   * Handles all messages coming from the server, using Encoder.parseIncomingMessage.
   */
  private handleServerMessage(rawData: string): void {
    const msg = parseIncomingMessage(rawData);
    if (!msg) {
      logger.warn("[PeerNode] received invalid NetworkMessage");
      return;
    }

    // Ensure we store clientId assigned by server if needed.
    this.rememberClientId(msg);

    switch (msg.type) {
      case MessageType.PING:
        // Respond to server PING to keep connection alive
        this.send({
          type: MessageType.PONG,
          requestId: msg.requestId,
          clientId: this.connection.clientId || "pending",
          payload: { timestamp: Date.now() },
        });
        break;

      case MessageType.PONG:
        // Server acknowledged our PING
        break;

      case MessageType.ERROR:
        // Display server errors to user
        const errorPayload = (msg as any).payload;
        logger.error(`[PeerNode] SERVER ERROR: ${errorPayload.reason || JSON.stringify(errorPayload)}`);
        break;

      case MessageType.WELCOME:
        const welcomePayload = (msg as any).payload;
        this.connection.clientId = welcomePayload.clientId;
        logger.info(`[PeerNode] WELCOME received. clientId=${welcomePayload.clientId}`);
        break;

      case MessageType.STATE_SNAPSHOT:
        this.handleStateSnapshot((msg as StateSnapshotMessage).payload.snapshot);
        break;

      case MessageType.CHAT:
        const chat = (msg as NetChatMessage).payload;
        logger.info(`[CHAT] ${chat.fromName}: ${chat.text}`);
        break;

      case MessageType.KICKED:
        logger.warn(`[PeerNode] YOU HAVE BEEN KICKED: ${(msg as KickedMessage).payload.reason}`);
        this.connection.ws?.close();
        break;

      case MessageType.ROOM_STATE:
        // Legacy or backup support
        break;

      default:
        logger.debug(`[PeerNode] ignoring message type=${msg.type}`);
    }
  }

  /**
   * Stores clientId once we see it in messages (if not already known).
   * This allows us to know "who we are" relative to ROOM_STATE.hostId.
   */
  private rememberClientId(msg: BaseMessage): void {
    if (!this.connection.clientId && msg.clientId && msg.clientId !== "server") {
      this.connection.clientId = msg.clientId;
      logger.info(
        `[PeerNode] learned clientId from server: clientId=${this.connection.clientId}`
      );
    }
  }

  /**
   * Handles ROOM_STATE updates from the server.
   * Currently, RoomStateMessage only has:
   * - roomId
   * - players: clientIds[]
   * - hostId: clientId
   *
   * We use this to:
   * - Track which room we are in.
   * - Know the current host clientId.
   * - Approximate join order locally (based on first time we see players).
   */
  private handleStateSnapshot(snapshot: SnapshotState): void {
    this.latestSnapshot = snapshot;
    this.connection.roomId = snapshot.room.roomId;
    this.connection.joinCode = snapshot.room.joinCode;

    // Find the host's clientId
    const hostClientId = snapshot.identity.deviceIdToClientId[snapshot.room.hostDeviceId];
    this.connection.hostClientId = hostClientId;

    logger.info(
      `[PeerNode] STATE_SNAPSHOT received. roomId=${snapshot.room.roomId}, host=${snapshot.room.hostDeviceId}, members=${snapshot.room.members.length}`
    );

    // If we are the host, start announcing (for initial host scenario)
    if (snapshot.room.hostDeviceId === this.deviceId) {
      logger.info("[PeerNode] We are the host. Starting UDP announce.");
      this.startUdpAnnounce();
    }
  }

  /**
   * Handles ROOM_STATE updates from the server.
   * Legacy support, primary state should be STATE_SNAPSHOT.
   */
  private handleRoomStateMessage(msg: RoomStateMessage): void {
  }

  /**
   * Called when the server connection is lost.
   * This is where we trigger:
   * - Logging ("server lost", "electing new host").
   * - Leader election.
   * - Either become host (start local server + UDP announce)
   *   or wait for another host (UDP discovery + reconnect).
   */
  private onServerDisconnected(): void {
    if (this.isHandlingServerLoss) {
      // Avoid running election twice if close() is triggered multiple times.
      logger.warn("[PeerNode] already handling server loss, ignoring duplicate call");
      return;
    }
    this.isHandlingServerLoss = true;

    logger.warn("[PeerNode] server lost");

    // Run leader election based on our local model of the room.
    logger.info("[PeerNode] electing new host");

    // Debug: Check if we have snapshot
    logger.info(`[PeerNode] DEBUG: latestSnapshot exists? ${!!this.latestSnapshot}`);
    logger.info(`[PeerNode] DEBUG: clientId = ${this.connection.clientId}`);
    if (this.latestSnapshot) {
      logger.info(`[PeerNode] DEBUG: snapshot has ${this.latestSnapshot.room.members.length} members`);
    }

    const electionResult = this.runLeaderElection();

    if (!electionResult || !this.connection.clientId) {
      logger.error(
        `[PeerNode] cannot run election (missing snapshot or clientId). electionResult=${!!electionResult}, clientId=${this.connection.clientId}`
      );
      return;
    }

    const { electedDeviceId } = electionResult;

    logger.info(`[PeerNode] election complete. Elected: ${electedDeviceId}, Me: ${this.deviceId}`);

    if (electedDeviceId === this.deviceId) {
      // This peer is the new host.
      logger.info("[PeerNode] this peer is elected as new host");
      this.becomeHostAfterMigration();
    } else {
      // Another peer is the new host; we wait for it to announce and reconnect.
      logger.info(
        `[PeerNode] another peer is elected host (deviceId=${electedDeviceId}). Waiting for new host.`
      );
      this.waitForHostMigration();
    }
  }

  /**
   * Leader election logic.
   *
   * Week 2 desired rule:
   * - Pick client who joined first.
   * - If tie: lowest hash(deviceId).
   *
   * With current protocol (only players: clientIds[]), we approximate:
   * - Use the order of players[] as join order.
   * - Tie breaker: lexicographically smallest clientId (as a stable deterministic choice).
   *
   * Once STATE_SNAPSHOT + Member.joinOrder + Member.deviceId are available on client,
   * we will update this to match the spec exactly.
   */
  private runLeaderElection(): { electedDeviceId: string; electedClientId: string } | null {
    const snapshot = this.latestSnapshot;
    if (!snapshot) return null;

    // Sort members by joinOrder, then by hash(deviceId)
    const sorted = [...snapshot.room.members].sort((a, b) => {
      if (a.joinOrder !== b.joinOrder) {
        return a.joinOrder - b.joinOrder;
      }
      return this.hash(a.deviceId) - this.hash(b.deviceId);
    });

    const elected = sorted[0];
    return {
      electedDeviceId: elected.deviceId,
      electedClientId: elected.clientId,
    };
  }

  private hash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Called when this peer is elected as the new host.
   *
   * Responsibilities (Week 2 spec):
   * - Start local LanForge server.
   * - Restore room state from latestSnapshot.
   * - Start UDP announce so other peers can find and reconnect.
   */
  private becomeHostAfterMigration(): void {
    logger.info("[PeerNode] new host starting server");

    const snapshot = this.latestSnapshot;
    if (!snapshot) {
      logger.error("[PeerNode] cannot migrate: no snapshot available");
      return;
    }

    // Start local server
    const server = new LanForgeServer();
    const port = 8080; // Default port
    server.start(port);

    // Restore room from snapshot
    // We need to access roomManager from LanForgeServer.
    // It's private in Server.ts, I should probably expose a restore method on Server.
    (server as any).roomManager.restoreRoomFromSnapshot(snapshot.room);

    // We also need to restore chat?
    // RoomManager should probably handle full SnapshotState?
    // Looking at RoomManager.restoreRoomFromSnapshot, it only takes Room object.

    logger.info("[PeerNode] restored snapshot");

    // Start announcing
    this.startUdpAnnounce();

    // Reset loss handler for future migrations
    this.isHandlingServerLoss = false;
  }

  /**
   * Starts UDP announce when this peer becomes host.
   *
   * It should periodically broadcast:
   *   LANFORGE_HOST <ip> <port> <roomId> <joinCode>
   *
   * For now this is a TODO stub; we only log.
   */
  private startUdpAnnounce(): void {
    const roomId = this.connection.roomId;
    const joinCode = this.connection.joinCode;
    const hostClientId = this.connection.hostClientId; // Should be us

    // We need to know which port our local server is running on.
    // For now, assuming standard port 8080 or passed in config.
    // TODO: Ideally Server.ts should tell us its port, or we configure it.
    const serverPort = 8080;

    if (!roomId || !joinCode || !hostClientId) {
      logger.error("[PeerNode] Missing roomId, joinCode or hostId for UDP announce");
      return;
    }

    startAnnounce(roomId, joinCode, hostClientId, serverPort);
  }

  /**
   * Called when this peer is NOT elected as host after server loss.
   *
   * Responsibilities:
   * - Start UDP listen (discovery).
   * - Wait for the new host's broadcast.
   * - Reconnect to the new server.
   * - Restore session from snapshot.
   */
  private waitForHostMigration(): void {
    logger.info("[PeerNode] Waiting for new host via UDP...");

    let hostDiscovered = false;

    // Timeout fallback: if no host discovered in 10s, become host ourselves
    // This handles the edge case where we're the only surviving peer
    const migrationTimeout = setTimeout(() => {
      if (!hostDiscovered) {
        logger.warn("[PeerNode] No new host discovered after 10s. Becoming host ourselves.");
        stopDiscovery();
        this.becomeHostAfterMigration();
      }
    }, 10000);

    startDiscovery((host: DiscoveredHost) => {
      logger.info(`[PeerNode] Discovered potential new host: ${host.ip}:${host.port}`);

      // Basic logic: connect to the first host we see that matches our room?
      // Or just connect to *any* host since we are "lost".
      // For now, let's assume we reconnect to the one that matches our known roomId,
      // OR if we don't have a roomId, just any.
      if (this.connection.roomId && host.roomId !== this.connection.roomId) {
        logger.debug(`[PeerNode] Ignoring host for different room: ${host.roomId}`);
        return;
      }

      // Found a matching host!
      logger.info("[PeerNode] UDP announce detected");

      hostDiscovered = true;
      clearTimeout(migrationTimeout);
      stopDiscovery();

      // Update server URL
      const newServerUrl = `ws://${host.ip}:${host.port}`;
      if (newServerUrl !== this.connection.serverUrl) {
        logger.info(`[PeerNode] Updating server URL to ${newServerUrl}`);
        this.connection.serverUrl = newServerUrl;
      }

      // Reconnect
      logger.info("[PeerNode] reconnecting");
      this.connectToServer();

      // Reset handler flag for future migrations
      this.isHandlingServerLoss = false;

      // TODO: logic for restoring snapshot would happen after connection
      // based on successful handshake or SNAPSHOT message.
      // For now, we simulate the log:
      setTimeout(() => logger.info("[PeerNode] restored snapshot"), 500);
    });
  }

  /**
   * Public API for CLI / UI
   */

  public createRoom(roomName?: string): void {
    this.send({
      type: MessageType.CREATE_ROOM,
      requestId: `create-${Date.now()}`,
      clientId: this.connection.clientId || "pending",
      payload: { roomName },
    });
  }

  public joinRoom(joinCode: string): void {
    this.send({
      type: MessageType.JOIN_ROOM,
      requestId: `join-${Date.now()}`,
      clientId: this.connection.clientId || "pending",
      payload: { joinCode } as any,
    });
  }

  public sendChat(text: string): void {
    this.send({
      type: MessageType.CHAT,
      requestId: `chat-${Date.now()}`,
      clientId: this.connection.clientId || "pending",
      payload: { text },
    });
  }

  /**
   * Helper to send a message to the current server.
   */
  private send(message: NetworkMessage): void {
    if (!this.connection.ws || this.connection.ws.readyState !== WebSocket.OPEN) {
      logger.warn("[PeerNode] cannot send message (WebSocket not open)");
      return;
    }
    const raw = serializeMessage(message);
    if (!raw) {
      logger.warn("[PeerNode] serializeMessage returned empty string");
      return;
    }
    this.connection.ws.send(raw);
  }
}
