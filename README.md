# match-core

One Cloudflare Durable Object per match. The object owns the seats and their
reconnect tokens, holds the players' WebSockets while they hibernate, runs an
intent loop over SQLite, drives bots and absent seats from a single alarm,
and posts a result webhook when the match ends. A game plugs in through a
`GameAdapter` (create, apply, view, events, drive, deadline, result).

Used by Meridian (Catan) and Wordy Champions.

## Install

```json
"@ayosage/match-core": "github:Ayosage/match-core#v0.1.1"
```

pnpm builds it on install (`prepare` runs tsup); add `@ayosage/match-core` to
the consumer's `pnpm.onlyBuiltDependencies`. Peer: `@cloudflare/workers-types`.

## Entry points

- `@ayosage/match-core`: `createMatchObject(adapter)`, the adapter contract, the transport envelope.
- `@ayosage/match-core/envelope`: the transport schemas alone, safe to import outside the Workers runtime (clients, node tests).
- `@ayosage/match-core/worker`: `matchFetch(request, env)`: healthz, `POST /matches` (bearer), `POST /matches/open`, `GET /matches/:code`, the socket route, CORS pinned to `CLIENT_ORIGIN`.
- `@ayosage/match-core/client`: `MatchSocket`, `wsUrl`, `httpOrigin` for browsers.

## Develop

Node 22, pnpm 10. `pnpm test` runs the suite inside the Workers runtime against a built-in test game.
