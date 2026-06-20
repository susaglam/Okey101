import type { GameEvent } from './events'
import type { GameState, PlayerState, TurnState } from './state'
import { nextSeat, leftSeat } from './state'
import type { Tile } from './tile'
import { tilesEqual } from './tile'
import { buildDeck } from './deck'
import { makeRng, shuffle, deriveSeed } from './rng'
import { evaluateHand } from './evaluator'
import { canOpen, openingValue, isValidMeldSet, isValidPairSet } from './open'

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
      // Flip the indicator off the top of the stock (it is never drawable).
      // PO rule: a FALSE JOKER may NEVER be the indicator. If the flipped tile is a
      // false joker, return it to the BOTTOM of the stock (still drawable as an okey
      // substitute) and flip again until a NUMBER tile turns up.
      let indicator = stock.pop()!
      while (indicator.kind !== 'NUMBER' && stock.length > 0) {
        stock.unshift(indicator)
        indicator = stock.pop()!
      }
      const okeyTile = deriveOkey(indicator)
      // Riziko was only ever triggered by a false-joker indicator, which can no
      // longer occur — so a hand is never riziko.
      const rizikoActive = false

      // Starting player rotates clockwise each hand. handNo here is the PRE-increment
      // value (0 for the first hand, 1 for the second, …), so the starter is seat 0,
      // then 1, 2, 3, 0 … across hands. The starter is dealt the extra tile and opens
      // the hand in the DISCARD phase.
      const starter = state.handNo % cfg.players

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
          openRoute: undefined,
        }))
        for (const p of players) {
          const count = p.seat === starter ? cfg.tilesInRack + cfg.starterExtra : cfg.tilesInRack
          for (let i = 0; i < count; i++) p.rack.push(stock.pop()!)
        }
      } else {
        // Klasik deal: starter gets tilesInRack+starterExtra (14+1=15), others get tilesInRack (14)
        players = state.players.map((p) => ({ ...p, rack: [] as Tile[], discard: [] as Tile[], hasOpened: false, isOut: false }))
        for (const p of players) {
          const count = p.seat === starter ? cfg.tilesInRack + cfg.starterExtra : cfg.tilesInRack
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
        turn: { seat: starter, phase: 'DISCARD' },
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
      // Record that this player took from the left discard pile (and which tile,
      // so a non-çift taker who can't open may return it). Taking the floor carries
      // NO penalty for anyone (Kural 11 Q1/Q3: "işlek cezası yok") — the only
      // consequence is the must-open-or-return restriction enforced in Discard.
      const turn: TurnState = { seat: event.seat, phase: 'DISCARD', tookFromLeft: true, floorTileTaken: taken }
      return { ...state, players, turn }
    }

    case 'Discard': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const p = state.players.find((x) => x.seat === event.seat)!
      // Kural 11 (Q1): a non-çift player who took the floor this turn must open
      // this turn — they cannot just discard. They must open, or return the tile.
      if (state.config.requiresOpening) {
        const tookFromLeft = (state.turn as TurnState).tookFromLeft === true
        if (tookFromLeft && !p.declaredCift && !p.hasOpened) {
          throw new RuleError('floor-take: you must open this turn or return the tile before discarding')
        }
      }
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
          // Derive the finish type from the player's opening route so a çift-route
          // finisher gets the ×2 cift multiplier (scoreHand101 keys it on winType==='pairs').
          // (Empty rack can't be re-evaluated, so the route is the source of truth.)
          const winType = player.openRoute === 'cift' ? 'pairs' : 'perOnly'
          return {
            ...state, players: winnersPlayers, status: 'ENDED',
            terminal: { reason: 'win', winnerSeat: seat, winType, finishingTile: tile },
          }
        }
      }

      // 101 penalty: discarding the REAL okey costs the discarder a flat +101
      // (once per hand). Only applies when not finishing (a winning okey-discard
      // returns above and earns the okey-finish bonus instead).
      let penaltiesApplied = state.penaltiesApplied ?? []
      if (cfg.requiresOpening && tile && tile.kind === 'NUMBER' && state.okey && tilesEqual(tile, state.okey)) {
        const already = penaltiesApplied.some((x) => x.seat === seat && x.type === 'okey-discard')
        if (!already) penaltiesApplied = [...penaltiesApplied, { seat, type: 'okey-discard' }]
      }

      // tookFromLeft resets on turn advance
      const turn: TurnState = { seat: nextSeat(event.seat, state.config.players), phase: 'DRAW' }
      return { ...state, players, turn, penaltiesApplied }
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

      // Determine if this is a çift-route open: all melds are valid pairs and
      // the count matches the configured pairs-open count.
      const pairsCount = cfg.pairsOpenCount ?? 5
      const isCiftOpen = event.melds.length === pairsCount && event.melds.every((m) => {
        if (m.length !== 2) return false
        const [a, b] = m
        if (!a || !b) return false
        // Neither tile should be wild
        if (a.kind === 'NUMBER' && tilesEqual(a, okey)) return false
        if (b.kind === 'NUMBER' && tilesEqual(b, okey)) return false
        // Effective values must match
        const evA = a.kind === 'FALSE_JOKER'
          ? (okey.number != null && okey.color != null ? { number: okey.number, color: okey.color } : null)
          : (a.number != null && a.color != null ? { number: a.number, color: a.color } : null)
        const evB = b.kind === 'FALSE_JOKER'
          ? (okey.number != null && okey.color != null ? { number: okey.number, color: okey.color } : null)
          : (b.number != null && b.color != null ? { number: b.number, color: b.color } : null)
        return evA !== null && evB !== null && evA.number === evB.number && evA.color === evB.color
      })

      if (!player.hasOpened) {
        // First open: validate via canOpen (≥101 or 5 pairs)
        if (!canOpen(event.melds, okey, cfg)) {
          throw new RuleError('cannot open: melds do not satisfy the opening requirement')
        }
      } else {
        // Already opened — what is being laid down?
        const layingPairs = isValidPairSet(event.melds, okey)        // all melds are pairs
        const layingMelds = isValidMeldSet(event.melds, okey, cfg)   // all melds are runs/groups
        // A çift route exists on the table once anyone has laid a pair.
        const tableHasPair = (state.tableMelds ?? []).some((m) => m.kind === 'pair') || player.openRoute === 'cift'

        if (layingPairs) {
          // Laying new pairs is allowed for ANY opened player — but only once a
          // çift route is open on the table (someone opened/laid pairs).
          if (!tableHasPair) {
            throw new RuleError('cannot lay pairs: no çift route open on the table yet')
          }
        } else if (layingMelds) {
          // Laying new runs/groups (per) is only allowed for seri-route players.
          // A çift-route player may not open new runs/groups (they lay off / take okey instead).
          if (player.openRoute === 'cift') {
            throw new RuleError('cannot open: çift-route player may not lay new runs/groups')
          }
        } else {
          throw new RuleError('cannot open: invalid meld set')
        }
      }

      // Collect all tiles being laid
      const allLaidTiles = event.melds.flat()

      // Remove tiles from rack
      const newRack = removeTilesFromRack(player.rack, allLaidTiles)

      // Finish-protection: you can never meld away your entire rack — a tile must
      // remain to discard as the finishing move (same rule as lay-off).
      if (state.config.mustRetainFinishingTile && newRack.length === 0) {
        throw new RuleError('must keep at least one tile to discard (cannot meld your whole rack)')
      }

      // Compute opening value (pairs route: value is 0 — no threshold)
      const value = openingValue(event.melds, okey)

      // Determine the route for this open (only relevant on first open, but derived from meld shape)
      const openedRoute: 'seri' | 'cift' = !player.hasOpened
        ? (isCiftOpen ? 'cift' : 'seri')
        : (player.openRoute ?? 'seri')

      // Build new table meld entries
      // For çift-route melds: kind = 'pair'
      // For seri-route melds: detect run vs group
      const newTableMelds = event.melds.map((meld) => {
        if (openedRoute === 'cift') {
          return { owner: event.seat, kind: 'pair' as const, tiles: meld }
        }
        // Use effective values for non-wild tiles to determine meld shape.
        // FALSE_JOKER contributes okey's number+color as its concrete value.
        const nonWildEffective = meld
          .filter((t) => !(t.kind === 'NUMBER' && tilesEqual(t, okey)))
          .map((t) => t.kind === 'FALSE_JOKER'
            ? { color: okey.color, number: okey.number }
            : { color: t.color, number: t.number })
          .filter((v): v is { color: NonNullable<typeof okey.color>; number: number } =>
            v.color != null && v.number != null)
        const kind: 'run' | 'group' = nonWildEffective.length > 0 && new Set(nonWildEffective.map((v) => v.color)).size === 1
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
        openRoute: openedRoute,
      }))

      // Taking a tile from the floor carries NO penalty (Kural 11 Q1/Q3:
      // "işlek cezası yok"). Opening simply lays the melds; the only floor-take
      // consequence is the must-open-or-return restriction enforced in Discard.
      return { ...state, players, tableMelds }
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

      // Finish-protection: a player must always keep at least one tile to discard
      // as the finishing move. Laying off the entire rack would leave nothing to
      // discard, so the player could never end the hand. Reject it.
      if (cfg.mustRetainFinishingTile && newRack.length === 0) {
        throw new RuleError('must keep at least one tile to discard (cannot lay off your whole rack)')
      }

      const newTableMelds = tableMelds.map((m, i) =>
        i === event.meldIndex
          ? { ...m, tiles: mergedTiles }
          : m
      )

      const players = replacePlayer(state.players, event.seat, (p) => ({ ...p, rack: newRack }))

      return { ...state, players, tableMelds: newTableMelds }
    }

    case 'TakeOkey': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const player = state.players.find((p) => p.seat === event.seat)!
      // Board manipulation requires having opened (same gate as lay-off / işleme).
      if (!player.hasOpened) throw new RuleError('Player has not opened yet')

      const tableMelds = state.tableMelds ?? []
      if (event.meldIndex < 0 || event.meldIndex >= tableMelds.length) {
        throw new RuleError(`meldIndex ${event.meldIndex} out of bounds (${tableMelds.length} melds)`)
      }
      const okey = state.okey!
      const cfg = state.config
      const targetMeld = tableMelds[event.meldIndex]!

      // The real tile the player wants to insert must be in their rack.
      if (!player.rack.some((t) => tilesEqual(t, event.tile))) {
        throw new RuleError('tile to insert is not in the rack')
      }

      // Only the REAL okey tile (a NUMBER tile equal to okey) can be taken — a
      // false joker is a fixed plain tile, not a wild, so it cannot be reused.
      const isRealOkey = (t: Tile) => t.kind === 'NUMBER' && tilesEqual(t, okey)

      // Find an okey in the meld whose slot the inserted tile can fill (the
      // resulting meld must still be valid). The okey then returns to the rack.
      let okeyPos = -1
      let candidate: Tile[] | null = null
      for (let i = 0; i < targetMeld.tiles.length; i++) {
        if (!isRealOkey(targetMeld.tiles[i]!)) continue
        const test = targetMeld.tiles.map((t, j) => (j === i ? event.tile : t))
        if (isValidMeldSet([test], okey, cfg)) {
          okeyPos = i
          candidate = test
          break
        }
      }
      if (okeyPos === -1 || candidate === null) {
        throw new RuleError('no okey in this meld can be replaced by the given tile')
      }

      const takenOkey = targetMeld.tiles[okeyPos]!

      const newTableMelds = tableMelds.map((m, i) =>
        i === event.meldIndex ? { ...m, tiles: candidate! } : m,
      )

      // Swap: remove the inserted tile from the rack, add the freed okey back.
      // (Net rack size unchanged — the player decides later how to use the okey.)
      const afterRemove = removeTilesFromRack(player.rack, [event.tile])
      const newRack = [...afterRemove, takenOkey]
      const players = replacePlayer(state.players, event.seat, (p) => ({ ...p, rack: newRack }))

      return { ...state, players, tableMelds: newTableMelds }
    }

    case 'ReturnFloorTile': {
      if (!state) throw new RuleError('No game')
      requireTurn(state, event.seat, 'DISCARD')
      const turn0 = state.turn as TurnState
      if (turn0.tookFromLeft !== true || turn0.floorTileTaken == null) {
        throw new RuleError('no floor tile to return this turn')
      }
      const p = state.players.find((x) => x.seat === event.seat)!
      if (p.hasOpened) throw new RuleError('cannot return the floor tile after opening')

      const floorTile = turn0.floorTileTaken
      const ridx = p.rack.findIndex((t) => tilesEqual(t, floorTile))
      if (ridx < 0) throw new RuleError('floor tile not in rack')

      // Remove the floor tile from the rack and put it back on TOP of the left
      // neighbour's discard pile (where they discarded it).
      const newRack = p.rack.slice()
      newRack.splice(ridx, 1)
      const leftIdx = leftSeat(event.seat, state.config.players)
      let players = replacePlayer(state.players, leftIdx, (lp) => ({ ...lp, discard: [...lp.discard, floorTile] }))
      players = replacePlayer(players, event.seat, (pp) => ({ ...pp, rack: newRack }))

      // Undo the take entirely: return to the DRAW phase so the player may draw
      // again — re-take the same floor tile to retry, or draw from the stock.
      const turn: TurnState = { seat: event.seat, phase: 'DRAW' }
      return { ...state, players, turn }
    }
  }
}
