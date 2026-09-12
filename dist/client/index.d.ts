import { ClientEnvelope, ServerEnvelope } from '../envelope.js';
import 'zod';

/** `VITE_SERVER_URL` is the Worker's origin (http(s) or ws(s)); the http(s) form, no trailing slash. */
declare function httpOrigin(origin: string): string;
/** The match socket url for a room code, derived from the Worker's origin. */
declare function wsUrl(origin: string, code: string): string;
/** Thin envelope-aware WebSocket. Reconnection policy lives in net/catan.ts. */
declare class MatchSocket {
    private ws;
    private listeners;
    private closers;
    /** Opens the socket and sends `hello` on open. Rejects if it closes or errors first. */
    connect(url: string, hello: ClientEnvelope): Promise<void>;
    send(msg: ClientEnvelope): void;
    onMessage(cb: (m: ServerEnvelope) => void): void;
    onClose(cb: (code: number) => void): void;
    /** Deliberate close: nothing is delivered or reported after this. */
    close(): void;
}

export { MatchSocket, httpOrigin, wsUrl };
