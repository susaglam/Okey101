import type { GameEvent } from './events'
import type { GameState, PlayerState } from './state'
import { nextSeat, leftSeat } from './state'
import type { Tile } from './tile'
import { tilesEqual } from './tile'
import { buildDeck } from './deck'
import { makeRng, shuffle, deriveSeed } from './rng'
import { evaluateHand } from './evaluator'

export class RuleError extends Error {}

export function deriveOkey(indicator: Tile): Tile {
  if (indicator.number == null || indicator.color == null) {
    // false-joker indicator → riziko handled in 101 (Faz 2). Klasik default: re-pick is out of scope here.
    throw new RuleError('Indicator is a false joker (riziko) — not supported in Klasik MVP path')
  }
  const next = (indicator.number % 13) + 1
  return { number: next, color: indicator.color, kind: 'NUMBER' }
}

function requireTurn(state: GameState, seat: number, phase: GameState['turn']['phase']): void {
  if (state.status !== 'PLAYING') throw new RuleError(`Game not in play (status=${state.status})`)
  if (state.turn.seat !== seat) throw new RuleError(`Not seat ${seat}'s turn`)
  if (state.turn.phase !== phase) throw new RuleError(`Expected ${phase} phase, got ${state.turn.phase}`)
}

function replacePlayer(players: PlayerState[], seat: number, fn: (p: PlayerState) => PlayerState): PlayerState[] {
  return players.map((p) => (p.seat === seat ? fn(p) : p))
}

export function reduce(state: GameState | null, event: GameEvent): GameState {
  switch (event.type) {
    case 'CreateGame':
      return {
        gameId: event.gameId, config: event.config, rngSeed: event.seed, handNo: 0,
        stock: [], turn: { seat: 0, phase: 'DRAW' },
        players: Array.from({ length: event.config.players }, (_, seat) => ({
          seat, rack: [], discard: [], hasOpened: false, isOut: false,
          declaredCift: false, openedValue: 0,
        })),
        scores: Array.from({ length: event.config.players }, () => 0),
        status: 'CREATED',
        tableMelds: [],
        rizikoActive: false,
        penaltiesApplied: [],
      }

    case 'StartHand': {
      if (!state) throw new RuleError('No game')
      const cfg = state.config
      const rng = makeRng(deriveSeed(state.rngSeed, 'hand:' + state.handNo)) // distinct shuffle per hand, deterministic
      const deck = shuffle(buildDeck(cfg), rng)
      const stock = deck.slice()
      const indicator = stock.pop()! // flip indicator off the stock; never drawable
      let okeyTile: Tile
      try { okeyTile = deriveOkey(indicator) } catch { /* riziko: re-pop until numbered (Klasik MVP) */
        let ind = indicator
        while (ind.number == null) ind = stock.pop()!
        okeyTile = deriveOkey(ind)
      }
      const players = state.players.map((p) => ({ ...p, rack: [] as Tile[], discard: [] as Tile[], hasOpened: false, isOut: false }))
      for (const p of players) {
        const count = p.seat === 0 ? cfg.tilesInRack + cfg.starterExtra : cfg.tilesInRack
        for (let i = 0; i < count; i++) p.rack.push(stock.pop()!)
      }
      return {
        ...state, handNo: state.handNo + 1, stock, indicator, okey: okeyTile,
        players, status: 'PLAYING', turn: { seat: 0, phase: 'DISCARD' }, terminal: undefined,
      }
    }

    case 'DrawFromStock': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DRAW')
      if (state.stock.length === 0) {
        return { ...state, status: 'ENDED', terminal: { reason: 'hand-void' } }
      }
      const stock = state.stock.slice()
      const drawn = stock.pop()!
      const players = replacePlayer(state.players, event.seat, (p) => ({ ...p, rack: [...p.rack, drawn] }))
      return { ...state, stock, players, turn: { seat: event.seat, phase: 'DISCARD' } }
    }

    case 'DrawFromDiscard': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DRAW')
      const leftIdx = leftSeat(event.seat, state.config.players)
      const left = state.players.find((p) => p.seat === leftIdx)!
      if (left.discard.length === 0) throw new RuleError('Left discard pile is empty')
      const leftDiscard = left.discard.slice()
      const taken = leftDiscard.pop()!
      let players = replacePlayer(state.players, leftIdx, (p) => ({ ...p, discard: leftDiscard }))
      players = replacePlayer(players, event.seat, (p) => ({ ...p, rack: [...p.rack, taken] }))
      return { ...state, players, turn: { seat: event.seat, phase: 'DISCARD' } }
    }

    case 'Discard': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const p = state.players.find((x) => x.seat === event.seat)!
      const idx = p.rack.findIndex((t) => tilesEqual(t, event.tile))
      if (idx < 0) throw new RuleError('Tile not in rack')
      const rack = p.rack.slice(); const [tile] = rack.splice(idx, 1)
      const players = replacePlayer(state.players, event.seat, (pp) => ({ ...pp, rack, discard: [...pp.discard, tile!] }))
      return { ...state, players, turn: { seat: nextSeat(event.seat, state.config.players), phase: 'DRAW' } }
    }

    case 'DeclareWin': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const p = state.players.find((x) => x.seat === event.seat)!
      const idx = p.rack.findIndex((t) => tilesEqual(t, event.discardTile))
      if (idx < 0) throw new RuleError('Finishing discard tile not in rack')
      const rack = p.rack.slice(); const [finishing] = rack.splice(idx, 1)
      const result = evaluateHand(rack, state.okey!, state.config)
      if (!result.isWinning) throw new RuleError('Declared win but rack is not a winning arrangement')
      const players = replacePlayer(state.players, event.seat, (pp) => ({ ...pp, rack, discard: [...pp.discard, finishing!], isOut: true }))
      return {
        ...state, players, status: 'ENDED',
        terminal: { reason: 'win', winnerSeat: event.seat, winType: result.winKind, finishingTile: finishing },
      }
    }
  }
}
