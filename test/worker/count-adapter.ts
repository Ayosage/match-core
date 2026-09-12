import { z } from 'zod'
import type { GameAdapter, Placement } from '../../src/adapter'

export interface CountState {
  counts: number[]
  lastTapAt: number | null
  deadlineAt: number
  winner: number | null
}
export type CountIntent = { type: 'tap' }
export type CountView = { counts: number[]; you: number; deadlineAt: number; winner: number | null; lastTapAt: number | null }
export type CountEvent = { kind: 'tap'; seat: number } | { kind: 'timeUp' }

function decide(state: CountState): number {
  let best = 0
  for (let i = 1; i < state.counts.length; i++) if (state.counts[i]! > state.counts[best]!) best = i
  return best
}

/** The test game: first to three taps wins; at the deadline the highest count wins (lowest seat on ties). */
export const countAdapter: GameAdapter<CountState, CountIntent, CountView, CountEvent> = {
  slug: 'count',
  players: { min: 2, max: 4 },
  intentSchema: z.object({ type: z.literal('tap') }).strict(),
  create(opts) {
    const roundMs = typeof opts.roundMs === 'number' ? opts.roundMs : 50
    return { counts: Array.from({ length: opts.playerCount }, () => 0), lastTapAt: null, deadlineAt: opts.now + roundMs, winner: null }
  },
  apply(state, intent, _rng, now) {
    if (state.winner !== null) return { code: 'ENDED', message: 'the game is over' }
    const counts = [...state.counts]
    counts[intent.player] = (counts[intent.player] ?? 0) + 1
    const winner = counts[intent.player] === 3 ? intent.player : null
    return { ...state, counts, lastTapAt: now, winner }
  },
  view: (state, seat) => ({ counts: state.counts, you: seat, deadlineAt: state.deadlineAt, winner: state.winner, lastTapAt: state.lastTapAt }),
  events: (_before, intent) => [{ kind: 'tap', seat: intent.player }],
  redactEvent: (e) => e,
  drive(state, seat) {
    if (state.winner !== null) return { intent: null, memory: undefined }
    return { intent: { type: 'tap', player: seat }, memory: undefined }
  },
  driveDelayMs: () => 5,
  offerWindow: () => ({ open: false, everyoneAnswered: false }),
  offerWindowMs: 0,
  isEnded: (state) => state.winner !== null,
  winner: (state) => state.winner,
  result(state): Placement[] {
    const order = state.counts.map((c, seat) => ({ c, seat })).sort((a, b) => b.c - a.c || a.seat - b.seat)
    return order.map(({ seat, c }, i) => ({ seat, placement: i + 1, winner: state.winner === seat, stats: { taps: c } }))
  },
  turnNumber: (state) => state.counts.reduce((a, b) => a + b, 0),
  currentSeat: () => 0,
  deadline: (state) => (state.winner === null ? state.deadlineAt : null),
  expire(state) {
    if (state.winner !== null) return { state, events: [] }
    return { state: { ...state, winner: decide(state) }, events: [{ kind: 'timeUp' }] }
  },
}
