import {
  randomCode
} from "../chunk-WURP3JNE.js";

// src/worker/launch.ts
var LAUNCH_EXPIRE_MS = 30 * 60 * 1e3;
var CODE_ATTEMPTS = 20;
async function allocate(deps, options) {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = deps.newCode();
    const result = await deps.createRoom(code, options);
    if (result.status === "conflict") continue;
    if (result.status === "invalid") return { status: 422, body: { error: result.message } };
    return {
      status: 201,
      body: {
        code,
        joinUrl: `${deps.clientOrigin}/?join=${code}`,
        ...options.launched ? { expiresAt: new Date(deps.now() + LAUNCH_EXPIRE_MS).toISOString() } : {}
      }
    };
  }
  return { status: 503, body: { error: "could not allocate a room code" } };
}
function counts(b) {
  const players = b.players;
  if (typeof players !== "number") return { status: 422, body: { error: "players is required" } };
  const bots = b.bots ?? 0;
  if (typeof bots !== "number") return { status: 422, body: { error: "bots must be a number" } };
  return { players, bots };
}
async function handleCreateMatch(authHeader, body, deps) {
  if (!deps.launchToken || authHeader !== `Bearer ${deps.launchToken}`)
    return { status: 401, body: { error: "bad token" } };
  const b = body ?? {};
  const c = counts(b);
  if ("status" in c) return c;
  const seatNames = b.seatNames ?? (Array.isArray(b.seats) ? b.seats.map((s) => typeof s?.displayName === "string" ? s.displayName : "") : void 0);
  if (seatNames !== void 0 && !(Array.isArray(seatNames) && seatNames.every((n) => typeof n === "string")))
    return { status: 422, body: { error: "seatNames must be an array of strings" } };
  let callback;
  if (b.callback !== void 0) {
    const cb = b.callback;
    if (!cb || typeof cb.url !== "string" || typeof cb.token !== "string")
      return { status: 422, body: { error: "callback must be { url, token }" } };
    callback = { url: cb.url, token: cb.token };
  }
  let host;
  if (b.host !== void 0) {
    const h = b.host;
    const nameOk = h?.displayName === void 0 || typeof h.displayName === "string";
    if (!h || typeof h.seatToken !== "string" || h.seatToken.length === 0 || !nameOk)
      return { status: 422, body: { error: "host must be { seatToken, displayName? }" } };
    host = { seatToken: h.seatToken, ...typeof h.displayName === "string" ? { displayName: h.displayName } : {} };
  }
  return allocate(deps, {
    ...c,
    launched: true,
    ...seatNames ? { seatNames } : {},
    ...callback ? { callback } : {},
    ...host ? { host } : {}
  });
}
async function handleOpenMatch(body, deps) {
  const b = body ?? {};
  const c = counts(b);
  if ("status" in c) return c;
  const knobs = typeof b.knobs === "object" && b.knobs !== null ? b.knobs : void 0;
  return allocate(deps, { ...c, launched: false, ...knobs ? { knobs } : {} });
}

// src/worker/index.ts
var CODE_ROUTE = /^\/matches\/([A-Z0-9]{1,12})(\/ws)?$/;
function cors(env, res) {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", env.CLIENT_ORIGIN);
  h.set("access-control-allow-headers", "authorization, content-type");
  h.set("access-control-allow-methods", "GET, POST, OPTIONS");
  h.set("vary", "origin");
  return new Response(res.body, { status: res.status, headers: h });
}
var json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
async function matchFetch(request, env, options = {}) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return cors(env, new Response(null, { status: 204 }));
  if (url.pathname === "/healthz") return cors(env, json({ ok: true, version: env.APP_VERSION }));
  const creating = request.method === "POST" && (url.pathname === "/matches" || url.pathname === "/matches/open");
  if (creating) {
    let body = null;
    try {
      body = await request.json();
    } catch {
      return cors(env, json({ error: "body must be JSON" }, 422));
    }
    const testing = env.TEST_KNOBS === "1";
    const deps = {
      createRoom: async (code, opts) => {
        if (options.botsRequireTestKnobs && opts.bots > 0 && !testing) return { status: "invalid", message: "this game has no bots" };
        return env.MATCH.getByName(code).create({ ...opts, clientOrigin: env.CLIENT_ORIGIN });
      },
      newCode: randomCode,
      clientOrigin: env.CLIENT_ORIGIN,
      launchToken: env.LAUNCH_TOKEN,
      now: Date.now
    };
    const result = url.pathname === "/matches" ? await handleCreateMatch(request.headers.get("authorization") ?? void 0, body, deps) : await handleOpenMatch(body, deps);
    return cors(env, json(result.body, result.status));
  }
  const m = url.pathname.match(CODE_ROUTE);
  if (m && request.method === "GET") {
    const stub = env.MATCH.getByName(m[1]);
    if (m[2]) {
      if (await stub.lobby() === null) return cors(env, new Response("no such match", { status: 404 }));
      return stub.fetch(request);
    }
    const lobby = await stub.lobby();
    return cors(env, lobby ? json(lobby) : new Response("no such match", { status: 404 }));
  }
  return cors(env, new Response("not found", { status: 404 }));
}
export {
  LAUNCH_EXPIRE_MS,
  handleCreateMatch,
  handleOpenMatch,
  matchFetch
};
//# sourceMappingURL=index.js.map