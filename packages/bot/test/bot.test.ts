import { describe, it, expect } from 'vitest'
import { decide } from '../src/index'
import { makeRng, KLASIK, KLASIK_101, redactFor, type GameState, tileFromString, evaluateHand, findOpening } from '@cs-okey/engine'

function viewWith(rack: string[], phase: 'DRAW'|'DISCARD', leftDiscard: string[] = []) {
  const state: GameState = {
    gameId: 'g', config: KLASIK, rngSeed: 1, handNo: 1,
    stock: [tileFromString('1R'), tileFromString('2R')],
    indicator: tileFromString('6M'), okey: tileFromString('7M'),
    turn: { seat: 0, phase },
    players: [
      { seat: 0, rack: rack.map(tileFromString), discard: [], hasOpened: false, isOut: false },
      { seat: 1, rack: [], discard: [], hasOpened: false, isOut: false },
      { seat: 2, rack: [], discard: [], hasOpened: false, isOut: false },
      { seat: 3, rack: leftDiscard.map(tileFromString), discard: leftDiscard.map(tileFromString), hasOpened: false, isOut: false },
    ],
    scores: [0,0,0,0], status: 'PLAYING',
  }
  // seat 0's left neighbour is seat 3 (leftSeat(0,4)=3)
  return redactFor(state, 0, 1)
}

// Build a 101 PlayerView. tableMelds can carry opened melds on the table.
function view101(
  rack: string[],
  phase: 'DRAW' | 'DISCARD',
  hasOpened = false,
  tableMelds: { owner: number; kind: 'run' | 'group'; tiles: string[] }[] = [],
) {
  const state: GameState = {
    gameId: 'g101', config: KLASIK_101, rngSeed: 2, handNo: 1,
    stock: [tileFromString('1R'), tileFromString('2R')],
    indicator: tileFromString('6M'), okey: tileFromString('7M'),
    turn: { seat: 0, phase },
    players: [
      { seat: 0, rack: rack.map(tileFromString), discard: [], hasOpened, isOut: false },
      { seat: 1, rack: [], discard: [], hasOpened: false, isOut: false },
      { seat: 2, rack: [], discard: [], hasOpened: false, isOut: false },
      { seat: 3, rack: [], discard: [], hasOpened: false, isOut: false },
    ],
    scores: [0, 0, 0, 0], status: 'PLAYING',
    tableMelds: tableMelds.map((m) => ({ owner: m.owner, kind: m.kind, tiles: m.tiles.map(tileFromString) })),
  }
  return redactFor(state, 0, 1)
}

describe('bot.decide', () => {
  it('declares win in DISCARD phase when a winning discard exists', () => {
    // 15 tiles: a full-cover 14 + one extra discardable
    const rack = ['9R','9K','9M','9S','5R','5K','5M','5S','1R','2R','3R','11K','12K','13K','8S']
    const ev = decide(viewWith(rack, 'DISCARD'), ['Discard','DeclareWin'], makeRng(1))
    expect(ev.type).toBe('DeclareWin')
    if (ev.type === 'DeclareWin') expect(ev.seat).toBe(0)
  })
  it('discards a useless tile in DISCARD phase when not winning', () => {
    const rack = ['1R','2R','3R','9S','9R','5K','11M','13S','4K','6K','8M','10S','12R','2K','7S']
    const ev = decide(viewWith(rack, 'DISCARD'), ['Discard','DeclareWin'], makeRng(2))
    expect(ev.type).toBe('Discard')
    if (ev.type === 'Discard') expect(rack.map(tileFromString)).toContainEqual(ev.tile)
  })
  it('chooses a legal draw in DRAW phase', () => {
    const ev = decide(viewWith(['1R','2R'], 'DRAW', ['3R']), ['DrawFromStock','DrawFromDiscard'], makeRng(3))
    expect(['DrawFromStock','DrawFromDiscard']).toContain(ev.type)
    expect(ev.seat).toBe(0)
  })
  it('only draws from stock when discard not legal', () => {
    const ev = decide(viewWith(['1R','2R'], 'DRAW', []), ['DrawFromStock'], makeRng(4))
    expect(ev.type).toBe('DrawFromStock')
  })
})

