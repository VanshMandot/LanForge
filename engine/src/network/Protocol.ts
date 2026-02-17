import { MessageType } from "./MessageTypes";

export interface BaseMessage {
    type: MessageType;
    requestId: string;
    clientId?: string;
}

// --- Connection Messages ---
export interface PingMessage extends BaseMessage {
    type: MessageType.PING;
    payload: { timestamp: number };
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
        joinCode: string;
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

// --- New Week 2 Messages ---
export interface HelloMessage extends BaseMessage {
    type: MessageType.HELLO;
    payload: {
        deviceId: string;
        name: string;
    };
}

export interface WelcomeMessage extends BaseMessage {
    type: MessageType.WELCOME;
    payload: {
        clientId: string;
    };
}

export interface ChatMessage extends BaseMessage {
    type: MessageType.CHAT;
    payload: {
        text: string;
        fromDeviceId?: string; // Optional if server fills it
        fromName?: string;     // Optional if server fills it
        timestamp?: number;
    };
}

export interface StateSnapshotMessage extends BaseMessage {
    type: MessageType.STATE_SNAPSHOT;
    payload: {
        snapshot: any; // Using any for now, matches SnapshotState
    };
}

export interface HostChangedMessage extends BaseMessage {
    type: MessageType.HOST_CHANGED;
    payload: {
        newHostDeviceId: string;
    };
}

export interface KickMessage extends BaseMessage {
    type: MessageType.KICK;
    payload: {
        targetDeviceId: string;
    };
}

export interface KickedMessage extends BaseMessage {
    type: MessageType.KICKED;
    payload: {
        reason: string;
    };
}

// --- Game Messages ---
export interface GameStartMessage extends BaseMessage {
    type: MessageType.GAME_START;
    payload: {
        gameId: string;
        initialState: unknown;
    };
}

export interface GameActionMessage extends BaseMessage {
    type: MessageType.GAME_ACTION;
    payload: {
        actionType: string;
        data: unknown;
    };
}

export interface GameUpdateMessage extends BaseMessage {
    type: MessageType.GAME_UPDATE;
    payload: {
        stateDelta: unknown; // Could be a full state or a diff
    };
}

export type NetworkMessage =
    | HelloMessage
    | WelcomeMessage
    | PingMessage
    | PongMessage
    | EchoMessage
    | ErrorMessage
    | CreateRoomMessage
    | JoinRoomMessage
    | LeaveRoomMessage
    | RoomStateMessage
    | ChatMessage
    | StateSnapshotMessage
    | HostChangedMessage
    | KickMessage
    | KickedMessage
    | GameStartMessage
    | GameActionMessage
    | GameUpdateMessage;
