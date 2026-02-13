import { SnapshotState } from "./types"
import { RoomManager, Room } from "../server/RoomManager"

export function restoreFromSnapshot(
  snapshot: SnapshotState,
  roomManager: RoomManager
): void {

  // Rebuild the room exactly from snapshot
  const restoredRoom: Room = {
    roomId: snapshot.room.roomId,
    joinCode: snapshot.room.joinCode,
    hostDeviceId: snapshot.room.hostDeviceId,

    members: snapshot.room.members.map(member => ({
      ...member
    })),

    chat: snapshot.chat.map(message => ({
      ...message
    }))
  }

  // Insert restored room into RoomManager
  roomManager.restoreRoomFromSnapshot(restoredRoom)
}
