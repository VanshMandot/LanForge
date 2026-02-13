// src/index.ts

import { PeerNode } from "./peer/PeerNode";
import { logger } from "./utils/logger";

// Simple helper to read env vars or fall back to defaults.
function getEnvOrDefault(name: string, fallback: string): string {
  return process.env[name] && process.env[name]!.length > 0
    ? (process.env[name] as string)
    : fallback;
}

// In a real CLI, you might read these from process.argv or prompts.
// For now, we use environment variables or simple defaults.
const DEVICE_ID = getEnvOrDefault("LANFORGE_DEVICE_ID", `device-${Date.now()}`);
const CLIENT_NAME = getEnvOrDefault("LANFORGE_CLIENT_NAME", "Player1");

// This is the URL of the current host server.
// When you run LanForgeServer locally, this will usually be ws://localhost:<port>.
const SERVER_URL = getEnvOrDefault("LANFORGE_SERVER_URL", "ws://localhost:8080");

// Entry point: start a single PeerNode instance and keep process alive.
async function main() {
  logger.info(
    `[Main] Starting PeerNode with deviceId=${DEVICE_ID}, clientName=${CLIENT_NAME}, serverUrl=${SERVER_URL}`
  );

  const peer = new PeerNode({
    deviceId: DEVICE_ID,
    serverUrl: SERVER_URL,
    clientName: CLIENT_NAME,
  });

  peer.start();
}

// Run main and log any unexpected errors.
main().catch((err) => {
  logger.error("[Main] Unhandled error in main()", err);
  process.exit(1);
});
