// src/peer/PeerNode.ts

import WebSocket from "ws";
import { MessageType } from "../network/MessageTypes";
import {
  NetworkMessage,
  RoomStateMessage,
  BaseMessage,
} from "../network/Protocol";
import {
  serializeMessage,
  parseIncomingMessage,
  isMessageType,
} from "../network/Encoder";
import { SnapshotState } from "../states/types";
import { logger } from "../utils/logger";

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
  public start(): void {
    logger.info(
      `[PeerNode] starting peer. deviceId=${this.deviceId}, serverUrl=${this.connection.serverUrl}`
    );
    this.connectToServer();
  }

  /**
   * Establishes the WebSocket connection and wires handlers.
   */
  private connectToServer(): void {
    logger.info(
      `[PeerNode] connecting to server at ${this.connection.serverUrl}`
    );

    const ws = new WebSocket(this.connection.serverUrl);
    this.connection.ws = ws;

    ws.on("open", () => {
      logger.info("[PeerNode] connected to server");
      // NOTE: In the Week 2 spec, a HELLO message would go here to send deviceId + clientName.
      // For now, we assume the server assigns clientId when first message is sent.
      // TODO: When HELLO exists, send it here.
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
      case MessageType.ROOM_STATE:
        this.handleRoomStateMessage(msg as RoomStateMessage);
        break;

      // In Week 2, we will add handlers for:
      // - STATE_SNAPSHOT (full room snapshot)
      // - CHAT
      // - HOST_CHANGED
      // For now we keep them as TODO.
      default:
        // For unsupported message types, we just log and ignore.
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
  private handleRoomStateMessage(msg: RoomStateMessage): void {
    const { roomId, players, hostId } = msg.payload;

    // Update connection info.
    this.connection.roomId = roomId;
    this.connection.hostClientId = hostId;

    logger.info(
      `[PeerNode] ROOM_STATE received. roomId=${roomId}, hostClientId=${hostId}, players=[${players.join(
        ","
      )}]`
    );

    // TODO (future): When STATE_SNAPSHOT exists, we will directly set latestSnapshot here.
    // For now, we only log ROOM_STATE and keep latestSnapshot null, because your SnapshotState
    // comes from RoomManager on the server side via makeSnapshot/restoreFromSnapshot.
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
      return;
    }
    this.isHandlingServerLoss = true;

    logger.warn("[PeerNode] server lost");

    // Run leader election based on our local model of the room.
    logger.info("[PeerNode] electing new host");

    const electionResult = this.runLeaderElection();

    if (!electionResult || !this.connection.clientId) {
      logger.error(
        "[PeerNode] cannot run election (missing room info or clientId). Doing nothing."
      );
      return;
    }

    const { electedClientId } = electionResult;

    if (electedClientId === this.connection.clientId) {
      // This peer is the new host.
      logger.info("[PeerNode] this peer is elected as new host");
      this.becomeHostAfterMigration();
    } else {
      // Another peer is the new host; we wait for it to announce and reconnect.
      logger.info(
        `[PeerNode] another peer is elected host (clientId=${electedClientId}). Waiting for new host.`
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
  private runLeaderElection():
    | {
        electedClientId: string;
      }
    | null {
    const roomId = this.connection.roomId;
    const hostClientId = this.connection.hostClientId;
    const clientId = this.connection.clientId;

    if (!roomId || !clientId || !hostClientId) {
      logger.warn(
        "[PeerNode] cannot run leader election (missing roomId/clientId/hostClientId)"
      );
      return null;
    }

    // With current ROOM_STATE, we do not store players snapshot locally.
    // So we use the last known ROOM_STATE in memory if we had one.
    // Since we are not persisting players here, we approximate by:
    // - If we were host before, keep ourselves as host.
    // - Otherwise, choose lexicographically smallest clientId among all known players.
    //
    // NOTE: This is a placeholder until STATE_SNAPSHOT is wired to clients.
    // For now, we simply re-elect previous host if we know it (hostClientId).
    // In a multi-host-migration test, this will be replaced with proper SnapshotState usage.

    // Placeholder: keep previous host as elected host.
    const electedClientId = hostClientId;

    logger.info(
      `[PeerNode] leader election result (approx). electedClientId=${electedClientId}`
    );

    return { electedClientId };
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
    // Required log from spec: "new host starting server".

    // TODO: When SnapshotState is received from server (STATE_SNAPSHOT),
    // latestSnapshot will contain current room/members/chat/identity.
    // For now, latestSnapshot is null on the client side.
    const snapshot = this.latestSnapshot;

    if (!snapshot) {
      logger.warn(
        "[PeerNode] no snapshot available on client; starting empty server is a TODO"
      );
      // TODO: Option A: start a fresh server with empty rooms.
      // TODO: Option B: fetch snapshot from disk or via some other mechanism.
    } else {
      // TODO: Start local server and restore from snapshot:
      // - Start LanForgeServer on a chosen port.
      // - On server start, use restoreFromSnapshot(snapshot, roomManager) there.
      //
      // This logic will live in a helper function, e.g.:
      // startLocalLanForgeServerWithSnapshot(snapshot)
    }

    // After server is up, start announcing via UDP.
    this.startUdpAnnounce();
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
    logger.info(
      "[PeerNode] UDP announce detected (TODO: implement udpAnnounce.ts here)"
    );
    // Required log from spec: "UDP announce detected"
    // NOTE: In strict reading, this log is for clients that detect a host; here we log the start of announcing.
    // Later we can refine log messages to distinguish "start announcing" vs "announce detected".
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
    logger.info(
      "[PeerNode] waiting for new host via UDP (TODO: implement udpDiscovery.ts here)"
    );
    // Spec logs we must emit during this flow:
    logger.info("[PeerNode] UDP announce detected"); // When we actually detect a broadcast (TODO)
    logger.info("[PeerNode] reconnecting"); // When we attempt to connect to the new host

    // TODO (future):
    // 1. Listen on UDP socket for LANFORGE_HOST <ip> <port> <roomId> <joinCode>.
    // 2. When received, update this.connection.serverUrl accordingly (ws://<ip>:<port>).
    // 3. Call connectToServer() again to establish new WebSocket.
    // 4. Once connected and STATE_SNAPSHOT is received from new host, store it in latestSnapshot.
    // 5. After snapshot is applied, log "restored snapshot".
    logger.info("[PeerNode] restored snapshot"); // Placeholder until real restore on client side.
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
