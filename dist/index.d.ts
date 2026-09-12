import { R as Rng } from './match-object-dYGMUSNc.js';
export { C as CreateOptions, a as CreateResult, D as Deadlines, b as DriveKind, G as GameAdapter, M as MatchEnv, c as MatchObjectApi, d as MatchObjectClass, N as NO_DEADLINES, P as Placement, e as RuleError, T as TIMER_KEYS, f as TimerKey, g as createMatchObject, h as dueKeys, i as earliest, j as isRuleError } from './match-object-dYGMUSNc.js';
export { ClientEnvelope, LobbyPayload, ServerEnvelope, clientEnvelopeSchema, lobbyPayloadSchema, serverEnvelopeSchema } from './envelope.js';
import 'cloudflare:workers';
import 'zod';

/**
 * The rng for the intent that will become `seq`. Derived, never persisted:
 * replaying (seed, seq) yields the same rolls, and a retried alarm cannot
 * advance the stream twice.
 */
declare function intentRng(seed: number, seq: number): Rng;

/** Four-letter join code. `random` in [0,1). */
declare function randomCode(random?: () => number): string;

export { Rng, intentRng, randomCode };
