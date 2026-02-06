import { NetworkMessage } from "./Protocol";
import { MessageType, isMessageTypeValue } from "./MessageTypes";
import { logger } from "../utils/logger";

export function serializeMessage(message: NetworkMessage): string | null {
    try {
        return JSON.stringify(message);
    } catch (err) {
        logger.error("Failed to serialize message", err);
        return null;
    }
}

export function parseIncomingMessage(rawData: string): NetworkMessage | null {
    try {
        const parsed = JSON.parse(rawData);
        // Basic validation could go here (check if 'type' exists, etc.)
        if (!parsed || typeof parsed !== "object" ) {
            logger.warn("Invalid message structure received (non-object)", { rawdata });
            return null;
        }
        
        const maybeMsg = parsed as Partial<NetworkMessage>;

        if (!maybeMsg.type || !isMessageTypeValue(maybeMsg.type)) {
          logger.warn("Invalid or unknown message type", {
            rawData,
            type: maybeMsg.type,
          });
          return null;
        }

        if (typeof maybeMsg.requestId !== "string" || typeof maybeMsg.clientId !== "string") {
          logger.warn("Missing requestId/clientId in message", { rawData });
          return null;
        }

        return maybeMsg as NetworkMessage;
      } catch (err) {
        logger.error("Failed to parse incoming message", { err, rawData });
        return null;
      }
}

// Type guard helper
export function isMessageType<T extends NetworkMessage>(msg: NetworkMessage, type: MessageType): msg is T {
    return msg.type === type;
}
