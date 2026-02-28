// src/index.ts

import { PeerNode } from "./peer/PeerNode";
import { LanForgeServer } from "./server/Server";
import { logger } from "./utils/logger";
import { startDiscovery, stopDiscovery, DiscoveredHost } from "./discovery/udpDiscovery";
import * as readline from "readline";

function getEnvOrDefault(name: string, fallback: string): string {
  return process.env[name] && process.env[name]!.length > 0
    ? (process.env[name] as string)
    : fallback;
}

const DEVICE_ID = getEnvOrDefault("LANFORGE_DEVICE_ID", `device-${Math.floor(Math.random() * 10000)}`);
const SERVER_URL = getEnvOrDefault("LANFORGE_SERVER_URL", "ws://localhost:8080");

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || "discover"; // host, discover, join
  const clientName = args[1] || "Player-" + DEVICE_ID.slice(-4);
  const joinCode = args[2];

  logger.info(`[Main] Mode: ${mode}, Name: ${clientName}, DeviceId: ${DEVICE_ID}`);

  if (mode === "host") {
    // 1) Start server
    logger.info("[Main] Starting as HOST. Launching server...");
    const server = new LanForgeServer();
    server.start(8080);

    // 2) Start peer and connect to local server
    const peer = new PeerNode({
      deviceId: DEVICE_ID,
      serverUrl: "ws://localhost:8080",
      clientName: clientName,
    });
    await peer.start();

    // 3) Create room
    peer.createRoom("My Awesome Room");

    // 4) Start announcing
    // (peer as any).startUdpAnnounce(); // This is now automatic

    setupChatInterface(peer);
  }
  else if (mode === "discover") {
    logger.info("[Main] Starting in DISCOVERY mode. Listening for 5 seconds...");

    startDiscovery((host: DiscoveredHost) => {
      logger.info(`[Discovery] Found Room: ${host.roomId} | JoinCode: ${host.joinCode} | At: ${host.ip}:${host.port}`);
    });

    setTimeout(() => {
      logger.info("[Main] Discovery window closed.");
      stopDiscovery();
      // Keep alive if user wants to join manually? or just exit?
      // For now, let's just keep process alive.
    }, 5000);
  }
  else if (mode === "join") {
    if (!joinCode) {
      logger.error("[Main] joinCode required for 'join' mode. usage: npm start join <name> <code>");
      process.exit(1);
    }

    const peer = new PeerNode({
      deviceId: DEVICE_ID,
      serverUrl: SERVER_URL,
      clientName: clientName,
    });
    await peer.start();
    peer.joinRoom(joinCode);

    setupChatInterface(peer);
  }
}

function setupChatInterface(peer: PeerNode) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  logger.info("[Chat] Commands:");
  logger.info("  /kick <deviceId>      - Kick a peer (host only)");
  logger.info("  /startgame            - Start the game in this room (host only)");
  logger.info("  /gameaction <type>    - Submit a game action e.g. /gameaction MOVE");
  logger.info("  <message>             - Send a chat message");

  rl.on("line", (line) => {
    if (line.startsWith("/kick ")) {
      const target = line.split(" ")[1];
      (peer as any).send({
        type: "KICK",
        requestId: `kick-${Date.now()}`,
        clientId: (peer as any).connection.clientId,
        payload: { targetDeviceId: target }
      });

    } else if (line.trim() === "/startgame") {
      // Tell the server to start the game using real room members
      (peer as any).send({
        type: "GAME_START",
        requestId: `gs-${Date.now()}`,
        clientId: (peer as any).connection.clientId,
        payload: {}
      });
      logger.info("[Game] GAME_START sent");

    } else if (line.startsWith("/gameaction ")) {
      // Submit a game action, e.g. /gameaction MOVE
      const actionType = line.slice("/gameaction ".length).trim();
      (peer as any).send({
        type: "GAME_ACTION",
        requestId: `ga-${Date.now()}`,
        clientId: (peer as any).connection.clientId,
        payload: {
          type: actionType,
          payload: { submittedAt: Date.now() },
          sequence: Date.now(),
        }
      });
      logger.info(`[Game] GAME_ACTION sent: ${actionType}`);

    } else if (line.trim().length > 0) {
      peer.sendChat(line);
    }
  });
}

main().catch((err) => {
  logger.error("[Main] Unhandled error", err);
  process.exit(1);
});
