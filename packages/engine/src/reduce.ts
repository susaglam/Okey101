import type { GameEvent } from './events'
import type { GameState, PlayerState, TurnState } from './state'
import { nextSeat, leftSeat } from './state'
import type { Tile } from './tile'
import { tilesEqual } from './tile'
import { buildDeck } from './deck'
import { makeRng, shuffle, deriveSeed } from './rng'
import { evaluateHand } from './evaluator'
import { canOpen, openingValue, isValidMeldSet } from './open'

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

/**
 * Remove the first occurrence of each tile in `toRemove` from `rack`.
 * Tiles are matched by value equality (tilesEqual). Throws RuleError if any tile is missing.
 */
function removeTilesFromRack(rack: Tile[], toRemove: Tile[]): Tile[] {
  const result = rack.slice()
  for (const t of toRemove) {
    const idx = result.findIndex((r) => tilesEqual(r, t))
    if (idx < 0) throw new RuleError(`Tile ${JSON.stringify(t)} not found in rack`)
    result.splice(idx, 1)
  }
  return result
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
      let rizikoActive = false

      if (indicator.kind === 'FALSE_JOKER') {
        // Riziko: indicator is a false joker — find the next numbered tile to derive okey from,
        // but do NOT pop it from stock (it remains drawable).
        // We scan stock from the top (end of array) until we find a numbered tile.
        rizikoActive = true
        let found: Tile | null = null
        for (let i = stock.length - 1; i >= 0; i--) {
          if (stock[i]!.kind === 'NUMBER') {
            found = stock[i]!
            break
          }
        }
        if (!found) throw new RuleError('No numbered tile found to derive okey for riziko hand')
        okeyTile = deriveOkey(found)
      } else {
        okeyTile = deriveOkey(indicator)
        rizikoActive = false
      }

      let players: PlayerState[]

      if (cfg.requiresOpening) {
        // 101 deal: starter gets tilesInRack+starterExtra (21+1=22), others get tilesInRack (21)
        players = state.players.map((p) => ({
          ...p,
          rack: [] as Tile[],
          discard: [] as Tile[],
          hasOpened: false,
          isOut: false,
          declaredCift: false,
          openedValue: 0,
        }))
        for (const p of players) {
          const count = p.seat === 0 ? cfg.tilesInRack + cfg.starterExtra : cfg.tilesInRack
          for (let i = 0; i < count; i++) p.rack.push(stock.pop()!)
        }
      } else {
        // Klasik deal: seat 0 gets tilesInRack+starterExtra (14+1=15), others get tilesInRack (14)
        players = state.players.map((p) => ({ ...p, rack: [] as Tile[], discard: [] as Tile[], hasOpened: false, isOut: false }))
        for (const p of players) {
          const count = p.seat === 0 ? cfg.tilesInRack + cfg.starterExtra : cfg.tilesInRack
          for (let i = 0; i < count; i++) p.rack.push(stock.pop()!)
        }
      }

      return {
        ...state,
        handNo: state.handNo + 1,
        stock,
        indicator,
        okey: okeyTile,
        players,
        status: 'PLAYING',
        turn: { seat: 0, phase: 'DISCARD' },
        terminal: undefined,
        tableMelds: [],
        rizikoActive,
        penaltiesApplied: [],
      }
    }

    case 'DrawFromStock': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DRAW')
      if (state.stock.length === 0) {
        // 101 (yuzbir-penalty) games score on exhaustion; Klasik voids and replays.
        const exhaustionReason = state.config.scoringModel === 'yuzbir-penalty' ? 'exhausted' : 'hand-void'
        return { ...state, status: 'ENDED', terminal: { reason: exhaustionReason } }
      }
      const stock = state.stock.slice()
      const drawn = stock.pop()!
      const players = replacePlayer(state.players, event.seat, (p) => ({ ...p, rack: [...p.rack, drawn] }))
      // tookFromLeft is NOT set for stock draws
      const turn: TurnState = { seat: event.seat, phase: 'DISCARD' }
      return { ...state, stock, players, turn }
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
      // Record that this player took from the left discard pile
      const turn: TurnState = { seat: event.seat, phase: 'DISCARD', tookFromLeft: true }
      // For çift-declarers: also set pendingIslekFromSeat so the penalty survives across turns
      // (non-çift players must open the same turn, so they rely on the same-turn tookFromLeft path)
      const drawingPlayer = players.find((p) => p.seat === event.seat)!
      if (drawingPlayer.declaredCift === true) {
        players = replacePlayer(players, event.seat, (p) => ({ ...p, pendingIslekFromSeat: leftIdx }))
      }
      return { ...state, players, turn }
    }

    case 'Discard': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const p = state.players.find((x) => x.seat === event.seat)!
      const idx = p.rack.findIndex((t) => tilesEqual(t, event.tile))
      if (idx < 0) throw new RuleError('Tile not in rack')
      const rack = p.rack.slice(); const [tile] = rack.splice(idx, 1)
      const players = replacePlayer(state.players, event.seat, (pp) => ({ ...pp, rack, discard: [...pp.discard, tile!] }))

      // Auto-finish check: after removing the discarded tile, see if the player has won.
      const seat = event.seat
      const cfg = state.config

      if (!cfg.requiresOpening) {
        // Klasik: check if the updated rack is a winning hand
        const result = evaluateHand(rack, state.okey!, cfg)
        if (result.isWinning) {
          const winnersPlayers = replacePlayer(players, seat, (pp) => ({ ...pp, isOut: true }))
          return {
            ...state, players: winnersPlayers, status: 'ENDED',
            terminal: { reason: 'win', winnerSeat: seat, winType: result.winKind, finishingTile: tile },
          }
        }
      } else {
        // 101: win if rack is now empty and player has already opened
        const player = players.find((x) => x.seat === seat)!
        if (rack.length === 0 && player.hasOpened) {
          const winnersPlayers = replacePlayer(players, seat, (pp) => ({ ...pp, isOut: true }))
          return {
            ...state, players: winnersPlayers, status: 'ENDED',
            terminal: { reason: 'win', winnerSeat: seat, winType: 'perOnly', finishingTile: tile },
          }
        }
      }

      // tookFromLeft resets on turn advance
      const turn: TurnState = { seat: nextSeat(event.seat, state.config.players), phase: 'DRAW' }
      return { ...state, players, turn }
    }

    case 'DeclareWin': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const p = state.players.find((x) => x.seat === event.seat)!
      // 101 rule: player must have opened before finishing.
      // Gated on requiresOpening (true for 101, false for Klasik) so Klasik is unaffected.
      if (state.config.requiresOpening && !p.hasOpened) {
        throw new RuleError('must open before finishing')
      }
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

    case 'DeclareCift': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const players = replacePlayer(state.players, event.seat, (p) => ({ ...p, declaredCift: true }))
      return { ...state, players }
    }

    case 'OpenMeld': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const player = state.players.find((p) => p.seat === event.seat)!
      const cfg = state.config
      const okey = state.okey!

      if (!player.hasOpened) {
        // First open: validate via canOpen (≥101 or 5 pairs)
        if (!canOpen(event.melds, okey, cfg)) {
          throw new RuleError('cannot open: melds do not satisfy the opening requirement')
        }
      } else {
        // Already opened — validate that every meld is still valid
        if (!isValidMeldSet(event.melds, okey, cfg)) {
          throw new RuleError('cannot open: invalid meld set')
        }
      }

      // Collect all tiles being laid
      const allLaidTiles = event.melds.flat()

      // Remove tiles from rack
      const newRack = removeTilesFromRack(player.rack, allLaidTiles)

      // Compute opening value
      const value = openingValue(event.melds, okey)

      // Build new table meld entries: detect shape for each meld
      const newTableMelds = event.melds.map((meld) => {
        // Detect shape (run or group) by inspecting non-wild tiles
        const nonWild = meld.filter((t) => t.kind !== 'FALSE_JOKER' && !tilesEqual(t, okey))
        const kind: 'run' | 'group' = nonWild.length > 0 && new Set(nonWild.map((t) => t.color)).size === 1
          ? 'run'
          : 'group'
        return { owner: event.seat, kind, tiles: meld }
      })

      const tableMelds = [...(state.tableMelds ?? []), ...newTableMelds]

      const players = replacePlayer(state.players, event.seat, (p) => ({
        ...p,
        rack: newRack,
        hasOpened: true,
        openedValue: value,
      }))

      // İşlek penalty: penalise the left neighbour if the player took from their discard pile.
      // Same-turn path (non-çift or çift opening immediately): tookFromLeft flag on the turn.
      // Deferred path (çift-declarer opening on a later turn): pendingIslekFromSeat on the player.
      let penaltiesApplied = state.penaltiesApplied ?? []
      const openingPlayer = state.players.find((p) => p.seat === event.seat)!
      const seatTopenalise: number | null =
        (state.turn as TurnState & { tookFromLeft?: boolean }).tookFromLeft === true
          ? leftSeat(event.seat, cfg.players)
          : openingPlayer.pendingIslekFromSeat != null
            ? openingPlayer.pendingIslekFromSeat
            : null
      if (seatTopenalise !== null) {
        const penaltyType = 'islek-floor-open'
        const alreadyApplied = penaltiesApplied.some(
          (pe) => pe.seat === seatTopenalise && pe.type === penaltyType
        )
        if (!alreadyApplied) {
          penaltiesApplied = [...penaltiesApplied, { seat: seatTopenalise, type: penaltyType }]
        }
      }
      // Clear the deferred pending flag regardless (it has been consumed or was absent)
      const playersWithPendingCleared = replacePlayer(players, event.seat, (p) => ({ ...p, pendingIslekFromSeat: undefined }))

      return { ...state, players: playersWithPendingCleared, tableMelds, penaltiesApplied }
    }

    case 'LayOff': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const player = state.players.find((p) => p.seat === event.seat)!
      if (!player.hasOpened) throw new RuleError('Player has not opened yet')

      const tableMelds = state.tableMelds ?? []
      if (event.meldIndex < 0 || event.meldIndex >= tableMelds.length) {
        throw new RuleError(`meldIndex ${event.meldIndex} out of bounds (${tableMelds.length} melds)`)
      }

      const targetMeld = tableMelds[event.meldIndex]!
      const cfg = state.config
      const okey = state.okey!

      // Enforce layoff cap: for runs, at most layOffCapPerRun tiles per turn
      const cap = cfg.layOffCapPerRun ?? 2
      if (targetMeld.kind === 'run' && event.tiles.length > cap) {
        throw new RuleError(`lay-off cap exceeded: max ${cap} tiles per run per turn, got ${event.tiles.length}`)
      }

      // Check the resulting meld is still valid
      const mergedTiles = [...targetMeld.tiles, ...event.tiles]
      if (!isValidMeldSet([mergedTiles], okey, cfg)) {
        throw new RuleError('lay-off would produce an invalid meld')
      }

      // Remove tiles from rack
      const newRack = removeTilesFromRack(player.rack, event.tiles)

      const newTableMelds = tableMelds.map((m, i) =>
        i === event.meldIndex
          ? { ...m, tiles: mergedTiles }
          : m
      )

      const players = replacePlayer(state.players, event.seat, (p) => ({ ...p, rack: newRack }))

      return { ...state, players, tableMelds: newTableMelds }
    }
  }
}
