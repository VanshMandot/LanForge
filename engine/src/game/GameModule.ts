/**
 * GameModule.ts
 *
 * Defines the plug-and-play interface every game must implement.
 * The GameEngine calls these hooks at the appropriate lifecycle points.
 * GameSession is passed by reference so modules can read current state.
 */

import type { GameSession } from "./GameSession";

export interface GameAction {
    /** Discriminator string e.g. "MOVE", "ATTACK", "PLACE" */
    type: string;
    /** Action-specific payload — the module defines its shape */
    payload: Record<string, unknown>;
    /** deviceId of the peer who submitted this action */
    fromDeviceId: string;
    /** Monotonic counter to detect duplicate / reordered actions */
    sequence: number;
}

/**
 * Implement this interface to create a new game.
 *
 * @template S  The shape of the game-specific state object
 */
export interface GameModule<S = unknown> {
    /**
     * Returns the initial game state when a session starts.
     * Called once by GameEngine before onGameStart.
     */
    getInitialState(): S;

    /**
     * Called when the game session begins.
     * Useful for seeding randomness, logging, emitting first update, etc.
     */
    onGameStart(session: GameSession<S>): void;

    /**
     * Called for every action submitted by the host peer.
     * Must return the next game state (immutable update pattern).
     *
     * Throw an error to reject an invalid action — GameEngine will
     * relay the error to the submitting peer.
     */
    onAction(session: GameSession<S>, action: GameAction): S;

    /**
     * Called when the game ends (host calls endGame or room closes).
     * Useful for cleanup, score calculation, or final broadcast.
     */
    onGameEnd(session: GameSession<S>): void;
}
