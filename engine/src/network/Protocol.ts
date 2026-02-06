import { MessageType } from "./MessageTypes";

export interface BaseMessage {
    type: MessageType;
    requestId: string;
    clientId: string;
}

// --- Connection Messages ---
export interface PingMessage extends BaseMessage {
    type: MessageType.PING;
    payload: {};
}

export interface PongMessage extends BaseMessage {
    type: MessageType.PONG;
    payload: { timestamp: number };
}

export interface EchoMessage extends BaseMessage {
    type: MessageType.ECHO;
    payload: { text: string };
}

export interface ErrorMessage extends BaseMessage {
    type: MessageType.ERROR;
    payload: { reason: string; code?: number };
}

export interface WelcomeMessage extends BaseMessage {
    type: MessageType.WELCOME;
    payload: {
        sessionId: string;
        clientId: string;
    };
}

export interface ReconnectMessage extends BaseMessage {
    type: MessageType.RECONNECT;
    payload: {
        sessionId: string;
    };
}

// --- Room Messages ---
export interface CreateRoomMessage extends BaseMessage {
    type: MessageType.CREATE_ROOM;
    payload: {
        roomName?: string;
        maxPlayers?: number;
    };
}

export interface JoinRoomMessage extends BaseMessage {
    type: MessageType.JOIN_ROOM;
    payload: {
        roomId: string;
    };
}

export interface LeaveRoomMessage extends BaseMessage {
    type: MessageType.LEAVE_ROOM;
    payload: {
        roomId: string;
    };
}

export interface RoomStateMessage extends BaseMessage {
    type: MessageType.ROOM_STATE;
    payload: {
        roomId: string;
        players: string[]; // List of clientIds
        hostId: string;
    };
}

export interface ListRoomsMessage extends BaseMessage {
    type: MessageType.LIST_ROOMS;
    payload: {};
}

export interface RoomListMessage extends BaseMessage {
    type: MessageType.ROOM_LIST;
    payload: {
        rooms: {
            id: string;
            name: string;
            currentPlayers: number;
            maxPlayers: number;
        }[];
    };
}

export interface UpdateRoomSettingsMessage extends BaseMessage {
    type: MessageType.UPDATE_ROOM_SETTINGS;
    payload: {
        roomId: string;
        settings: {
            maxPlayers?: number;
            mapId?: string;
            mode?: string;
        };
    };
}

export interface KickPlayerMessage extends BaseMessage {
    type: MessageType.KICK_PLAYER;
    payload: {
        roomId: string;
        targetClientId: string;
        reason?: string;
    };
}

export interface PlayerReadyMessage extends BaseMessage {
    type: MessageType.PLAYER_READY;
    payload: {
        roomId: string;
        isReady: boolean;
    };
}

export interface RoomEventMessage extends BaseMessage {
    type: MessageType.ROOM_EVENT;
    payload: {
        eventType: "JOIN" | "LEAVE" | "KICK" | "READY" | "SETTINGS";
        message: string;
        timestamp: number;
    };
}

// --- Chat Messages ---
export interface ChatMessage extends BaseMessage {
    type: MessageType.CHAT_MESSAGE;
    payload: {
        senderId?: string;
        text: string;
        timestamp: number;
    };
}

export interface QuickChatMessage extends BaseMessage {
    type: MessageType.QUICK_CHAT;
    payload: {
        senderId?: string;
        messageId: string; // e.g. "GG", "HELLO", "READY"
        timestamp: number;
    };
}

// --- Game Messages ---
export interface GameStartMessage extends BaseMessage {
    type: MessageType.GAME_START;
    payload: {
        gameId: string;
        initialState: any;
    };
}

export interface GameActionMessage extends BaseMessage {
    type: MessageType.GAME_ACTION;
    payload: {
        actionType: string;
        data: any;
    };
}

export interface GameUpdateMessage extends BaseMessage {
    type: MessageType.GAME_UPDATE;
    payload: {
        stateDelta: any; // Could be a full state or a diff
    };
}

export type NetworkMessage =
    | PingMessage
    | PongMessage
    | EchoMessage
    | ErrorMessage
    | CreateRoomMessage
    | JoinRoomMessage
    | LeaveRoomMessage
    | RoomStateMessage
    | ListRoomsMessage
    | RoomListMessage
    | UpdateRoomSettingsMessage
    | KickPlayerMessage
    | PlayerReadyMessage
    | RoomEventMessage
    | ChatMessage
    | QuickChatMessage
    | WelcomeMessage
    | ReconnectMessage
    | GameStartMessage
    | GameActionMessage
    | GameUpdateMessage;
