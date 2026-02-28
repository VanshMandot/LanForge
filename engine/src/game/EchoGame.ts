/**
 * EchoGame.ts
 *
 * A minimal demo GameModule that proves the plug-and-play framework works.
 *
 * State just echoes the last action back and tracks a counter.
 * To use a real game, implement GameModule<YourState> the same way.
 */

import { logger } from "../utils/logger";
import { GameAction, GameModule } from "./GameModule";
import { GameSession } from "./GameSession";

export interface EchoGameState {
    actionCount: number;
    lastActionType: string;
    lastActionFrom: string;
    lastPayload: Record<string, unknown>;
}

export class EchoGame implements GameModule<EchoGameState> {
    getInitialState(): EchoGameState {
        return {
            actionCount: 0,
            lastActionType: "NONE",
            lastActionFrom: "",
            lastPayload: {},
        };
    }

    onGameStart(session: GameSession<EchoGameState>): void {
        logger.info(
            `[EchoGame] Game started! Session=${session.sessionId}, Players=${session.players
                .map((p) => p.name)
                .join(", ")}`
        );
    }

    onAction(
        session: GameSession<EchoGameState>,
        action: GameAction
    ): EchoGameState {
        // Validate action (demo: reject unknown types)
        if (!action.type || action.type.trim() === "") {
            throw new Error("INVALID_ACTION: action.type is required");
        }

        logger.info(
            `[EchoGame] Action #${session.state.actionCount + 1}: type=${action.type} from=${action.fromDeviceId}`
        );

        // Return next state — immutable update
        return {
            actionCount: session.state.actionCount + 1,
            lastActionType: action.type,
            lastActionFrom: action.fromDeviceId,
            lastPayload: action.payload,
        };
    }

    onGameEnd(session: GameSession<EchoGameState>): void {
        logger.info(
            `[EchoGame] Game ended. Total actions processed: ${session.state.actionCount}`
        );
    }
}
