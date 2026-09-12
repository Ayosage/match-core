import { z } from 'zod';

/**
 * Transport envelope between a client and a match object. Game payloads
 * (`intent`, `view`, `events`) are opaque here; the object validates intents
 * with its adapter's schema and views are whatever the adapter redacts.
 */
declare const clientEnvelopeSchema: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
    t: z.ZodLiteral<"hello">;
    /** Reconnect token from a previous welcome. */
    token: z.ZodOptional<z.ZodString>;
    /** Steward per-player seat token from the personal join link. */
    seatToken: z.ZodOptional<z.ZodString>;
    displayName: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    t: "hello";
    token?: string | undefined;
    seatToken?: string | undefined;
    displayName?: string | undefined;
}, {
    t: "hello";
    token?: string | undefined;
    seatToken?: string | undefined;
    displayName?: string | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"intent">;
    intent: z.ZodUnknown;
}, "strict", z.ZodTypeAny, {
    t: "intent";
    intent?: unknown;
}, {
    t: "intent";
    intent?: unknown;
}>, z.ZodObject<{
    t: z.ZodLiteral<"start">;
}, "strict", z.ZodTypeAny, {
    t: "start";
}, {
    t: "start";
}>, z.ZodObject<{
    t: z.ZodLiteral<"configure">;
    players: z.ZodNumber;
    bots: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    t: "configure";
    players: number;
    bots: number;
}, {
    t: "configure";
    players: number;
    bots: number;
}>]>;
type ClientEnvelope = z.infer<typeof clientEnvelopeSchema>;
declare const lobbyPayloadSchema: z.ZodObject<{
    phase: z.ZodEnum<["waiting", "playing", "ended"]>;
    seats: z.ZodArray<z.ZodString, "many">;
    connected: z.ZodArray<z.ZodBoolean, "many">;
    targetPlayers: z.ZodNumber;
    botCount: z.ZodNumber;
    seatNames: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    phase: "waiting" | "playing" | "ended";
    seats: string[];
    connected: boolean[];
    targetPlayers: number;
    botCount: number;
    seatNames: string[];
}, {
    phase: "waiting" | "playing" | "ended";
    seats: string[];
    connected: boolean[];
    targetPlayers: number;
    botCount: number;
    seatNames: string[];
}>;
type LobbyPayload = z.infer<typeof lobbyPayloadSchema>;
declare const serverEnvelopeSchema: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
    t: z.ZodLiteral<"welcome">;
    seat: z.ZodNumber;
    token: z.ZodString;
}, "strict", z.ZodTypeAny, {
    t: "welcome";
    token: string;
    seat: number;
}, {
    t: "welcome";
    token: string;
    seat: number;
}>, z.ZodObject<{
    phase: z.ZodEnum<["waiting", "playing", "ended"]>;
    seats: z.ZodArray<z.ZodString, "many">;
    connected: z.ZodArray<z.ZodBoolean, "many">;
    targetPlayers: z.ZodNumber;
    botCount: z.ZodNumber;
    seatNames: z.ZodArray<z.ZodString, "many">;
} & {
    t: z.ZodLiteral<"lobby">;
}, "strict", z.ZodTypeAny, {
    t: "lobby";
    phase: "waiting" | "playing" | "ended";
    seats: string[];
    connected: boolean[];
    targetPlayers: number;
    botCount: number;
    seatNames: string[];
}, {
    t: "lobby";
    phase: "waiting" | "playing" | "ended";
    seats: string[];
    connected: boolean[];
    targetPlayers: number;
    botCount: number;
    seatNames: string[];
}>, z.ZodObject<{
    t: z.ZodLiteral<"snapshot">;
    seq: z.ZodNumber;
    view: z.ZodUnknown;
    events: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
}, "strict", z.ZodTypeAny, {
    t: "snapshot";
    seq: number;
    view?: unknown;
    events?: unknown[] | undefined;
}, {
    t: "snapshot";
    seq: number;
    view?: unknown;
    events?: unknown[] | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"error">;
    code: z.ZodString;
    message: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
    message: string;
    t: "error";
}, {
    code: string;
    message: string;
    t: "error";
}>, z.ZodObject<{
    t: z.ZodLiteral<"ended">;
    reason: z.ZodEnum<["win", "forfeit", "abandoned"]>;
    winner: z.ZodNullable<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    t: "ended";
    reason: "win" | "forfeit" | "abandoned";
    winner: number | null;
}, {
    t: "ended";
    reason: "win" | "forfeit" | "abandoned";
    winner: number | null;
}>]>;
type ServerEnvelope = z.infer<typeof serverEnvelopeSchema>;

export { type ClientEnvelope, type LobbyPayload, type ServerEnvelope, clientEnvelopeSchema, lobbyPayloadSchema, serverEnvelopeSchema };