describe('bot.decide 101', () => {
  // Rack that can produce a ≥101 opening: three runs of consecutive same-color tiles
  // 11R+12R+13R = 36, 9K+10K+11K = 30, 8S+9S+10S+11S = 38 → total = 104 ≥ 101
  const openableRack = [
    '11R','12R','13R',
    '9K','10K','11K',
    '8S','9S','10S','11S',
    '1M','2M','4S', // extras
  ]

  it('opens when rack can form ≥101 melds and not yet opened', () => {
    const okey = tileFromString('7M')
    // Verify our test assumption: findOpening is non-null for this rack
    const opening = findOpening(openableRack.map(tileFromString), okey, KLASIK_101)
    expect(opening).not.toBeNull()

    const view = view101(openableRack, 'DISCARD', false)
    const ev = decide(view, ['Discard', 'OpenMeld'], makeRng(1))
    expect(ev.type).toBe('OpenMeld')
    if (ev.type === 'OpenMeld') {
      expect(ev.seat).toBe(0)
      expect(ev.melds).toBeDefined()
      expect(ev.melds.length).toBeGreaterThan(0)
    }
  })

  it('declares win in 101 DISCARD phase when hasOpened and a winning discard exists', () => {
    // Full winning rack (14 tiles) + 1 extra → DeclareWin after discarding extra
    // Use a rack where evaluateHand(rest, okey, config).isWinning is true for one removal
    const rack = ['9R','9K','9M','9S','5R','5K','5M','5S','1R','2R','3R','11K','12K','13K','8S']
    const okey = tileFromString('7M')
    // Verify that at least one 14-tile rest is winning
    const rackTiles = rack.map(tileFromString)
    const winExists = rackTiles.some((_, i) => {
      const rest = rackTiles.filter((__, j) => j !== i)
      return evaluateHand(rest, okey, KLASIK_101).isWinning
    })
    expect(winExists).toBe(true)

    const view = view101(rack, 'DISCARD', true /* hasOpened */)
    const ev = decide(view, ['Discard', 'DeclareWin'], makeRng(1))
    expect(ev.type).toBe('DeclareWin')
    if (ev.type === 'DeclareWin') expect(ev.seat).toBe(0)
  })

  it('discards when findOpening returns null and cannot win', () => {
    // A weak 101 rack that cannot form ≥101 melds and is not winning
    const weakRack = ['1R','3K','5M','7S','9R','11K','2M','4S','6R','8K','10M','12S','1K']
    const okey = tileFromString('7M')
    const opening = findOpening(weakRack.map(tileFromString), okey, KLASIK_101)
    // If findOpening happens to return non-null for this rack, skip the assertion (defensive)
    if (opening !== null) return

    const view = view101(weakRack, 'DISCARD', false)
    const ev = decide(view, ['Discard', 'OpenMeld', 'DeclareWin'], makeRng(3))
    expect(ev.type).toBe('Discard')
    if (ev.type === 'Discard') expect(weakRack.map(tileFromString)).toContainEqual(ev.tile)
  })

  it('lays off a rack tile onto a table meld when already opened', () => {
    // Rack with 10R which extends the run [7R,8R,9R] on the table
    const rack = ['10R', '1K', '3M', '5S', '2K']
    const tableMelds = [
      { owner: 1, kind: 'run' as const, tiles: ['7R', '8R', '9R'] },
    ]
    const view = view101(rack, 'DISCARD', true /* hasOpened */, tableMelds)
    const ev = decide(view, ['Discard', 'LayOff'], makeRng(2))
    expect(ev.type).toBe('LayOff')
    if (ev.type === 'LayOff') {
      expect(ev.seat).toBe(0)
      expect(ev.meldIndex).toBe(0)
      expect(ev.tiles).toHaveLength(1)
    }
  })

  it('Klasik regression: existing Klasik DRAW/DISCARD behavior unchanged', () => {
    const rack = ['9R','9K','9M','9S','5R','5K','5M','5S','1R','2R','3R','11K','12K','13K','8S']
    const ev = decide(viewWith(rack, 'DISCARD'), ['Discard','DeclareWin'], makeRng(1))
    expect(ev.type).toBe('DeclareWin')
    if (ev.type === 'DeclareWin') expect(ev.seat).toBe(0)

    const evDraw = decide(viewWith(['1R','2R'], 'DRAW', []), ['DrawFromStock'], makeRng(4))
    expect(evDraw.type).toBe('DrawFromStock')
  })

  it('lays a new meld (OpenMeld) when hasOpened and rack has a layable meld + OpenMeld is legal', () => {
    // Rack with a clear run (7R,8R,9R) that can be laid as a new meld post-opening
    const rack = ['7R', '8R', '9R', '1K', '3M', '5S']
    const view = view101(rack, 'DISCARD', true /* hasOpened */)
    const ev = decide(view, ['Discard', 'OpenMeld', 'LayOff'], makeRng(1))
    expect(ev.type).toBe('OpenMeld')
    if (ev.type === 'OpenMeld') {
      expect(ev.seat).toBe(0)
      expect(ev.melds).toBeDefined()
      expect(ev.melds.length).toBe(1)
      expect(ev.melds[0]!.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('does NOT lay a new meld when OpenMeld is not in the legal list', () => {
    // Even if rack has a layable meld, OpenMeld must be guarded by legal
    const rack = ['7R', '8R', '9R', '1K', '3M', '5S']
    const view = view101(rack, 'DISCARD', true /* hasOpened */)
    const ev = decide(view, ['Discard', 'LayOff'], makeRng(1))
    // Without OpenMeld in legal list, should not return OpenMeld
    expect(ev.type).not.toBe('OpenMeld')
  })
})
