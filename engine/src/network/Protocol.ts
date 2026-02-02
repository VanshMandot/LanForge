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
    | GameStartMessage
    | GameActionMessage
    | GameUpdateMessage;
