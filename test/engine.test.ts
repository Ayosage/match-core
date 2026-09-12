import { env, runDurableObjectAlarm } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createRoom, openHost, Seat } from './ws'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('engine with the count game', () => {
  it('creates, seats a host, starts, and applies an intent stamped with the clock', async () => {
    await createRoom('CNT1', 2, 1, { roundMs: 10_000 })
    const me = await openHost('CNT1')
    const first = await me.next('snapshot')
    expect((first.view as { counts: number[] }).counts).toEqual([0, 0])
    const before = Date.now()
    me.send({ t: 'intent', intent: { type: 'tap' } })
    const next = await me.next('snapshot')
    const view = next.view as { counts: number[]; lastTapAt: number }
    expect(view.counts[0]).toBe(1)
    expect(view.lastTapAt).toBeGreaterThanOrEqual(before)
  })

  it('the game deadline is a stored timer, fires through expire, and ends the match', async () => {
    await createRoom('CNT2', 2, 0, { roundMs: 30 })
    const stub = env.MATCH.getByName('CNT2')
    const a = await Seat.open('CNT2')
    await a.next('welcome')
    const b = await Seat.open('CNT2')
    await b.next('welcome')
    a.send({ t: 'start' })
    await a.next('snapshot')
    expect((await stub.deadlinesForTest())!.game).not.toBeNull()
    a.send({ t: 'intent', intent: { type: 'tap' } })
    await a.next('snapshot')
    await wait(40)
    await runDurableObjectAlarm(stub)
    const ended = await a.next('ended')
    expect(ended).toMatchObject({ reason: 'win', winner: 0 })
    const snap = a.latestSnapshot()
    expect(snap?.events?.some((e) => (e as { kind: string }).kind === 'timeUp')).toBe(true)
    expect((await stub.deadlinesForTest())!.game).toBeNull()
  })

  it('a win by intent clears the game timer', async () => {
    await createRoom('CNT3', 2, 1, { roundMs: 10_000 })
    const stub = env.MATCH.getByName('CNT3')
    const me = await openHost('CNT3')
    await me.next('snapshot')
    for (let i = 0; i < 3; i++) {
      me.send({ t: 'intent', intent: { type: 'tap' } })
      await me.next('snapshot')
    }
    await me.next('ended')
    expect((await stub.deadlinesForTest())!.game).toBeNull()
  })
})
