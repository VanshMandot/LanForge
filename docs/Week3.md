# LanForge – Week 3 Plan

* Improved host election using device capabilities (not only join order)
* A simple web-based UI to observe and control the system
* A unified game architecture supporting different game types
* A snapshot-friendly game state model
* One working turn-based game to validate (Optional)
  * networking
  * snapshots
  * host migration
  * restore & continue gameplay


## 1) Improved Host Selection Algorithm
Make host election smarter by considering device capabilities.
### Host Score Function (Example)
* RAM weight
* CPU cores weight
* Battery bonus (optional)
* −ve Penalty for low-RAM devices
* Tie-breaker: earlier joinOrder
* Final tie-breaker: hash(deviceId)

All peers must compute the **same result** from the same snapshot.


## 2) Simple Web-Based UI (Debug Console)
Create a simple browser UI to observe and control LanForge.
#### Simple HTML + JS or React, No focus on styling

Through this, we should be able to:
* Connect to peer via WebSocket
* Show:
  * Connection status
  * Current role (host/client)
  * Room state (JSON)
  * Members list
  * Host deviceId
  * Chat messages
  * Last snapshot
* Controls:
  * Create room
  * Discover rooms
  * Join room
  * Send chat
  * Start test game
  * Simulate disconnect (kill server)

  [Basically we should be able to check each and everything, all work done till now from this UI]

## 3) Identify Game Types & Unified Game Architecture

#### A) Turn-Based Games

Examples: Ludo, Chess, Tic-Tac-Toe

Common concepts (Examples):
* currentPlayer
* turnNumber
* board/state
* validMoves
* gameStatus

#### B) Real-Time Games

Examples: Racing, Shooter, Sports

Common concepts (Examples):
* positions
* velocities
* scores
* tick/time
* gameStatus


### Some Core Interfaces Examples

Create in `src/game/`:

```ts
export interface GameModule<State, Action> {
  getInitialState(players: string[]): State;
  applyAction(state: State, action: Action): State;
  isGameOver(state: State): boolean;
  getSnapshot(state: State): unknown;
  restoreFromSnapshot(snapshot: unknown): State;
}
```

And:

```ts
export interface GameSession {
  gameId: string;
  type: "TURN_BASED" | "REALTIME" | "HYBRID" | ...;
  state: unknown;
  players: string[];
}
```

### Requirements
* Game state must be:
  * Serializable
  * Included in LanForge snapshot
  * Restorable after host migration
* Actions must be:
  * Deterministic
  * Replayable

## 4) Implement One Turn-Based Game (Optional)
### Requirements
* Implement:
  * Start game
  * Apply move
  * Broadcast updates
* Integrate with snapshot:
  * Game state included in snapshot
  * Restored on new host


[Anything I mentioned in the meet but forgot to put it here, should also be implemented]
