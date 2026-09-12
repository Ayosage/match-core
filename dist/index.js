import {
  randomCode
} from "./chunk-WURP3JNE.js";
import {
  clientEnvelopeSchema,
  lobbyPayloadSchema,
  serverEnvelopeSchema
} from "./chunk-7VKXMC5V.js";

// src/adapter.ts
function isRuleError(x) {
  return typeof x === "object" && x !== null && "code" in x && "message" in x && !("turn" in x);
}

// src/timers.ts
var TIMER_KEYS = ["pilot", "offer", "abandon", "expiry", "webhook", "game"];
var NO_DEADLINES = { pilot: null, offer: null, abandon: null, expiry: null, webhook: null, game: null };
function earliest(d) {
  let best = null;
  for (const k of TIMER_KEYS) {
    const v = d[k];
    if (v !== null && (best === null || v < best)) best = v;
  }
  return best;
}
function dueKeys(d, now) {
  return TIMER_KEYS.filter((k) => d[k] !== null && d[k] <= now).sort((a, b) => d[a] - d[b]);
}

// src/rng.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  };
}
function intentRng(seed, seq) {
  return mulberry32((seed ^ Math.imul(seq + 1, 2654435769)) >>> 0);
}

// src/match-object.ts
import { DurableObject } from "cloudflare:workers";
var SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seats (seat INTEGER PRIMARY KEY, kind TEXT NOT NULL, token TEXT, seatToken TEXT, displayName TEXT, connected INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS timers (k TEXT PRIMARY KEY, at INTEGER);
CREATE TABLE IF NOT EXISTS memory (seat INTEGER PRIMARY KEY, json TEXT NOT NULL);
`;
function createMatchObject(adapter) {
  return class MatchObject extends DurableObject {
    constructor(ctx, env) {
      super(ctx, env);
      ctx.blockConcurrencyWhile(async () => {
        this.ctx.storage.sql.exec(SCHEMA);
      });
    }
    // ---- storage helpers ---------------------------------------------------
    getMeta() {
      const rows = this.ctx.storage.sql.exec("SELECT k, v FROM meta").toArray();
      if (rows.length === 0) return null;
      const m = {};
      for (const r of rows) m[r.k] = r.v;
      return {
        phase: m.phase,
        targetPlayers: Number(m.targetPlayers),
        botCount: Number(m.botCount),
        seed: Number(m.seed),
        seq: Number(m.seq),
        launched: Number(m.launched),
        clientOrigin: m.clientOrigin ?? "",
        callbackUrl: m.callbackUrl || null,
        callbackToken: m.callbackToken || null,
        knobs: m.knobs ?? "{}",
        createdAt: Number(m.createdAt)
      };
    }
    /** Upsert meta keys. Extra keys beyond `Meta` (seatNames, result, webhook bookkeeping) are allowed. */
    setMeta(patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) continue;
        this.ctx.storage.sql.exec(
          "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
          k,
          v === null ? "" : String(v)
        );
      }
    }
    metaValue(k) {
      const row = this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0];
      return row ? row.v : null;
    }
    seats() {
      return this.ctx.storage.sql.exec("SELECT seat, kind, token, seatToken, displayName, connected FROM seats ORDER BY seat").toArray();
    }
    deadlines() {
      const d = { ...NO_DEADLINES };
      for (const r of this.ctx.storage.sql.exec("SELECT k, at FROM timers").toArray())
        d[r.k] = r.at;
      return d;
    }
    setDeadline(k, at) {
      this.ctx.storage.sql.exec("INSERT INTO timers (k, at) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET at = excluded.at", k, at);
    }
    /** One alarm per object: always the earliest stored deadline. */
    armAlarm() {
      const at = earliest(this.deadlines());
      if (at === null) void this.ctx.storage.deleteAlarm();
      else void this.ctx.storage.setAlarm(at);
    }
    // ---- RPC ---------------------------------------------------------------
    async create(opts) {
      if (this.getMeta() !== null) return { status: "conflict" };
      if (!Number.isInteger(opts.players) || opts.players < adapter.players.min || opts.players > adapter.players.max)
        return { status: "invalid", message: `players must be ${adapter.players.min}..${adapter.players.max}` };
      if (!Number.isInteger(opts.bots) || opts.bots < 0 || opts.bots > opts.players - 1)
        return { status: "invalid", message: "bots must be an integer in 0..players-1" };
      const testing = this.env.TEST_KNOBS === "1";
      const knobs = testing ? opts.knobs ?? {} : {};
      const wanted = typeof opts.seed === "number" ? opts.seed : knobs.seed;
      const seed = testing && typeof wanted === "number" ? wanted : Math.floor(Math.random() * 2 ** 31);
      const now = Date.now();
      this.setMeta({
        phase: "waiting",
        targetPlayers: opts.players,
        botCount: opts.bots,
        seed,
        seq: 0,
        launched: opts.launched ? 1 : 0,
        clientOrigin: opts.clientOrigin,
        callbackUrl: opts.callback?.url ?? null,
        callbackToken: opts.callback?.token ?? null,
        knobs: JSON.stringify(knobs),
        createdAt: now,
        // seatNames from a launch pre-label seats in order as humans arrive
        seatNames: JSON.stringify(opts.seatNames ?? []),
        hostSeatToken: opts.host?.seatToken ?? null,
        hostDisplayName: opts.host?.displayName ?? null
      });
      if (opts.launched) {
        const expireMs = typeof knobs.launchExpireMs === "number" ? knobs.launchExpireMs : 30 * 6e4;
        this.setDeadline("expiry", now + expireMs);
        this.armAlarm();
      }
      return { status: "created" };
    }
    lobby() {
      const meta = this.getMeta();
      if (!meta) return null;
      const seats = this.seats();
      const names = JSON.parse(this.metaValue("seatNames") ?? "[]");
      return {
        phase: meta.phase,
        seats: seats.map((s) => s.kind === "bot" ? `bot-${s.seat}` : `seat-${s.seat}`),
        connected: seats.map((s) => s.connected === 1),
        targetPlayers: meta.targetPlayers,
        botCount: meta.botCount,
        // Positional: seat i reads seatNames[i]; '' means unnamed (the client falls back to Player N).
        seatNames: seats.map((s, i) => s.displayName ?? names[i] ?? "")
      };
    }
    // ---- sockets -----------------------------------------------------------
    async fetch(request) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      if (this.getMeta() === null) return new Response("no such match", { status: 404 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    send(ws, msg) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
      }
    }
    attachment(ws) {
      return ws.deserializeAttachment() ?? null;
    }
    sendToSeat(seat, msg) {
      for (const ws of this.ctx.getWebSockets()) {
        if (this.attachment(ws)?.seat === seat) this.send(ws, msg);
      }
    }
    broadcastLobby() {
      const lobby = this.lobby();
      if (!lobby) return;
      for (const ws of this.ctx.getWebSockets()) this.send(ws, { t: "lobby", ...lobby });
    }
    async webSocketMessage(ws, raw) {
      let parsed;
      try {
        parsed = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      } catch {
        return this.send(ws, { t: "error", code: "BAD_MESSAGE", message: "malformed message" });
      }
      const env = clientEnvelopeSchema.safeParse(parsed);
      if (!env.success) return this.send(ws, { t: "error", code: "BAD_MESSAGE", message: "malformed message" });
      const att = this.attachment(ws);
      switch (env.data.t) {
        case "hello":
          return this.handleHello(ws, env.data);
        case "start":
          return att ? this.handleStart(att.seat) : void 0;
        case "configure":
          return att ? this.handleConfigure(att.seat, env.data.players, env.data.bots) : void 0;
        case "intent":
          return att ? this.handleIntent(att.seat, env.data.intent) : void 0;
      }
    }
    handleHello(ws, hello) {
      const meta = this.getMeta();
      if (!meta) return this.send(ws, { t: "error", code: "NOT_FOUND", message: "no such match" });
      const already = this.attachment(ws);
      if (already) return this.send(ws, { t: "welcome", seat: already.seat, token: already.token });
      if (hello.token) {
        const row = this.seats().find((s) => s.kind === "human" && s.token === hello.token);
        if (!row) return this.send(ws, { t: "error", code: "BAD_TOKEN", message: "token invalid or expired" });
        return this.seatSocket(ws, row.seat, row.token, true);
      }
      if (meta.phase !== "waiting")
        return this.send(ws, { t: "error", code: "NOT_WAITING", message: "match already started" });
      const seats = this.seats();
      const humansWanted = meta.targetPlayers - meta.botCount;
      if (seats.filter((s) => s.kind === "human").length >= humansWanted)
        return this.send(ws, { t: "error", code: "FULL", message: "match is full" });
      const hostToken = this.metaValue("hostSeatToken");
      const isHost = !!hostToken && hello.seatToken === hostToken;
      const displayName = hello.displayName ?? (isHost ? this.metaValue("hostDisplayName") : null);
      let seat = seats.length;
      const token = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        "INSERT INTO seats (seat, kind, token, seatToken, displayName, connected) VALUES (?, ?, ?, ?, ?, 1)",
        seat,
        "human",
        token,
        hello.seatToken ?? null,
        displayName
      );
      if (isHost && seat !== 0) {
        this.ctx.storage.sql.exec("UPDATE seats SET seat = -1 WHERE seat = 0");
        this.ctx.storage.sql.exec("UPDATE seats SET seat = 0 WHERE seat = ?", seat);
        this.ctx.storage.sql.exec("UPDATE seats SET seat = ? WHERE seat = -1", seat);
        for (const o of this.ctx.getWebSockets()) {
          const a = this.attachment(o);
          if (a?.seat === 0) {
            o.serializeAttachment({ ...a, seat });
            this.send(o, { t: "welcome", seat, token: a.token });
          }
        }
        seat = 0;
      }
      this.seatSocket(ws, seat, token, false);
    }
    /** Host only, while waiting: resize the table. Never starts it; that is the host's Start. */
    handleConfigure(seat, players, bots) {
      const meta = this.getMeta();
      if (seat !== 0)
        return this.sendToSeat(seat, { t: "error", code: "NOT_HOST", message: "Only the host can change the table." });
      if (meta.phase !== "waiting")
        return this.sendToSeat(seat, { t: "error", code: "NOT_WAITING", message: "The match has already started." });
      const { min, max } = adapter.players;
      if (!Number.isInteger(players) || players < min || players > max)
        return this.sendToSeat(seat, { t: "error", code: "BAD_CONFIG", message: `Players must be ${min} to ${max}.` });
      if (!Number.isInteger(bots) || bots < 0 || bots > players - 1)
        return this.sendToSeat(seat, { t: "error", code: "BAD_CONFIG", message: `Bots must be 0 to ${players - 1}.` });
      const humans = this.seats().filter((s) => s.kind === "human").length;
      if (humans > players - bots)
        return this.sendToSeat(seat, {
          t: "error",
          code: "BAD_CONFIG",
          message: `${humans} players are already seated, so that table needs at least ${humans} human seats.`
        });
      this.setMeta({ targetPlayers: players, botCount: bots });
      this.broadcastLobby();
    }
    /** Bind the socket to a seat, welcome it, and tell everyone the lobby changed. */
    seatSocket(ws, seat, token, rejoin) {
      ws.serializeAttachment({ seat, token });
      this.ctx.storage.sql.exec("UPDATE seats SET connected = 1 WHERE seat = ?", seat);
      this.send(ws, { t: "welcome", seat, token });
      this.broadcastLobby();
      if (rejoin) this.onRejoin(seat);
    }
    // ---- state -------------------------------------------------------------
    loadState() {
      const row = this.ctx.storage.sql.exec("SELECT json FROM state WHERE id = 1").toArray()[0];
      return row ? JSON.parse(row.json) : null;
    }
    saveState(state, seq) {
      this.ctx.storage.sql.exec(
        "INSERT INTO state (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
        JSON.stringify(state)
      );
      this.setMeta({ seq });
    }
    knobs() {
      return JSON.parse(this.metaValue("knobs") ?? "{}");
    }
    /** Seat the bots after the humans present, create the game for the seated count, and go. */
    startGame() {
      const meta = this.getMeta();
      const humans = this.seats().length;
      for (let i = 0; i < meta.botCount; i++) {
        this.ctx.storage.sql.exec(
          "INSERT INTO seats (seat, kind, token, seatToken, displayName, connected) VALUES (?, ?, NULL, NULL, ?, 1)",
          humans + i,
          "bot",
          `Bot ${i + 1}`
        );
      }
      const playerCount = this.seats().length;
      const knobs = this.knobs();
      const state = adapter.create({ ...knobs, playerCount, seed: meta.seed, now: Date.now() }, intentRng(meta.seed, 0));
      this.saveState(state, 0);
      this.syncGameDeadline(state);
      this.setMeta({ phase: "playing" });
      this.setDeadline("expiry", null);
      this.broadcastLobby();
      this.broadcastViews();
      this.scheduleDriving();
    }
    /** Host only, while waiting: start with the people present; bots take every empty seat. */
    handleStart(seat) {
      const meta = this.getMeta();
      if (seat !== 0)
        return this.sendToSeat(seat, { t: "error", code: "NOT_HOST", message: "Only the host can start the match." });
      if (meta.phase !== "waiting")
        return this.sendToSeat(seat, { t: "error", code: "NOT_WAITING", message: "The match has already started." });
      const humans = this.seats().length;
      this.setMeta({ botCount: meta.targetPlayers - humans });
      this.startGame();
    }
    handleIntent(seat, raw) {
      const parsed = adapter.intentSchema.safeParse(raw);
      if (!parsed.success)
        return this.sendToSeat(seat, { t: "error", code: "BAD_MESSAGE", message: "Malformed intent." });
      const meta = this.getMeta();
      if (meta.phase !== "playing")
        return this.sendToSeat(seat, { t: "error", code: "NOT_PLAYING", message: "The match is not in progress." });
      this.applyAndBroadcast({ ...parsed.data, player: seat }, seat);
    }
    /** Single choke point: every state change flows through here. The SQLite write lands before any send. */
    applyAndBroadcast(intent, errorTo) {
      const meta = this.getMeta();
      const state = this.loadState();
      if (!state || meta.phase !== "playing") return;
      const result = adapter.apply(state, intent, intentRng(meta.seed, meta.seq + 1), Date.now());
      if (isRuleError(result)) {
        if (errorTo !== void 0)
          return this.sendToSeat(errorTo, { t: "error", code: result.code, message: result.message });
        console.warn(
          `[match ${this.ctx.id.name ?? this.ctx.id.toString().slice(0, 8)}] driven seat ${intent.player} rejected: ${result.code} ${result.message}`
        );
        this.scheduleDriving();
        return;
      }
      const seq = meta.seq + 1;
      this.saveState(result, seq);
      this.syncGameDeadline(result);
      const events = adapter.events(state, intent, result);
      this.broadcastViews(events);
      if (adapter.isEnded(result)) {
        this.setMeta({ phase: "ended" });
        this.setDeadline("game", null);
        for (const ws of this.ctx.getWebSockets()) this.send(ws, { t: "ended", reason: "win", winner: adapter.winner(result) });
        this.onEnded(result);
        return;
      }
      this.scheduleDriving();
      this.syncOfferWindow(result);
    }
    broadcastViews(events = []) {
      const state = this.loadState();
      const meta = this.getMeta();
      if (!state || !meta) return;
      for (const row of this.seats()) {
        if (row.kind !== "human") continue;
        const msg = {
          t: "snapshot",
          seq: meta.seq,
          view: adapter.view(state, row.seat),
          ...events.length > 0 ? { events: events.map((e) => adapter.redactEvent(e, row.seat)) } : {}
        };
        this.sendToSeat(row.seat, msg);
      }
    }
    // ---- driving: pilots and bots on the single alarm ------------------------
    humansConnected() {
      return this.seats().filter((s) => s.kind === "human" && s.connected === 1).length;
    }
    memoryFor(seat) {
      const row = this.ctx.storage.sql.exec("SELECT json FROM memory WHERE seat = ?", seat).toArray()[0];
      return row ? JSON.parse(row.json) : void 0;
    }
    setMemory(seat, memory) {
      this.ctx.storage.sql.exec(
        "INSERT INTO memory (seat, json) VALUES (?, ?) ON CONFLICT(seat) DO UPDATE SET json = excluded.json",
        seat,
        JSON.stringify(memory ?? null)
      );
    }
    /**
     * A seat's stored memory plus the live offer-window flag. Both the probe and
     * the real drive must see the same flag: the stored copy is stale the moment
     * the window resolves, and a probe that trusts it never arms the alarm.
     */
    driveMemory(seat) {
      const offerDeadlineHit = this.metaValue("offerDeadlineHit") === "1";
      const mem = this.memoryFor(seat);
      return { ...typeof mem === "object" && mem !== null ? mem : {}, offerDeadlineHit };
    }
    /** First seat with no human that the game is waiting on, and its kind. */
    nextDrivenSeat(state) {
      for (const row of this.seats()) {
        if (row.kind === "human" && row.connected === 1) continue;
        const kind = row.kind === "bot" ? "bot" : "pilot";
        const probe = adapter.drive(state, row.seat, kind, { next: () => 0 }, this.driveMemory(row.seat));
        if (probe.intent !== null) return { seat: row.seat, kind };
      }
      return null;
    }
    /** Arm (or clear) the pilot deadline for the next driven seat. Replaces the Colyseus room's schedulePilot. */
    scheduleDriving() {
      const meta = this.getMeta();
      const state = this.loadState();
      if (!meta || !state || meta.phase !== "playing" || this.humansConnected() === 0) {
        this.setDeadline("pilot", null);
        this.armAlarm();
        return;
      }
      const next = this.nextDrivenSeat(state);
      if (!next) {
        this.setDeadline("pilot", null);
      } else {
        const knobs = this.knobs();
        const override = next.kind === "bot" ? knobs.botDelayMs : knobs.pilotDelayMs;
        const delay = typeof override === "number" ? override : adapter.driveDelayMs(next.kind);
        this.setDeadline("pilot", Date.now() + delay);
      }
      this.armAlarm();
    }
    firePilot() {
      this.setDeadline("pilot", null);
      const meta = this.getMeta();
      const state = this.loadState();
      if (!meta || !state || meta.phase !== "playing" || this.humansConnected() === 0) return;
      const next = this.nextDrivenSeat(state);
      if (!next) return;
      const { intent, memory } = adapter.drive(state, next.seat, next.kind, intentRng(meta.seed, meta.seq + 1), this.driveMemory(next.seat));
      this.setMemory(next.seat, memory);
      if (intent) this.applyAndBroadcast(intent);
      else this.scheduleDriving();
    }
    /** The game's own deadline, if the adapter has one, as the sixth stored timer. */
    syncGameDeadline(state) {
      if (!adapter.deadline) return;
      const at = adapter.isEnded(state) ? null : adapter.deadline(state);
      this.setDeadline("game", at);
      this.armAlarm();
    }
    /** The game deadline passed: let the adapter move the state on, through the usual broadcast path. */
    fireGame() {
      this.setDeadline("game", null);
      const meta = this.getMeta();
      const state = this.loadState();
      if (!meta || !state || meta.phase !== "playing" || !adapter.expire) return;
      const { state: next, events } = adapter.expire(state, Date.now(), intentRng(meta.seed, meta.seq + 1));
      const seq = meta.seq + 1;
      this.saveState(next, seq);
      this.broadcastViews(events);
      if (adapter.isEnded(next)) {
        this.setMeta({ phase: "ended" });
        for (const ws of this.ctx.getWebSockets()) this.send(ws, { t: "ended", reason: "win", winner: adapter.winner(next) });
        this.onEnded(next);
        return;
      }
      this.syncGameDeadline(next);
      this.scheduleDriving();
      this.syncOfferWindow(next);
    }
    /** A bot's own offer stays open for offerWindowMs, or until every other seat answered. */
    syncOfferWindow(state) {
      const { open, everyoneAnswered } = adapter.offerWindow(state);
      const current = this.seats().find((s) => s.seat === adapter.currentSeat(state));
      if (!open || current?.kind !== "bot") {
        this.setDeadline("offer", null);
        this.setMeta({ offerDeadlineHit: 0 });
        this.armAlarm();
        return;
      }
      if (everyoneAnswered) {
        this.setDeadline("offer", null);
        this.setMeta({ offerDeadlineHit: 1 });
        this.scheduleDriving();
        return;
      }
      if (this.deadlines().offer === null) {
        const knobs = this.knobs();
        const windowMs = typeof knobs.offerWindowMs === "number" ? knobs.offerWindowMs : adapter.offerWindowMs;
        this.setDeadline("offer", Date.now() + windowMs);
        this.armAlarm();
      }
    }
    async alarm() {
      const now = Date.now();
      for (const key of dueKeys(this.deadlines(), now)) {
        switch (key) {
          case "pilot":
            this.firePilot();
            break;
          case "offer":
            this.setDeadline("offer", null);
            this.setMeta({ offerDeadlineHit: 1 });
            this.scheduleDriving();
            break;
          case "abandon":
            await this.fireAbandon();
            break;
          case "expiry":
            await this.fireExpiry();
            break;
          case "webhook":
            await this.fireWebhook();
            break;
          case "game":
            this.fireGame();
            break;
        }
      }
      this.armAlarm();
    }
    /** TEST_KNOBS only: read the game state. */
    stateForTest() {
      return this.env.TEST_KNOBS === "1" ? this.loadState() : null;
    }
    /** TEST_KNOBS only: replace the game state (seq unchanged) and schedule it as if it had just been applied. */
    loadStateForTest(state) {
      if (this.env.TEST_KNOBS !== "1") return;
      const meta = this.getMeta();
      if (!meta) return;
      this.saveState(state, meta.seq);
      this.scheduleDriving();
      this.syncOfferWindow(state);
    }
    /** TEST_KNOBS only: expose the deadline table. */
    deadlinesForTest() {
      return this.env.TEST_KNOBS === "1" ? this.deadlines() : null;
    }
    // ---- leave, rejoin, end --------------------------------------------------
    async webSocketClose(ws) {
      const att = this.attachment(ws);
      if (!att) return;
      const meta = this.getMeta();
      if (!meta) return;
      const stillOpen = this.ctx.getWebSockets().some((o) => o !== ws && this.attachment(o)?.seat === att.seat);
      if (stillOpen) return;
      if (meta.phase === "waiting") {
        const rest = this.seats().filter((r) => r.seat !== att.seat);
        this.ctx.storage.sql.exec("DELETE FROM seats");
        rest.forEach(
          (r, i) => this.ctx.storage.sql.exec(
            "INSERT INTO seats (seat, kind, token, seatToken, displayName, connected) VALUES (?, ?, ?, ?, ?, ?)",
            i,
            r.kind,
            r.token,
            r.seatToken,
            r.displayName,
            r.connected
          )
        );
        for (const o of this.ctx.getWebSockets()) {
          const a = this.attachment(o);
          if (a && a.seat > att.seat) o.serializeAttachment({ ...a, seat: a.seat - 1 });
        }
        this.broadcastLobby();
        if (rest.length === 0 && meta.launched === 0) {
          this.setDeadline("expiry", Date.now() + 3e4);
          this.armAlarm();
        }
        return;
      }
      if (meta.phase !== "playing") return;
      this.ctx.storage.sql.exec("UPDATE seats SET connected = 0 WHERE seat = ?", att.seat);
      this.broadcastLobby();
      this.scheduleDriving();
      if (this.humansConnected() === 0) {
        const knobs = this.knobs();
        const abandonMs = typeof knobs.abandonMs === "number" ? knobs.abandonMs : 10 * 6e4;
        if (this.deadlines().abandon === null) this.setDeadline("abandon", Date.now() + abandonMs);
        this.armAlarm();
      }
    }
    async webSocketError(ws) {
      return this.webSocketClose(ws);
    }
    onRejoin(seat) {
      this.setDeadline("abandon", null);
      const meta = this.getMeta();
      const state = this.loadState();
      if (meta.phase !== "waiting" && state) {
        this.sendToSeat(seat, { t: "snapshot", seq: meta.seq, view: adapter.view(state, seat) });
        if (meta.phase === "ended") {
          const reason = this.metaValue("resultStatus") === "abandoned" ? "abandoned" : "win";
          this.sendToSeat(seat, { t: "ended", reason, winner: adapter.winner(state) });
        }
      }
      this.scheduleDriving();
    }
    onEnded(state) {
      this.setDeadline("pilot", null);
      this.setDeadline("offer", null);
      this.setDeadline("abandon", null);
      this.setDeadline("game", null);
      this.setMeta({ resultStatus: "completed", resultJson: JSON.stringify(adapter.result(state)) });
      this.setDeadline("webhook", Date.now());
      this.setDeadline("expiry", Date.now() + 24 * 60 * 6e4);
      this.armAlarm();
    }
    async fireAbandon() {
      this.setDeadline("abandon", null);
      const meta = this.getMeta();
      const state = this.loadState();
      if (!meta || meta.phase !== "playing" || !state) return;
      this.setMeta({ phase: "ended", resultStatus: "abandoned", resultJson: JSON.stringify(adapter.result(state)) });
      this.setDeadline("pilot", null);
      this.setDeadline("offer", null);
      this.setDeadline("game", null);
      for (const ws of this.ctx.getWebSockets()) this.send(ws, { t: "ended", reason: "abandoned", winner: null });
      this.setDeadline("webhook", Date.now());
      this.setDeadline("expiry", Date.now() + 24 * 60 * 6e4);
    }
    async fireExpiry() {
      const meta = this.getMeta();
      if (!meta || meta.phase === "playing") {
        this.setDeadline("expiry", null);
        return;
      }
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(1e3, "match expired");
        } catch {
        }
      }
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      this.ctx.storage.sql.exec(SCHEMA);
    }
    async fireWebhook() {
      const meta = this.getMeta();
      if (!meta || !meta.callbackUrl || !meta.callbackToken) {
        this.setDeadline("webhook", null);
        return;
      }
      const status = this.metaValue("resultStatus") ?? "completed";
      const placements = JSON.parse(this.metaValue("resultJson") ?? "[]");
      const seats = this.seats();
      const body = {
        code: this.ctx.id.name ?? null,
        status,
        seats: placements.map((p) => {
          const row = seats.find((s) => s.seat === p.seat);
          return {
            ...row?.seatToken ? { seatToken: row.seatToken } : {},
            ...row?.displayName ? { displayName: row.displayName } : {},
            placement: p.placement,
            winner: p.winner,
            stats: p.stats
          };
        })
      };
      const attempt = Number(this.metaValue("webhookAttempts") ?? "0") + 1;
      let ok = false;
      try {
        const res = await fetch(meta.callbackUrl, {
          method: "POST",
          headers: { authorization: `Bearer ${meta.callbackToken}`, "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      this.setMeta({ webhookAttempts: attempt });
      if (ok || attempt >= 20) this.setDeadline("webhook", null);
      else this.setDeadline("webhook", Date.now() + Math.min(60 * 6e4, 2 ** attempt * 1e3));
    }
  };
}
export {
  NO_DEADLINES,
  TIMER_KEYS,
  clientEnvelopeSchema,
  createMatchObject,
  dueKeys,
  earliest,
  intentRng,
  isRuleError,
  lobbyPayloadSchema,
  randomCode,
  serverEnvelopeSchema
};
//# sourceMappingURL=index.js.map