import { ClientConnection } from "./Client";
import { createUniqueId } from "../utils/id";
import { logger } from "../utils/logger";

export interface Room {
    id: string;
    name: string;
    hostId: string;
    maxPlayers: number;
    clients: string[]; // List of clientIds
}

export class RoomManager {
    private rooms = new Map<string, Room>();

    createRoom(name: string, hostId: string, maxPlayers: number = 4): Room {
        const roomId = createUniqueId("room-");
        const newRoom: Room = {
            id: roomId,
            name,
            hostId,
            maxPlayers,
            clients: [hostId],
        };

        this.rooms.set(roomId, newRoom);
        logger.info(`Room created: ${name} (${roomId}) by ${hostId}`);
        return newRoom;
    }

    joinRoom(roomId: string, clientId: string): Room | null {
        const room = this.rooms.get(roomId);
        if (!room) {
            logger.warn(`Client ${clientId} tried to join non-existent room ${roomId}`);
            return null;
        }

        if (room.clients.includes(clientId)) {
            return room;
        }

        if (room.clients.length >= room.maxPlayers) {
            logger.warn(`Room ${roomId} is full`);
            return null;
        }

        room.clients.push(clientId);
        logger.info(`Client ${clientId} joined room ${roomId}`);
        return room;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    removeClient(clientId: string) {
        // Remove client from all rooms (usually just one)
        for (const room of this.rooms.values()) {
            const index = room.clients.indexOf(clientId);
            if (index !== -1) {
                room.clients.splice(index, 1);
                logger.info(`Client ${clientId} removed from room ${room.id}`);

                // If host leaves, reassign or destroy room (simple logic: destroy if empty)
                if (room.clients.length === 0) {
                    this.rooms.delete(room.id);
                    logger.info(`Room ${room.id} destroyed (empty)`);
                } else if (room.hostId === clientId) {
                    // Assign new host
                    room.hostId = room.clients[0];
                    logger.info(`Room ${room.id} new host: ${room.hostId}`);
                }
            }
        }
    }
}
