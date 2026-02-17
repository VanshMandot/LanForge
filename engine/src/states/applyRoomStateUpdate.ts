import { SnapshotState } from "./types"

const CHAT_BUFFER_LIMIT = 50

export function applyRoomStateUpdate(
  snapshot: SnapshotState,
  update: any
): SnapshotState {

  // Create a safe copy (so original snapshot is not modified)
  const newSnapshot: SnapshotState = {
    room: {
      ...snapshot.room,
      members: snapshot.room.members.map(m => ({ ...m }))
    },
    chat: snapshot.chat.map(m => ({ ...m })),
    identity: {
      deviceIdToClientId: { ...snapshot.identity.deviceIdToClientId },
      deviceIdToName: { ...snapshot.identity.deviceIdToName }
    }
  }

  switch (update.type) {

    case "MEMBER_JOINED":
      newSnapshot.room.members.push(update.member)

      newSnapshot.identity.deviceIdToClientId[update.member.deviceId] =
        update.member.clientId

      newSnapshot.identity.deviceIdToName[update.member.deviceId] =
        update.member.name
      break


    case "MEMBER_LEFT":
      newSnapshot.room.members =
        newSnapshot.room.members.filter(
          m => m.deviceId !== update.deviceId
        )

      delete newSnapshot.identity.deviceIdToClientId[update.deviceId]
      delete newSnapshot.identity.deviceIdToName[update.deviceId]
      break


    case "HOST_CHANGED":
      newSnapshot.room.hostDeviceId = update.newHostDeviceId

      newSnapshot.room.members.forEach(m => {
        m.role =
          m.deviceId === update.newHostDeviceId ? "host" : "member"
      })
      break


    case "NAME_CHANGED":
      const member = newSnapshot.room.members.find(
        m => m.deviceId === update.deviceId
      )

      if (member) {
        member.name = update.newName
        newSnapshot.identity.deviceIdToName[update.deviceId] =
          update.newName
      }
      break


    case "CHAT":
      newSnapshot.chat.push(update.message)

      // Enforce chat buffer limit
      if (newSnapshot.chat.length > CHAT_BUFFER_LIMIT) {
        newSnapshot.chat.shift()
      }
      break
  }

  return newSnapshot
}
