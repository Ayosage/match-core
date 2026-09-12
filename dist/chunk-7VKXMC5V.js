// src/envelope.ts
import { z } from "zod";
var clientEnvelopeSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    /** Reconnect token from a previous welcome. */
    token: z.string().min(1).optional(),
    /** Steward per-player seat token from the personal join link. */
    seatToken: z.string().min(1).max(128).optional(),
    displayName: z.string().min(1).max(64).optional()
  }).strict(),
  z.object({ t: z.literal("intent"), intent: z.unknown() }).strict(),
  /** Host only, while waiting: start now; bots fill the empty seats. */
  z.object({ t: z.literal("start") }).strict(),
  /** Host only, while waiting: set the table size and how many seats bots take. */
  z.object({ t: z.literal("configure"), players: z.number().int().min(2), bots: z.number().int().nonnegative() }).strict()
]);
var lobbyPayloadSchema = z.object({
  phase: z.enum(["waiting", "playing", "ended"]),
  seats: z.array(z.string()),
  connected: z.array(z.boolean()),
  targetPlayers: z.number().int().min(2),
  botCount: z.number().int().nonnegative(),
  seatNames: z.array(z.string())
}).strict();
var serverEnvelopeSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("welcome"), seat: z.number().int().nonnegative(), token: z.string().min(1) }).strict(),
  lobbyPayloadSchema.extend({ t: z.literal("lobby") }).strict(),
  z.object({
    t: z.literal("snapshot"),
    seq: z.number().int().nonnegative(),
    view: z.unknown(),
    events: z.array(z.unknown()).optional()
  }).strict(),
  z.object({ t: z.literal("error"), code: z.string().min(1), message: z.string() }).strict(),
  z.object({
    t: z.literal("ended"),
    reason: z.enum(["win", "forfeit", "abandoned"]),
    winner: z.number().int().nonnegative().nullable()
  }).strict()
]);

export {
  clientEnvelopeSchema,
  lobbyPayloadSchema,
  serverEnvelopeSchema
};
//# sourceMappingURL=chunk-7VKXMC5V.js.map