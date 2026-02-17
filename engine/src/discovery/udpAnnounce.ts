import dgram from "dgram";
import { logger } from "../utils/logger";

const BROADCAST_ADDRESS = "255.255.255.255";
const DISCOVERY_PORT = 42069;
const ANNOUNCE_INTERVAL_MS = 3000;

let socket: dgram.Socket | null = null;
let intervalId: NodeJS.Timeout | null = null;


/**
 * Starts periodic UDP announcements of the current room.
 * Payload format: LANFORGE_HOST <roomId> <joinCode> <hostId> <port>
 * Note: IP is not sent; receivers infer it from rinfo.address.
 */
export function startAnnounce(
    roomId: string,
    joinCode: string,
    hostId: string,
    serverPort: number
): void {
    if (socket) {
        logger.warn("[UDP Announce] Already announcing. Ignoring start request.");
        return;
    }

    logger.info(
        `[UDP Announce] Starting announcement for room=${roomId} on port=${DISCOVERY_PORT}`
    );

    socket = dgram.createSocket("udp4");

    socket.bind(() => {
        socket!.setBroadcast(true);
    });

    socket.on("error", (err) => {
        logger.error("[UDP Announce] Socket error:", err);
        stopAnnounce();
    });

    const message = Buffer.from(`LANFORGE_HOST ${roomId} ${joinCode} ${hostId} ${serverPort}`);

    intervalId = setInterval(() => {
        if (!socket) return;
        socket.send(message, DISCOVERY_PORT, BROADCAST_ADDRESS, (err) => {
            if (err) {
                logger.error("[UDP Announce] Failed to send broadcast:", err);
            } else {
                logger.debug("[UDP Announce] Sent broadcast");
            }
        });
    }, ANNOUNCE_INTERVAL_MS);
}

/**
 * Stops periodic UDP announcements and closes the socket.
 */
export function stopAnnounce(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    if (socket) {
        socket.close();
        socket = null;
        logger.info("[UDP Announce] Stopped announcement");
    }
}
