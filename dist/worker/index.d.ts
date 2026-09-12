import { a as CreateResult, C as CreateOptions } from '../match-object-dYGMUSNc.js';
import { LobbyPayload } from '../envelope.js';
import 'cloudflare:workers';
import 'zod';

/**
 * Pure handlers for room creation. Steward's launch (docs/GAME-ADAPTER.md v1,
 * plus the v0 `seatNames` shape) is bearer-authenticated; the browser's own
 * Create button uses the open variant. No Workers imports; index.ts wires
 * both to the MATCH namespace, tests inject deps.
 */
interface RoomOptions {
    players: number;
    bots: number;
    launched: boolean;
    seatNames?: string[];
    callback?: {
        url: string;
        token: string;
    };
    /** The launcher's host; that seat token owns seat 0. */
    host?: {
        seatToken: string;
        displayName?: string;
    };
    /** Test knobs (seed, targetVp, delays); the object ignores them unless TEST_KNOBS=1. */
    knobs?: Record<string, unknown>;
}
interface LaunchDeps {
    createRoom: (code: string, options: RoomOptions) => Promise<CreateResult>;
    newCode: () => string;
    clientOrigin: string;
    launchToken: string;
    now: () => number;
}
interface LaunchResult {
    status: number;
    body: Record<string, unknown>;
}
declare const LAUNCH_EXPIRE_MS: number;
/** Steward → game: `POST /matches` with the shared bearer token. */
declare function handleCreateMatch(authHeader: string | undefined, body: unknown, deps: LaunchDeps): Promise<LaunchResult>;
/** Browser → game: `POST /matches/open`, no token. An ad-hoc room that is not launched (no invite expiry). */
declare function handleOpenMatch(body: unknown, deps: LaunchDeps): Promise<LaunchResult>;

/** The RPC surface of a match object, as seen from the Worker. */
interface MatchStub {
    create(opts: CreateOptions): Promise<CreateResult>;
    lobby(): Promise<LobbyPayload | null>;
    fetch(request: Request): Promise<Response>;
}
interface MatchEnv {
    MATCH: {
        getByName(name: string): MatchStub;
    };
    LAUNCH_TOKEN: string;
    CLIENT_ORIGIN: string;
    APP_VERSION: string;
    TEST_KNOBS?: string;
}
interface MatchFetchOptions {
    /** Refuse `bots > 0` unless TEST_KNOBS=1 (games whose bots exist only for local testing). */
    botsRequireTestKnobs?: boolean;
}
/** healthz, POST /matches (bearer), POST /matches/open, GET /matches/:code, GET /matches/:code/ws. */
declare function matchFetch(request: Request, env: MatchEnv, options?: MatchFetchOptions): Promise<Response>;

export { LAUNCH_EXPIRE_MS, type LaunchDeps, type LaunchResult, type MatchEnv, type MatchFetchOptions, type MatchStub, type RoomOptions, handleCreateMatch, handleOpenMatch, matchFetch };
