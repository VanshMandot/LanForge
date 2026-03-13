// engine/src/game/modules/TicTacToeGame.ts
//
// Turn-based Tic-Tac-Toe implementation for LanForge.
// - Works with GameEngine<GameState>.
// - Supports many members in a room: 2 active players + spectators.
// - Fully deterministic and snapshot-friendly: state is plain JSON.

import { logger } from "../../utils/logger";
import { GameAction, GameModule } from "../GameModule";
import { GameSession, PlayerInfo } from "../GameSession";

type Cell = "X" | "O" | null;

// Full game state stored inside GameSession.state and snapshots.
// This must stay serializable and deterministic.
export interface TicTacToeState {
  board: Cell[];                    // 3x3 board flattened to length 9
  status: "WAITING" | "PLAYING" | "FINISHED";
  currentTurnDeviceId: string;      // deviceId of player whose turn it is
  currentMark: "X" | "O";           // symbol for currentTurnDeviceId
  winnerDeviceId: string | null;    // deviceId of winner, or null for draw
  winningLine: number[] | null;     // indices [a,b,c] if someone won

  activePlayers: string[];          // deviceIds of up to 2 players actually playing
  spectators: string[];             // deviceIds of room members who are watching
}

// GameModule implementation used by GameEngine<TicTacToeState>.
export class TicTacToeGame implements GameModule<TicTacToeState> {
  // Initial state before onGameStart runs.
  getInitialState(): TicTacToeState {
    return {
      board: Array<Cell>(9).fill(null),
      status: "WAITING",
      currentTurnDeviceId: "",
      currentMark: "X",
      winnerDeviceId: null,
      winningLine: null,
      activePlayers: [],
      spectators: [],
    };
  }

  // Called once when GameEngine.startGame() is called.
  // Picks active players and sets the first turn.
  onGameStart(session: GameSession<TicTacToeState>): void {
    const players = session.players;

    if (players.length < 2) {
      logger.warn("[TicTacToe] Not enough players, staying in WAITING");
      return;
    }

    // Deterministically pick first two as active players.
    const active = this.pickActivePlayers(players);
    const spectators = players
      .map((p) => p.deviceId)
      .filter((id) => !active.includes(id));

    session.state.activePlayers = active;
    session.state.spectators = spectators;

    // First active player starts as "X".
    session.state.currentTurnDeviceId = active[0];
    session.state.currentMark = "X";
    session.state.status = "PLAYING";

    logger.info(
      `[TicTacToe] Game started in room=${session.roomId}, ` +
        `activePlayers=${active.join(",")}, spectators=${spectators.join(",")}`
    );
  }

  // Core game logic: validate and apply one action from the host.
  // GameEngine already enforces "host-only" actions; here we enforce:
  // - Only active players can move
  // - Only the currentTurnDeviceId can move
  onAction(
    session: GameSession<TicTacToeState>,
    action: GameAction
  ): TicTacToeState {
    const state = session.state;

    if (state.status !== "PLAYING") {
      throw new Error("GAME_NOT_PLAYING");
    }

    // Only active players may act (spectators cannot send moves).
    if (!state.activePlayers.includes(action.fromDeviceId)) {
      throw new Error("NOT_ACTIVE_PLAYER");
    }

    // Turn enforcement: must match currentTurnDeviceId.
    if (action.fromDeviceId !== state.currentTurnDeviceId) {
      throw new Error("NOT_YOUR_TURN");
    }

    if (action.type === "MOVE") {
      const index = (action.payload.index as number) ?? -1;

      // Validate board index.
      if (!Number.isInteger(index) || index < 0 || index > 8) {
        throw new Error("INVALID_MOVE_INDEX");
      }
      // Prevent overwriting an occupied cell.
      if (state.board[index] !== null) {
        throw new Error("CELL_ALREADY_FILLED");
      }

      // Immutable board update.
      const newBoard = state.board.slice();
      newBoard[index] = state.currentMark;

      // Check for winner or draw after this move.
      const { winnerDeviceId, winningLine, isDraw } = this.checkResult(
        newBoard,
        state.activePlayers,
        state.currentMark
      );

      let nextStatus: TicTacToeState["status"] = state.status;
      let nextWinner = state.winnerDeviceId;
      let nextWinningLine = state.winningLine;

      if (winnerDeviceId) {
        nextStatus = "FINISHED";
        nextWinner = winnerDeviceId;
        nextWinningLine = winningLine;
      } else if (isDraw) {
        nextStatus = "FINISHED";
        nextWinner = null;
        nextWinningLine = null;
      }

      let nextTurnDeviceId = state.currentTurnDeviceId;
      let nextMark: "X" | "O" = state.currentMark;

      // If game continues, swap turn and mark between the two active players.
      if (nextStatus === "PLAYING") {
        nextTurnDeviceId =
          state.currentTurnDeviceId === state.activePlayers[0]
            ? state.activePlayers[1]
            : state.activePlayers[0];
        nextMark = state.currentMark === "X" ? "O" : "X";
      }

      // Return the new state (GameEngine will commit it).
      return {
        board: newBoard,
        status: nextStatus,
        currentTurnDeviceId: nextTurnDeviceId,
        currentMark: nextMark,
        winnerDeviceId: nextWinner,
        winningLine: nextWinningLine,
        activePlayers: state.activePlayers.slice(),
        spectators: state.spectators.slice(),
      };
    }

    throw new Error("UNKNOWN_ACTION_TYPE");
  }

  // Called when GameEngine.endGame() is called.
  onGameEnd(session: GameSession<TicTacToeState>): void {
    const s = session.state;
    logger.info(
      `[TicTacToe] Game ended in room=${session.roomId}, ` +
        `winner=${s.winnerDeviceId ?? "DRAW"}`
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  // Pick active players deterministically from the full players list.
  private pickActivePlayers(players: ReadonlyArray<PlayerInfo>): string[] {
    if (players.length >= 2) {
      return [players[0].deviceId, players[1].deviceId];
    }
    if (players.length === 1) {
      return [players[0].deviceId];
    }
    return [];
  }

  // Compute winner/draw based on board state.
  // X is always activePlayers[0], O is activePlayers[1].
  private checkResult(
    board: Cell[],
    activePlayers: string[],
    currentMark: "X" | "O"
  ): { winnerDeviceId: string | null; winningLine: number[] | null; isDraw: boolean } {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (const line of lines) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        let winnerDeviceId: string | null = null;
        if (currentMark === "X" && activePlayers[0]) {
          winnerDeviceId = activePlayers[0];
        } else if (currentMark === "O" && activePlayers[1]) {
          winnerDeviceId = activePlayers[1];
        }
        return { winnerDeviceId, winningLine: line, isDraw: false };
      }
    }

    const isDraw = board.every((cell) => cell !== null);
    return { winnerDeviceId: null, winningLine: null, isDraw };
  }
}
