import { SnapshotState } from "./types"
import { RoomManager } from "../server/RoomManager"

export function makeSnapshot(
  roomManager: RoomManager,
  roomId: string
): SnapshotState {

  const room = roomManager.getRoom(roomId)

  if (!room) {
    throw new Error("ROOM_NOT_FOUND")
  }

  const deviceIdToClientId: Record<string, string> = {}
  const deviceIdToName: Record<string, string> = {}

  for (const member of room.members) {
    deviceIdToClientId[member.deviceId] = member.clientId
    deviceIdToName[member.deviceId] = member.name
  }

  return {
    room: {
      roomId: room.roomId,
      joinCode: room.joinCode,
      hostDeviceId: room.hostDeviceId,
      members: room.members.map(member => ({
        ...member
      }))
    },
    chat: room.chat.map(message => ({
      ...message
    })),
    identity: {
      deviceIdToClientId,
      deviceIdToName
    }
  }
}
