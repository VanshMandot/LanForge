import { NetworkMessage } from "./Protocol";
import { MessageType } from "./MessageTypes";
import { logger } from "../utils/logger";

export type DecodeResult =
  | { ok: true; message: NetworkMessage }
  | { ok: false; error: string };

export function serializeMessage(message: NetworkMessage): string {
    try {
        return JSON.stringify(message);
    } catch (err) {
        logger.error("Failed to serialize message", err);
        return "";
    }
}

export function decodeMessage(rawData: string): DecodeResult {
  try {
    const parsed = JSON.parse(rawData);

    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Message must be a JSON object" };
    }

    // validate required fields
    if (typeof (parsed as any).type !== "string") {
      return { ok: false, error: "Missing or invalid 'type'" };
    }
    if (typeof (parsed as any).requestId !== "string") {
      return { ok: false, error: "Missing or invalid 'requestId'" };
    }

    // validate type is known
    const type = (parsed as any).type as string;
    if (!Object.values(MessageType).includes(type as MessageType)) {
      return { ok: false, error: `Unknown message type: ${type}` };
    }

    // Payload should be object if present
    const payload = (parsed as any).payload;
    if (payload !== undefined && (payload === null || typeof payload !== "object")) {
      return { ok: false, error: "Invalid 'payload' (must be an object)" };
    }

    return { ok: true, message: parsed as NetworkMessage };
  } catch (err) {
    logger.warn("Invalid JSON received", err);
    return { ok: false, error: "Invalid JSON" };
  }
}

// Type guard helper
export function isMessageType<T extends NetworkMessage>(msg: NetworkMessage, type: MessageType): msg is T {
    return msg.type === type;
}
