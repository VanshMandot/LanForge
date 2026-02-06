export enum MessageType {
    PING = "PING",
    PONG = "PONG",
    ECHO = "ECHO",
    ERROR = "ERROR",

    // Room Messages
    CREATE_ROOM = "CREATE_ROOM",
    JOIN_ROOM = "JOIN_ROOM",
    LEAVE_ROOM = "LEAVE_ROOM",
    ROOM_STATE = "ROOM_STATE",

    // Game Messages
    GAME_START = "GAME_START",
    GAME_ACTION = "GAME_ACTION",
    GAME_UPDATE = "GAME_UPDATE",
}

/**
 * Runtime guard to check whether an arbitrary value
 * corresponds to one of the defined MessageType enum values.
 * Used in the decoder to reject unknown types.
 */
export function isMessageTypeValue(value: unknown): value is MessageType {
  return typeof value === "string" && Object.values(MessageType).includes(value as MessageType);
}
