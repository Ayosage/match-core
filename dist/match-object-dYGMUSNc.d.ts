import { DurableObject } from 'cloudflare:workers';
import { LobbyPayload } from './envelope.js';
import { ZodType } from 'zod';

interface Rng {
    /** Uniform in [0, 1). Same contract as @meridian/rules' Rng. */
    next(): number;
}
interface RuleError {
    code: string;
    message: string;
}
declare function isRuleError(x: unknown): x is RuleError;
type DriveKind = 'bot' | 'pilot';
interface Placement {
    seat: number;
    placement: number;
    winner: boolean;
    stats: Record<string, unknown>;
}
/**
 * Everything a game supplies to MatchObject. S = full state (server only),
 * I = client intent (no player field), V = per-seat view, E = event.
 */
interface GameAdapter<S, I, V, E> {
    slug: string;
    players: {
        min: number;
        max: number;
    };
    intentSchema: ZodType<I>;
    /** `now` is the object's clock (ms since epoch) at creation. */
    create(opts: {
        playerCount: number;
        seed: number;
        now: number;
        [k: string]: unknown;
    }, rng: Rng): S;
    /** The engine's reducer; `player` is the seat the object derived from the socket; `now` is the intent's arrival time. */
    apply(state: S, intent: I & {
        player: number;
    }, rng: Rng, now: number): S | RuleError;
    /** An absolute time (ms) the game wants to be woken at, or null. Read after every state change. */
    deadline?(state: S): number | null;
    /** The state after that time passes; runs through the same broadcast path as an intent. */
    expire?(state: S, now: number, rng: Rng): {
        state: S;
        events: E[];
    };
    view(state: S, seat: number): V;
    events(before: S, intent: I & {
        player: number;
    }, after: S): E[];
    redactEvent(event: E, seat: number): E;
    /** Next mandatory (pilot) or competent (bot) move for a seat with no human; null when nothing is pending. */
    drive(state: S, seat: number, kind: DriveKind, rng: Rng, memory: unknown): {
        intent: (I & {
            player: number;
        }) | null;
        memory: unknown;
    };
    driveDelayMs(kind: DriveKind): number;
    /** Bot trade offers: is one open, and has every other seat answered? */
    offerWindow(state: S): {
        open: boolean;
        everyoneAnswered: boolean;
    };
    offerWindowMs: number;
    isEnded(state: S): boolean;
    winner(state: S): number | null;
    result(state: S): Placement[];
    /** Turn number, for per-turn bot memory. */
    turnNumber(state: S): number;
    /** The seat the game is waiting on this turn. */
    currentSeat(state: S): number;
}

declare const TIMER_KEYS: readonly ["pilot", "offer", "abandon", "expiry", "webhook", "game"];
type TimerKey = (typeof TIMER_KEYS)[number];
/** Epoch ms per timer, null when unarmed. Persisted; the single DO alarm is set to the earliest. */
type Deadlines = Record<TimerKey, number | null>;
declare const NO_DEADLINES: Deadlines;
declare function earliest(d: Deadlines): number | null;
/** Keys whose deadline is at or before `now`, soonest first. */
declare function dueKeys(d: Deadlines, now: number): TimerKey[];

interface CreateOptions {
    players: number;
    bots: number;
    seed?: number;
    launched?: boolean;
    seatNames?: string[];
    callback?: {
        url: string;
        token: string;
    };
    /** The launcher's host: whoever arrives with this seat token takes seat 0, even if others came first. */
    host?: {
        seatToken: string;
        displayName?: string;
    };
    clientOrigin: string;
    /** Test-only knobs (delays, targetVp, layout); ignored unless env.TEST_KNOBS === '1'. */
    knobs?: Record<string, unknown>;
}
/** Validation problems come back as values, not throws: a throw inside the object is logged as an uncaught exception by the runtime. */
type CreateResult = {
    status: 'created';
} | {
    status: 'conflict';
} | {
    status: 'invalid';
    message: string;
};
interface MatchEnv {
    TEST_KNOBS?: string;
}
/**
 * The object's public surface: RPC methods the Worker calls, the socket and
 * alarm handlers the runtime calls, and the test-only hooks. Declared here so
 * createMatchObject can carry an explicit return type (declaration emit cannot
 * describe an anonymous class with inherited protected members).
 */
interface MatchObjectApi<S> {
    create(opts: CreateOptions): Promise<CreateResult>;
    lobby(): LobbyPayload | null;
    fetch(request: Request): Promise<Response>;
    webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void>;
    webSocketClose(ws: WebSocket): Promise<void>;
    webSocketError(ws: WebSocket): Promise<void>;
    alarm(): Promise<void>;
    deadlinesForTest(): Deadlines | null;
    stateForTest(): S | null;
    loadStateForTest(state: S): void;
}
type MatchObjectClass<S> = new (ctx: DurableObjectState, env: MatchEnv) => MatchObjectApi<S> & DurableObject<MatchEnv>;
declare function createMatchObject<S, I, V, E>(adapter: GameAdapter<S, I, V, E>): MatchObjectClass<S>;

export { type CreateOptions as C, type Deadlines as D, type GameAdapter as G, type MatchEnv as M, NO_DEADLINES as N, type Placement as P, type Rng as R, TIMER_KEYS as T, type CreateResult as a, type DriveKind as b, type MatchObjectApi as c, type MatchObjectClass as d, type RuleError as e, type TimerKey as f, createMatchObject as g, dueKeys as h, earliest as i, isRuleError as j };
