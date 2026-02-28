/**
 * GameSession.ts
 *
 * Represents one active game running inside a room.
 * Holds the live game state and the list of participating players.
 *
 * The GameEngine drives this; individual GameModule implementations
 * receive a reference and can read (but not directly mutate) state.
 */

import { GameAction } from "./GameModule";

export interface PlayerInfo {
    deviceId: string;
    name: string;
}

export class GameSession<S = unknown> {
    public readonly sessionId: string;
    public readonly roomId: string;
    public readonly hostDeviceId: string;
    public readonly players: ReadonlyArray<PlayerInfo>;

    /** Current game state — replaced on every successful action */
    public state: S;

    /** Index of the last successfully applied action */
    public actionSequence: number = 0;

    /** ISO timestamp of when the session started */
    public readonly startedAt: string = new Date().toISOString();

    constructor(opts: {
        sessionId: string;
        roomId: string;
        hostDeviceId: string;
        players: PlayerInfo[];
        initialState: S;
    }) {
        this.sessionId = opts.sessionId;
        this.roomId = opts.roomId;
        this.hostDeviceId = opts.hostDeviceId;
        this.players = opts.players;
        this.state = opts.initialState;
    }

    /**
     * Apply new state from a processed action.
     * Called by GameEngine after the module returns next state.
     */
    applyState(nextState: S, action: GameAction): void {
        this.state = nextState;
        this.actionSequence = action.sequence;
    }

    /**
     * Returns a serializable snapshot of the session,
     * suitable for broadcasting as a GAME_UPDATE payload.
     */
    getSnapshot(): {
        sessionId: string;
        roomId: string;
        hostDeviceId: string;
        players: Array<PlayerInfo>;
        state: S;
        actionSequence: number;
    } {
        return {
            sessionId: this.sessionId,
            roomId: this.roomId,
            hostDeviceId: this.hostDeviceId,
            players: [...this.players],   // spread ReadonlyArray → mutable
            state: this.state,
            actionSequence: this.actionSequence,
        };
    }
}
