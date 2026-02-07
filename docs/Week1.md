# LanForge - Week 1 Plan

By the end of Week 1, we should be able to:
- Run a WebSocket server on LAN
- Connect 3-5 clients
- Send/receive typed JSON messages
- Handle unknown messages without crashing
- Have clean logs + test scripts

---

## Project Structure

```text
LANFORGE/
└── engine/
    ├── src/
    │   ├── server/
    │   │   ├── index.ts      
    │   │   ├── Server.ts     # server class: listen, accept, manage clients
    │   │   └── Client.ts     # one connected client abstraction
    │   │
    │   ├── network/          
    │   │   ├── Protocol.ts   # message interfaces + validation helpers
    │   │   ├── MessageTypes.ts # allowed message types (enum/union)
    │   │   └── Encoder.ts    # safe JSON decode/encode
    │   │
    │   ├── utils/
    │   │   ├── logger.ts     # consistent logging format (can use chawlk)
    │   │   └── id.ts         # clientId + requestId generators
    │   │
    │   └── index.ts          # ONLY: start server

```

## Message Format Example

```json
{
  "type": "PING",
  "requestId": "123",
  "clientId": "abc",
  "payload": {}
}
```
Message types (minimum):

* PING (client → server)
* PONG (server → client)
* ECHO (client → server → broadcast/reply)
* ERROR (server → client)
* And more...

---

### Heartbeat (PING–PONG)

Mechanism to verify active connections.

* Server sends `PING` at fixed intervals
* Client must respond with `PONG`.
* Each client maintains a `lastSeenAt` timestamp.

**If no PONG is received:**

* After a short timeout, mark client as unresponsive and log warning.
* Allow a small reconnect window.
* If still no response disconnect client safely.

---

### Team Assignments

| Team | Focus | Work On |
| --- | --- | --- |
| **Team A** | **Server** | `src/server/*` 
| **Team B** | **Protocol & Tools** | `src/network/*`, `src/utils/*`

---

### Team A
* Start WebSocket server on a specific port with clear logging.
* Implement a `Client` class with `id`, `send()`, `close()`, and other such classes.
* Maintain a `Map<string, Client>` for active connections.
* Handle clean-up on disconnect.
* Forward raw data to `Encoder`, handle invalid inputs without crashing, and route valid messages.
* Implement a method to send messages to all clients maybe with an optional "except" parameter.
* Implement Heartbeat mechnism

---

### Team B
* Define `PING`, `PONG`, `ECHO`, `ERROR` and other enums.
* Create `Message` interfaces and schema validation helpers.
* Implement `encode/decode` logic that never throws and handles unknown/invalid JSON ache se.
* Standardized `logger.ts` and ID generators.

