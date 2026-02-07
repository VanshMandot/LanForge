export enum MessageType {
    HELLO = "HELLO",
    WELCOME = "WELCOME",

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
