# LanForge – Week 2 Plan

By the end of Week 2, LanForge should support:

- Peer-hosted server
- One player’s device runs the server when creating a room
- Host is also a normal client (auto-joins room)
- Room creation with join code (5–6 chars A–Z, 0–9)
- Join room via code
- Chat inside room (`broadcastToRoom`)
- Stable identity using `HELLO / deviceId`
  - For now: deviceId can be manually provided in CLI or generated once per client run
- Client display names (`clientName`) + uniqueness per room
- Host role migration
- **Server process migration**
- **Session continues when host device leaves**
- Logs show: election, migration, reconnect, restore

## What “Peer-Hosted” Means

- There is NO always-on server.
- The device that creates the room:
  - starts the server process
  - also connects as a normal client
- Other devices connect to that device over LAN/hotspot.
- If the host device dies:
  - a new device is elected
  - that device starts the server
  - others reconnect
  - room + chat continue

## State That Must Be Replicated
Minimum snapshot stored on every client (used to restore server after migration):
### Room
- roomId
- joinCode
- hostDeviceId
- members (store full objects, not only IDs)
- joinOrder

### Member
Each member is stored as:
- deviceId (stable)
- clientId (can change after reconnect)
- name (display name, can change)
- joinOrder
- role ("host" | "member")

### Chat
- last N messages
- each chat entry should store:
  - fromDeviceId
  - fromName (for UI)
  - text
  - timestamp

### Identity
- deviceId ↔ clientId mapping (current session)
- deviceId ↔ name mapping (current display name)

These snapshot should be used to **restore the server** after migration.


## Name Rules

- `clientName` is the display name shown in room/chat (not clientId)
- Names must be **unique within a room**
- If a joining client’s name conflicts:
  - server rejects join and asks the client to change name
- Name cannot be renamed anytime... If a client wants to he should leave the room, rename and join again.

## Leader Election
When server disappears, all clients compute the same new host.

Example rule:
- Pick client who joined first
- If tie: lowest hash(deviceId) or lowest clientId hash

No voting server. Everyone independently reaches same result.

## LAN Discovery (Finding Rooms + Migration Recovery)

**2 Situations**:

### 1) Finding rooms before joining (manual discovery)
* Any host periodically broadcasts:
  * Message format:
    `LANFORGE_HOST <ip> <port> <roomId> <joinCode>`
* A client that is **not in any room** can:
  * Should start a UDP listen for a few seconds (e.g., 3–5s)
  * Collect all broadcasts
  * Show a list of available rooms to the user
* User selects a room → client connects via WebSocket → `JOIN_ROOM` with `joinCode`

This allows:
* “Find rooms on this LAN”
* No need to type IP manually


### 2) Recovering after host/server migration (automatic discovery)

* If the current server disappears:
  * Clients detect disconnect
  * Run leader election
  * If **this client is elected**:
    * Start local server
    * Start broadcasting:
      `LANFORGE_HOST <ip> <port> <roomId> <joinCode>`
  * If **this client is not elected**:
    * Start UDP listen
    * Wait for the new host’s broadcast
    * Automatically reconnect to the new server
    * Restore session from snapshot

This allows:
* Automatic reconnection after host leaves
* No user action required
* Session (room + chat) continues after migration

---
### What to Create & Where  (My Opinion youll can choose not to, and do it your way)

### 1) Create a new folder: `src/peer/`
PeerNode responsibilities:
- connect to server as client
- keep latest snapshot in memory
- detect disconnect
- run leader election
- if leader → start local server + UDP announce
- if not leader → UDP listen + reconnect

### 2) Create a new folder: `src/discovery/`
* `src/discovery/udpAnnounce.ts`
* `src/discovery/udpDiscovery.ts`


### 3) Create a new folder: `src/state/`
Implement:
- `makeSnapshot(roomManager): SnapshotState`
- `restoreFromSnapshot(snapshot, roomManager): void`
- `applyRoomStateUpdate(snapshot, update): SnapshotState`

### 4) Update `src/server/RoomManager.ts` (rebuild)
RoomManager must store:
- rooms by roomId
- joinCode → roomId lookup
- members as objects including (deviceId, clientId, name, joinOrder, role)
- hostDeviceId
- chat buffer (N messages)

Core functions to implement:
- `createRoom(roomName, hostDeviceId, hostClientId, hostName, maxPlayers?) -> room`
- `joinRoomByCode(code, deviceId, clientId, name) -> room | error`
- `leaveRoom(deviceId) -> room update`
- `kick(hostDeviceId, targetDeviceId) -> room update`
- `changeName(deviceId, newName) -> ok | NAME_CONFLICT`
- `appendChat(roomId, fromDeviceId, text) -> chat update`
- `electNewHost(roomId) -> newHostDeviceId`

### 5) Update `src/server/Server.ts`
Add handlers
- `HELLO` :
  - store `client.deviceId` + `client.name`
  - reply `WELCOME`
- `CREATE_ROOM`:
  - creator auto-joins as host
  - generate joinCode
  - respond with `ROOM_STATE`
- `JOIN_ROOM`:
  - join by joinCode
  - reject if name conflict
- `CHAT`:
  - append to chat buffer
  - broadcast chat to room
- `KICK`:
  - validate hostDeviceId
  - remove target
  - broadcast update
- On every meaningful room change (join/leave/name/chat/host change), server should:
  - broadcast `STATE_SNAPSHOT` (or expanded ROOM_STATE) to all room members
- Clients store latest snapshot in PeerNode.

## Message Types
Minimum additions:
- `CHAT`
- `STATE_SNAPSHOT`
- `HOST_CHANGED`
- `KICK`
- `KICKED`


## What will be tested? (CLI-based)

We should be able to run multiple peers from terminals:
### 1) Start a peer as host (creates room automatically and starts announcing):
### 2) Start a peer in discovery mode (find rooms on LAN):
* Client listens for UDP broadcasts (3–5 seconds)
* Prints discovered rooms with join codes
### 3) Join a discovered room:
Try joining with a duplicate name:
* Should fail due to name conflict and ask to change name
### 4) Chat:
* Should broadcast only to room members
### 5) Kill host (Ctrl+C):
Clients should log:
* server lost
* electing new host
* new host starting server
* UDP announce detected
* reconnecting
* restored snapshot

After reconnect:
* chat continues
* room members and names are preserved
* chat history is preserved