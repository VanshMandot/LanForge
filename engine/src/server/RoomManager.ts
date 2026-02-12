import { randomBytes } from "crypto";

/* =========================
   Types & Interfaces
========================= */

export type Role = "host" | "member";

export interface Member {
  deviceId: string;      // stable identity
  clientId: string;      // connection/session identity
  name: string;          // display name (unique per room)
  joinOrder: number;     // used for leader election
  role: Role;
}

export interface ChatMessage {
  fromDeviceId: string;
  fromName: string;
  text: string;
  timestamp: number;
}

export interface Room {
  roomId: string;
  joinCode: string;
  hostDeviceId: string;
  members: Member[];
  chat: ChatMessage[];
}

/* =========================
   Constants
========================= */

const JOIN_CODE_LENGTH = 6;
const CHAT_BUFFER_LIMIT = 50;

/* =========================
   RoomManager
========================= */

export class RoomManager {
  private rooms = new Map<string, Room>();
  private joinCodeToRoomId = new Map<string, string>();
  private globalJoinCounter = 0;

  /* =========================
     Room Creation
  ========================= */

  createRoom(
    roomId: string,
    hostDeviceId: string,
    hostClientId: string,
    hostName: string
  ): Room {
    const joinCode = this.generateJoinCode();

    const host: Member = {
      deviceId: hostDeviceId,
      clientId: hostClientId,
      name: hostName,
      joinOrder: this.globalJoinCounter++,
      role: "host",
    };

    const room: Room = {
      roomId,
      joinCode,
      hostDeviceId,
      members: [host],
      chat: [],
    };

    this.rooms.set(roomId, room);
    this.joinCodeToRoomId.set(joinCode, roomId);

    return room;
  }

  /* =========================
     Join Room
  ========================= */

  joinRoomByCode(
    joinCode: string,
    deviceId: string,
    clientId: string,
    name: string
  ): Room {
    const roomId = this.joinCodeToRoomId.get(joinCode);
    if (!roomId) throw new Error("INVALID_JOIN_CODE");

    const room = this.rooms.get(roomId)!;

    if (room.members.some(m => m.name === name)) {
      throw new Error("NAME_CONFLICT");
    }

    const member: Member = {
      deviceId,
      clientId,
      name,
      joinOrder: this.globalJoinCounter++,
      role: "member",
    };

    room.members.push(member);
    return room;
  }

  /* =========================
     Leave Room
  ========================= */

  leaveRoom(deviceId: string): Room | null {
    const room = this.findRoomByDevice(deviceId);
    if (!room) return null;

    room.members = room.members.filter(m => m.deviceId !== deviceId);

    if (room.members.length === 0) {
      this.destroyRoom(room);
      return null;
    }

    if (room.hostDeviceId === deviceId) {
      const newHostId = this.electNewHost(room.roomId);
      room.hostDeviceId = newHostId;

      room.members.forEach(m => {
        m.role = m.deviceId === newHostId ? "host" : "member";
      });
    }

    return room;
  }

  /* =========================
     Kick Member
  ========================= */

  kick(hostDeviceId: string, targetDeviceId: string): Room {
    const room = this.findRoomByDevice(hostDeviceId);
    if (!room) throw new Error("ROOM_NOT_FOUND");

    if (room.hostDeviceId !== hostDeviceId) {
      throw new Error("NOT_HOST");
    }

    room.members = room.members.filter(m => m.deviceId !== targetDeviceId);
    return room;
  }

  /* =========================
     Name Change (Strict)
  ========================= */

  changeName(deviceId: string, newName: string): void {
    const room = this.findRoomByDevice(deviceId);
    if (!room) throw new Error("ROOM_NOT_FOUND");

    if (room.members.some(m => m.name === newName)) {
      throw new Error("NAME_CONFLICT");
    }

    const member = room.members.find(m => m.deviceId === deviceId);
    if (!member) throw new Error("MEMBER_NOT_FOUND");

    member.name = newName;
  }

  /* =========================
     Chat Handling
  ========================= */

  appendChat(roomId: string, fromDeviceId: string, text: string): ChatMessage {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");

    const sender = room.members.find(m => m.deviceId === fromDeviceId);
    if (!sender) throw new Error("NOT_IN_ROOM");

    const msg: ChatMessage = {
      fromDeviceId,
      fromName: sender.name,
      text,
      timestamp: Date.now(),
    };

    room.chat.push(msg);

    if (room.chat.length > CHAT_BUFFER_LIMIT) {
      room.chat.shift();
    }

    return msg;
  }

  /* =========================
     Host Election
  ========================= */

  electNewHost(roomId: string): string {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");

    const sorted = [...room.members].sort((a, b) => {
      if (a.joinOrder !== b.joinOrder) {
        return a.joinOrder - b.joinOrder;
      }
      return this.hash(a.deviceId) - this.hash(b.deviceId);
    });

    return sorted[0].deviceId;
  }

  /* =========================
     Helpers
  ========================= */

  private findRoomByDevice(deviceId: string): Room | null {
    for (const room of this.rooms.values()) {
      if (room.members.some(m => m.deviceId === deviceId)) {
        return room;
      }
    }
    return null;
  }

  private destroyRoom(room: Room): void {
    this.rooms.delete(room.roomId);
    this.joinCodeToRoomId.delete(room.joinCode);
  }

  private generateJoinCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";

    do {
      code = "";
      for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
        code += chars[randomBytes(1)[0] % chars.length];
      }
    } while (this.joinCodeToRoomId.has(code));

    return code;
  }

  private hash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /* =========================
    # Snapshot Support
  ========================= */

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }
}
