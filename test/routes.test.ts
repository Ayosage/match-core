import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const post = (body: unknown, auth = 'Bearer test-token') =>
  SELF.fetch('https://x/matches', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('routes', () => {
  it('healthz answers ok with a version and no caching', async () => {
    const res = await SELF.fetch('https://x/healthz')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toMatchObject({ ok: true, version: expect.any(String) })
  })

  it('POST /matches creates a joinable room with the Steward contract shape', async () => {
    const res = await post({ players: 2, bots: 1, callback: { url: 'https://s/webhooks/results', token: 'cb' } })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { code: string; joinUrl: string; expiresAt: string }
    expect(body.code).toMatch(/^[A-Z]{4}$/)
    expect(body.joinUrl).toBe(`http://localhost:5173/?join=${body.code}`)
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
    const lobby = await SELF.fetch(`https://x/matches/${body.code}`)
    expect(lobby.status).toBe(200)
    expect(await lobby.json()).toMatchObject({ phase: 'waiting', targetPlayers: 2, botCount: 1 })
  })

  it('401 without the token, 422 on a bad count or a bad body', async () => {
    expect((await post({ players: 2 }, 'Bearer wrong')).status).toBe(401)
    expect((await post({ players: 11 })).status).toBe(422)
    const raw = await SELF.fetch('https://x/matches', {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(raw.status).toBe(422)
  })

  it('unknown code is a 404 lobby and a 404 socket', async () => {
    expect((await SELF.fetch('https://x/matches/ZZZZ')).status).toBe(404)
    expect((await SELF.fetch('https://x/matches/ZZZZ/ws', { headers: { Upgrade: 'websocket' } })).status).toBe(404)
  })

  it('CORS is pinned to CLIENT_ORIGIN and preflight answers 204', async () => {
    const res = await SELF.fetch('https://x/healthz', { headers: { Origin: 'https://evil.example' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    const pre = await SELF.fetch('https://x/matches', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/authorization/)
  })

  it('POST /matches/open creates an ad-hoc room without a token, not launched, knobs honoured under TEST_KNOBS', async () => {
    const res = await SELF.fetch('https://x/matches/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ players: 2, bots: 1, knobs: { seed: 11, roundMs: 5000 } }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { code: string; joinUrl: string }
    expect(body.code).toMatch(/^[A-Z]{4}$/)
    expect(body.joinUrl).toBe(`http://localhost:5173/?join=${body.code}`)
    const stub = env.MATCH.getByName(body.code)
    expect(await stub.lobby()).toMatchObject({ phase: 'waiting', targetPlayers: 2, botCount: 1 })
    expect((await stub.deadlinesForTest())!.expiry).toBeNull()
    expect((await SELF.fetch('https://x/matches/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ players: 1 }) })).status).toBe(422)
  })

  it('a game whose bots are test-only refuses bots without the knob', async () => {
    const { matchFetch } = await import('../src/worker/index')
    const res = await matchFetch(
      new Request('https://x/matches/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ players: 2, bots: 1 }) }),
      { ...env, TEST_KNOBS: undefined },
      { botsRequireTestKnobs: true },
    )
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'this game has no bots' })
  })

  it('anything else is a 404', async () => {
    expect((await SELF.fetch('https://x/nope')).status).toBe(404)
    expect((await SELF.fetch('https://x/matches', { method: 'GET' })).status).toBe(404)
  })
})
