/**
 * GameEngine.ts
 *
 * Host-authoritative game controller.
 *
 * Only the host peer may submit actions that mutate game state.
 * All other peers receive read-only GAME_UPDATE broadcasts.
 *
 * Usage:
 *   const engine = new GameEngine(new MyGame());
 *   engine.startGame({ roomId, hostDeviceId, players });
 *   engine.processAction(action);   // host only
 *   engine.endGame();
 */

import { createUniqueId } from "../utils/id";
import { logger } from "../utils/logger";
import { GameModule, GameAction } from "./GameModule";
import { GameSession, PlayerInfo } from "./GameSession";

export interface GameEngineCallbacks<S> {
    /** Called after every successfully processed action — use to broadcast GAME_UPDATE */
    onStateUpdate?: (session: GameSession<S>) => void;
    /** Called when the game ends */
    onGameEnd?: (session: GameSession<S>) => void;
}

export class GameEngine<S = unknown> {
    private module: GameModule<S>;
    private session: GameSession<S> | null = null;
    private callbacks: GameEngineCallbacks<S>;

    constructor(module: GameModule<S>, callbacks: GameEngineCallbacks<S> = {}) {
        this.module = module;
        this.callbacks = callbacks;
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /**
     * Start a new game session.
     * Throws if a session is already running.
     */
    startGame(opts: {
        roomId: string;
        hostDeviceId: string;
        players: PlayerInfo[];
    }): GameSession<S> {
        if (this.session) {
            throw new Error("GAME_ALREADY_RUNNING");
        }

        const initialState = this.module.getInitialState();
        this.session = new GameSession<S>({
            sessionId: createUniqueId("session-"),
            roomId: opts.roomId,
            hostDeviceId: opts.hostDeviceId,
            players: opts.players,
            initialState,
        });

        logger.info(
            `[GameEngine] Session started: ${this.session.sessionId} in room ${opts.roomId}`
        );

        this.module.onGameStart(this.session);
        this.callbacks.onStateUpdate?.(this.session);
        return this.session;
    }

    /**
     * Process an action submitted by a peer.
     *
     * Rules:
     * - Game must be running.
     * - Only the host may submit actions (authority check).
     * - Module.onAction must not throw — if it does, the action is rejected.
     *
     * Returns the updated session snapshot on success.
     */
    processAction(action: GameAction): ReturnType<GameSession<S>["getSnapshot"]> {
        if (!this.session) {
            throw new Error("GAME_NOT_RUNNING");
        }

        // Host-authority check
        if (action.fromDeviceId !== this.session.hostDeviceId) {
            throw new Error("NOT_HOST: Only the host may submit game actions");
        }

        logger.debug(
            `[GameEngine] Processing action type=${action.type} from=${action.fromDeviceId}`
        );

        // Let the module compute next state
        const nextState = this.module.onAction(this.session, action);

        // Commit — applyState records new state + sequence number
        this.session.applyState(nextState, action);

        // Notify callbacks (e.g., server broadcasts GAME_UPDATE)
        this.callbacks.onStateUpdate?.(this.session);

        return this.session.getSnapshot();
    }

    /**
     * End the current game session.
     * Calls module.onGameEnd and clears the session.
     */
    endGame(): void {
        if (!this.session) {
            throw new Error("GAME_NOT_RUNNING");
        }

        logger.info(`[GameEngine] Ending session: ${this.session.sessionId}`);
        this.module.onGameEnd(this.session);
        this.callbacks.onGameEnd?.(this.session);
        this.session = null;
    }

    // ─── Getters ────────────────────────────────────────────────────────────────

    isRunning(): boolean {
        return this.session !== null;
    }

    getSession(): GameSession<S> | null {
        return this.session;
    }
}
