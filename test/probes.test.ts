import { env, runInDurableObject, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

/**
 * A lookup names a Durable Object before anyone knows the room exists, so a
 * caller walking the four-letter code space decides how much storage the
 * account carries. Reading a room nobody created has to leave no tables
 * behind: the object is instantiated either way, but an object that never
 * wrote is free and an object holding a schema is not.
 *
 * `listDurableObjectIds` answers "was it instantiated", which a lookup always
 * does, so these assertions read the object's own SQLite catalogue instead.
 */
const tables = (code: string): Promise<string[]> =>
  runInDurableObject(env.MATCH.getByName(code), (_instance, state) =>
    state.storage.sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .toArray()
      .map((r) => r.name)
      .filter((n) => !n.startsWith('_cf')),
  )

describe('probes of codes that were never created', () => {
  it('leave no schema behind', async () => {
    expect((await SELF.fetch('https://x/matches/QQQQ')).status).toBe(404)
    expect((await SELF.fetch('https://x/matches/QQQR/ws', { headers: { Upgrade: 'websocket' } })).status).toBe(404)

    expect(await tables('QQQQ')).toEqual([])
    expect(await tables('QQQR')).toEqual([])
  })

  it('do not stop a room that was created from keeping its own', async () => {
    const res = await SELF.fetch('https://x/matches/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ players: 2, bots: 1 }),
    })
    const { code } = (await res.json()) as { code: string }

    expect((await SELF.fetch('https://x/matches/ZZZZ')).status).toBe(404)

    const lobby = await SELF.fetch(`https://x/matches/${code}`)
    expect(lobby.status).toBe(200)
    expect(await lobby.json()).toMatchObject({ phase: 'waiting', targetPlayers: 2 })

    expect(await tables(code)).toEqual(['memory', 'meta', 'seats', 'state', 'timers'])
    expect(await tables('ZZZZ')).toEqual([])
  })
})
