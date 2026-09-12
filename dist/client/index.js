import {
  serverEnvelopeSchema
} from "../chunk-7VKXMC5V.js";

// src/client/index.ts
function httpOrigin(origin) {
  const u = new URL(origin);
  u.protocol = u.protocol === "wss:" || u.protocol === "https:" ? "https:" : "http:";
  return u.origin;
}
function wsUrl(origin, code) {
  const u = new URL(origin);
  u.protocol = u.protocol === "wss:" || u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = `/matches/${code}/ws`;
  u.search = "";
  u.hash = "";
  return u.toString();
}
var MatchSocket = class {
  ws = null;
  listeners = [];
  closers = [];
  /** Opens the socket and sends `hello` on open. Rejects if it closes or errors first. */
  connect(url, hello) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let opened = false;
      ws.addEventListener("open", () => {
        opened = true;
        ws.send(JSON.stringify(hello));
        resolve();
      });
      ws.addEventListener("message", (e) => {
        let parsed;
        try {
          parsed = JSON.parse(String(e.data));
        } catch {
          return;
        }
        const env = serverEnvelopeSchema.safeParse(parsed);
        if (!env.success) return;
        for (const l of [...this.listeners]) l(env.data);
      });
      ws.addEventListener("close", (e) => {
        const code = e.code ?? 1006;
        if (!opened) reject(new Error(`socket closed before open (${code})`));
        for (const c of [...this.closers]) c(code);
      });
      ws.addEventListener("error", () => {
        if (!opened) reject(new Error("socket closed before open (error)"));
      });
    });
  }
  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
  onMessage(cb) {
    this.listeners.push(cb);
  }
  onClose(cb) {
    this.closers.push(cb);
  }
  /** Deliberate close: nothing is delivered or reported after this. */
  close() {
    this.listeners = [];
    this.closers = [];
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1e3, "leave");
    } catch {
    }
  }
};
export {
  MatchSocket,
  httpOrigin,
  wsUrl
};
//# sourceMappingURL=index.js.map