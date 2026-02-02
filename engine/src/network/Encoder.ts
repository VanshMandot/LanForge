import { NetworkMessage } from "./Protocol";
import { MessageType } from "./MessageTypes";
import { logger } from "../utils/logger";

export function serializeMessage(message: NetworkMessage): string {
    try {
        return JSON.stringify(message);
    } catch (err) {
        logger.error("Failed to serialize message", err);
        return "";
    }
}

export function parseIncomingMessage(rawData: string): NetworkMessage | null {
    try {
        const parsed = JSON.parse(rawData);
        // Basic validation could go here (check if 'type' exists, etc.)
        if (!parsed || typeof parsed !== "object" || !parsed.type) {
            logger.warn("Invalid message structure received");
            return null;
        }
        return parsed as NetworkMessage;
    } catch (err) {
        logger.error("Failed to parse incoming message", err);
        return null;
    }
}

// Type guard helper
export function isMessageType<T extends NetworkMessage>(msg: NetworkMessage, type: MessageType): msg is T {
    return msg.type === type;
}
