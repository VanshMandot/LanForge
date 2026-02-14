import dgram from "dgram";
import { logger } from "../utils/logger";

const DISCOVERY_PORT = 42069;

export interface DiscoveredHost {
    ip: string;
    port: number;
    roomId: string;
    joinCode: string;
    hostId: string;
    lastSeen: number;
}

let socket: dgram.Socket | null = null;
const discoveredHosts = new Map<string, DiscoveredHost>();

/**
 * Starts listening for UDP broadcasts from LanForge hosts.
 * @param onDiscovered Callback when a new or updated host is found.
 */
export function startDiscovery(
    onDiscovered: (host: DiscoveredHost) => void
): void {
    if (socket) {
        logger.warn("[UDP Discovery] Already listening. Ignoring start request.");
        return;
    }

    logger.info(`[UDP Discovery] Starting discovery on port=${DISCOVERY_PORT}`);

    socket = dgram.createSocket("udp4");

    socket.on("error", (err) => {
        logger.error("[UDP Discovery] Socket error:", err);
        stopDiscovery();
    });

    socket.on("message", (msg, rinfo) => {
        const text = msg.toString();
        // Expected format: LANFORGE_HOST <roomId> <hostId> <port>
        const parts = text.split(" ");

        if (parts[0] === "LANFORGE_HOST" && parts.length >= 5) {
            const roomId = parts[1];
            const joinCode = parts[2];
            const hostId = parts[3];
            const port = parseInt(parts[4], 10);
            const ip = rinfo.address;

            if (isNaN(port)) {
                logger.warn(`[UDP Discovery] Invalid port in broadcast from ${ip}`);
                return;
            }

            const key = `${ip}:${port}`;
            const host: DiscoveredHost = {
                ip,
                port,
                roomId,
                joinCode,
                hostId,
                lastSeen: Date.now(),
            };

            // Only notify if it's new or if some detail changed (unlikely for same key)
            // For now, we notify every time so the UI/logic knows it's alive?
            // Or maybe just update our map and only notify on *new* keys.
            if (!discoveredHosts.has(key)) {
                logger.info(`[UDP Discovery] Found new host: ${key} (Room: ${roomId})`);
                onDiscovered(host);
            }

            discoveredHosts.set(key, host);
        }
    });

    socket.bind(DISCOVERY_PORT);
}

/**
 * Stops listening for UDP broadcasts.
 */
export function stopDiscovery(): void {
    if (socket) {
        socket.close();
        socket = null;
        logger.info("[UDP Discovery] Stopped discovery");
    }
    discoveredHosts.clear();
}
