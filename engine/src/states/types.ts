export type Member = {
  deviceId: string
  clientId: string
  name: string
  joinOrder: number
  role: "host" | "member"

  // NEW
  ramMB?: number
  cpuCores?: number
  batteryLevel?: number
}

export type ChatMessage = {
  fromDeviceId: string
  fromName: string
  text: string
  timestamp: number
}

export type SnapshotState = {
  room: {
    roomId: string
    joinCode: string
    hostDeviceId: string
    members: Member[]
  }
  chat: ChatMessage[]
  identity: {
    deviceIdToClientId: Record<string, string>
    deviceIdToName: Record<string, string>
  }
}
