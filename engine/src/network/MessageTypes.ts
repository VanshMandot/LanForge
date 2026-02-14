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

    // New Week 2 Messages
    HELLO = "HELLO",
    WELCOME = "WELCOME",
    CHAT = "CHAT",
    STATE_SNAPSHOT = "STATE_SNAPSHOT",
    HOST_CHANGED = "HOST_CHANGED",
    KICK = "KICK",
    KICKED = "KICKED",

    // Game Messages
    GAME_START = "GAME_START",
    GAME_ACTION = "GAME_ACTION",
    GAME_UPDATE = "GAME_UPDATE",
}
