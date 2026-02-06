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
    LIST_ROOMS = "LIST_ROOMS",
    ROOM_LIST = "ROOM_LIST",
    UPDATE_ROOM_SETTINGS = "UPDATE_ROOM_SETTINGS",
    KICK_PLAYER = "KICK_PLAYER",
    PLAYER_READY = "PLAYER_READY",
    ROOM_EVENT = "ROOM_EVENT",

    // Chat & Pre-built Messages
    CHAT_MESSAGE = "CHAT_MESSAGE",
    QUICK_CHAT = "QUICK_CHAT",

    // Connection & Session
    WELCOME = "WELCOME",
    RECONNECT = "RECONNECT",

    // Game Messages
    GAME_START = "GAME_START",
    GAME_ACTION = "GAME_ACTION",
    GAME_UPDATE = "GAME_UPDATE",
}
