import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import { suggestDiscard, tilesEqual, tileToString, findLayableMeld, findLayablePairs, isValidMeldSet, isValidPairSet, openingValue } from '@cs-okey/engine'
import { DndContext, DragOverlay, closestCenter, pointerWithin, MeasuringStrategy } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent, CollisionDetection } from '@dnd-kit/core'

/**
 * Pointer-first collision detection.
 *
 * The rack registers ~32 slot droppables plus a full-rack droppable, all of which
 * have large/near centres. With plain `closestCenter`, a rack tile dragged up onto
 * a centre lay-off target almost always resolves to a nearer RACK slot's centre
 * instead of the (visually narrow, left-aligned) run/group row — so the lay-off
 * never registers. `pointerWithin` keys off the POINTER position, so dropping the
 * cursor anywhere over a run row (or a take-okey cell) reliably targets THAT meld.
 * Fallback to `closestCenter` only when the pointer is over no droppable (fast
 * drags / dead space) so rack reordering and draw/discard drops keep working.
 *
 * When the pointer overlaps several droppables at once, prefer the centre-table
 * targets in priority order take-okey > lay-off, so dropping a real tile onto an
 * okey in a meld swaps the okey, and dropping anywhere else on a meld lays off.
 */
const collisionStrategy: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  if (pointerHits.length === 0) return closestCenter(args)
  const takeOkey = pointerHits.find((c) => String(c.id).startsWith('take-okey:'))
  if (takeOkey) return [takeOkey]
  const layoff = pointerHits.find((c) => String(c.id).startsWith('layoff:'))
  if (layoff) return [layoff]
  // Prefer a SPECIFIC rack slot (numeric id) over the full-rack 'rack' wrapper
  // that overlaps every slot. Otherwise a tile dropped on a chosen slot resolves
  // to 'rack' (no slot) and lands in the first empty slot instead of where the
  // player aimed — breaking drag-to-draw-into-slot and precise reordering.
  const slot = pointerHits.find((c) => /^\d+$/.test(String(c.id)))
  if (slot) return [slot]
  return pointerHits
}
import type { Tile } from '@cs-okey/engine'
import type { LocalAdapter } from '../adapter/LocalAdapter'
import type { RejectionCode } from '../adapter/Adapter'
import type { MatchState } from '../match'
import { Table } from '../components/Table'
import { SlotRack } from '../components/SlotRack'
import { MyDiscardTarget } from '../components/MyDiscardTarget'
import { TileView } from '../components/Tile'
import { StockPile } from '../components/StockPile'
import { flyTile, animationsEnabled } from '../anim/fly'
import { playSfx, setSoundEnabled } from '../anim/sound'
import { Scoreboard } from '../components/Scoreboard'
import { ScoreTable } from '../components/ScoreTable'
import { CenterMelds } from '../components/CenterMelds'
import type { HandRecord } from '../match'
import { HelpContent } from './HelpContent'
import { loadSettings, saveSettings } from '../settings'
import { applyTheme } from '../theme/themes'
import type { SlotLayout } from '../rack/slots'
import { initLayout, reconcile, moveTile, autoArrange, autoArrangePairs, parseMeldSegments } from '../rack/slots'
import { interpretDragEnd } from '../utils/dragEnd'
import { captureRackFlip, runRackFlip } from '../anim/flip'
import { SEAT_NAMES, seatName } from '../names'

const COLS = 16

// Reddedilen hamleler için kullanıcı-dostu Türkçe mesajlar (toast).
const REJECT_MSG: Record<RejectionCode, string> = {
  'not-your-turn': 'Sıra sende değil',
  'wrong-phase': 'Şu an bu hamleyi yapamazsın',
  'illegal-move': 'Geçersiz hamle',
  'stale-version': 'Bir saniye, tekrar dene',
  'not-winning': 'Bu el bitiş için geçerli değil',
  'must-open-or-return': 'Yerden aldın — önce aç ya da "Taşı Geri Al"',
  'unknown': 'Hamle reddedildi',
}

export default function GameScreen({ adapter, onExitToMenu, onRestart, isResumed }: {
  adapter: LocalAdapter
  /** Return to the main menu (from the match-over screen). */
  onExitToMenu?: () => void
  /** Start a fresh match of the same variant (from the match-over screen). */
  onRestart?: () => void
  /** True when this game was RESUMED from a save (so the deal flourish is skipped
   *  on the restored mid-hand view; a fresh game still animates its first deal). */
  isResumed?: boolean
}) {
  const [view, setView] = useState<PlayerView | null>(null)
  const [layout, setLayout] = useState<SlotLayout | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [match, setMatch] = useState<MatchState>(() => adapter.getMatch())
  const [settings, setSettings] = useState(() => loadSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showScores, setShowScores] = useState(false)
  const [history, setHistory] = useState<HandRecord[]>(() => adapter.getHistory())
  const [toast, setToast] = useState<string | null>(null)
  // The tile currently being dragged — rendered in a <DragOverlay> portal so it
  // floats ABOVE the rack/table instead of being clipped by them.
  const [activeDrag, setActiveDrag] = useState<{ kind: 'rack' | 'stock' | 'floor'; tile?: Tile } | null>(null)

  // Reddetme bildirimi (toast) — engine bir hamleyi reddederse kullanıcı sebebini görür.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showReject = (reason?: RejectionCode) => {
    setToast(REJECT_MSG[reason ?? 'unknown'])
    playSfx('error')
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // Keep the sound engine in sync with the user's "Ses" setting.
  useEffect(() => { setSoundEnabled(settings.sound) }, [settings.sound])

  // GSAP Flip: ıstaka yeniden-dizilince taşları akıcı kaydır.
  // Konum durumu, layout değişmeden ÖNCE yakalanır; render sonrası oynatılır.
  const pendingFlip = useRef<{ state: unknown; duration: number } | null>(null)
  useLayoutEffect(() => {
    if (pendingFlip.current) {
      runRackFlip(pendingFlip.current.state, pendingFlip.current.duration)
      pendingFlip.current = null
    }
  })
  const withFlip = (fn: () => void, duration = 0.3) => {
    pendingFlip.current = { state: captureRackFlip(), duration }
    fn()
  }

  // When the player drags a draw onto a specific empty slot, remember it so the
  // newly-drawn tile lands there (not the first empty slot). Consumed once.
  const pendingDrawSlot = useRef<number | null>(null)

  // The hand number whose freshly-dealt rack we have already auto-arranged, so we
  // only auto-arrange ONCE per hand (and never clobber the player's manual layout).
  const autoArrangedHand = useRef<number | null>(null)

  useEffect(() =>
    adapter.subscribe(
      (v) => {
        setView(v)
        const isNewHand = v.handNo !== autoArrangedHand.current
        if (isNewHand) autoArrangedHand.current = v.handNo
        setLayout(prev => {
          // On a freshly dealt hand, auto-arrange the rack: prefer çift if there are
          // ≥4 pairs, otherwise seri (runs/groups). This is the requested opening view.
          if (isNewHand && v.okey) {
            const okey = v.okey
            const cift = autoArrangePairs(v.you.rack, okey, v.config, COLS)
            const pairCount = parseMeldSegments(cift)
              .filter((s) => s.length === 2 && isValidPairSet([s], okey)).length
            return pairCount >= 4 ? cift : autoArrange(v.you.rack, okey, v.config, COLS)
          }
          if (!prev) return initLayout(v.you.rack, COLS)
          const pref = pendingDrawSlot.current
          pendingDrawSlot.current = null
          return reconcile(prev, v.you.rack, pref)
        })
        setSelectedSlot(null)
        setMatch(adapter.getMatch())
        setHistory(adapter.getHistory())
      },
      () => {}
    ),
    [adapter]
  )

  // Animate opponent (bot) discards: when an opponent's discard pile grows between
  // two views, fly a ghost of the discarded tile from that seat to its pile. Bots
  // are paced (one view per move) so each discard animates cleanly.
  const prevViewRef = useRef<PlayerView | null>(null)
  const didMountRef = useRef(false)
  // NOTE: every DOM query in this effect MUST stay synchronous — flyTile is
  // fire-and-forget and reads no effect-local closures, so there's no stale-closure
  // risk. Moving a querySelector into an async/awaited callback would break that.
  useEffect(() => {
    const prev = prevViewRef.current
    prevViewRef.current = view
    const isFirstRun = !didMountRef.current
    didMountRef.current = true
    if (!view || !animationsEnabled()) return

    // NEW HAND → deal flourish: face-down tiles fly from the table centre to each
    // player, then play begins. (Skip discard/open detection on this view.)
    // A genuine new hand is a handNo transition; the FIRST effect run counts as a
    // fresh deal ONLY for a brand-new game — never on resume (a restored mid-hand
    // save would otherwise replay the deal over a hand already in progress).
    const newHand = (!isFirstRun && !!prev && prev.handNo !== view.handNo) || (isFirstRun && !isResumed)
    if (newHand) {
      if (view.status === 'PLAYING' && typeof DOMRect !== 'undefined') {
        const felt = document.querySelector('.felt')
        const stockTile = document.querySelector('[data-testid="stock-tile"], [data-testid="draw-stock"]')
        const fr = felt?.getBoundingClientRect()
        if (felt && stockTile && fr && fr.width) {
          const src = new DOMRect(fr.left + fr.width / 2 - 20, fr.top + fr.height / 2 - 26, 40, 52)
          const seatEls = [
            document.querySelector('[data-testid="slot-rack"]'),            // human (seat 0)
            document.querySelector('[data-seat="1"][data-testid="seat"]'),
            document.querySelector('[data-seat="2"][data-testid="seat"]'),
            document.querySelector('[data-seat="3"][data-testid="seat"]'),
          ]
          let k = 0
          for (let round = 0; round < 5; round++) {
            for (const tEl of seatEls) {
              if (!tEl) continue
              void flyTile({ clone: stockTile, from: src, to: tEl, durationSec: 0.46, delaySec: k * 0.06, fadeOut: true })
              k++
            }
          }
        }
      }
      return
    }
    if (!prev) return
    for (const opp of view.opponents) {
      const before = prev.opponents.find((o) => o.seat === opp.seat)
      if (!before || opp.discardCount <= before.discardCount) continue
      const seatEl = document.querySelector(`[data-seat="${opp.seat}"][data-testid="seat"]`)
      const pileEl = document.querySelector(`[data-seat="${opp.seat}"][data-testid="discard-pile"]`)
      const faceEl = pileEl?.querySelector('[data-testid="discard-top-tile"]') ?? pileEl
      if (seatEl && pileEl) void flyTile({ clone: faceEl, from: seatEl, to: pileEl, durationSec: 0.3 })
    }

    // Open/lay animation: when new melds appear on the table, fly each new meld's
    // tiles from their owner (the rack for the human; the seat for opponents) to
    // their landing spot on the table.
    if (view.tableMelds.length > prev.tableMelds.length) {
      for (let mi = prev.tableMelds.length; mi < view.tableMelds.length; mi++) {
        const meld = view.tableMelds[mi]
        if (!meld) continue
        const fromEl = meld.owner === view.seat
          ? document.querySelector('[data-testid="slot-rack"]')
          : document.querySelector(`[data-seat="${meld.owner}"][data-testid="seat"]`)
        const meldEl = document.querySelector(`[data-meld-index="${mi}"]`)
        const tileEls = meldEl ? Array.from(meldEl.querySelectorAll('[data-testid="table-meld-tile"]')) : []
        tileEls.forEach((tileEl, ti) => {
          void flyTile({ clone: tileEl, from: fromEl ?? meldEl, to: tileEl, durationSec: 0.34, delaySec: ti * 0.05 })
        })
      }
    }

    // Draw animation: when any seat's rack grows by one, fly a tile to that seat
    // FROM the source it drew — the stock pile (DrawFromStock) or its left
    // neighbour's discard (DrawFromDiscard) — so it's visible WHERE each player
    // (incl. the human, and every player in a future online build) drew from.
    // Bots are paced one move per view, so a tick has exactly one such change.
    {
      const players = view.config.players
      const rackOf = (v: PlayerView, s: number) =>
        s === v.seat ? v.you.rack.length : (v.opponents.find((o) => o.seat === s)?.rackCount ?? 0)
      const discOf = (v: PlayerView, s: number) =>
        s === v.seat ? v.you.discard.length : (v.opponents.find((o) => o.seat === s)?.discardCount ?? 0)
      const pileElOf = (s: number) =>
        document.querySelector(`[data-seat="${s}"][data-testid="discard-pile"]`)
        ?? (s === view.seat ? document.querySelector('[data-testid="discard-zone"]') : null)
      for (let s = 0; s < players; s++) {
        if (rackOf(view, s) !== rackOf(prev, s) + 1) continue // this seat didn't draw one
        const toEl = s === view.seat
          ? document.querySelector('[data-testid="slot-rack"]')
          : document.querySelector(`[data-seat="${s}"][data-testid="seat"]`)
        if (!toEl) continue
        const leftS = (s + players - 1) % players
        const tookFloor = discOf(view, leftS) < discOf(prev, leftS)
        const fromEl = tookFloor
          ? pileElOf(leftS)
          : (view.stockCount < prev.stockCount
            ? document.querySelector('[data-testid="stock-tile"], [data-testid="draw-stock"]')
            : null)
        if (fromEl) void flyTile({ clone: fromEl, from: fromEl, to: toEl, durationSec: 0.34 })
      }
    }
  }, [view])

  // Sound effects: derive game events from the view diff (covers every seat
  // uniformly). Separate from the animation effect so it fires even when
  // animations are off (reduced-motion). playSfx itself no-ops when sound is
  // disabled. The human's own discard plays in discardFromSlot for immediacy;
  // okey-swap plays at its drag handler (rack length is unchanged by a swap).
  const prevSoundViewRef = useRef<PlayerView | null>(null)
  const soundMountRef = useRef(false)
  useEffect(() => {
    const prev = prevSoundViewRef.current
    prevSoundViewRef.current = view
    const firstRun = !soundMountRef.current
    soundMountRef.current = true
    if (!view) return
    // Fresh hand dealt.
    if (!firstRun && prev && prev.handNo !== view.handNo) { playSfx('deal'); return }
    if (firstRun || !prev || prev.handNo !== view.handNo) return
    // Hand ended.
    if (!prev.terminal && view.terminal) {
      const youWon = view.terminal.reason === 'win' && view.terminal.winnerSeat === view.seat
      playSfx(youWon ? 'win' : 'lose')
      return
    }
    // It just became the human's turn → priority cue (over the event that caused it).
    const nowMyTurn = view.turn.seat === view.seat && view.status === 'PLAYING'
    const wasMyTurn = prev.turn.seat === view.seat && prev.status === 'PLAYING'
    if (nowMyTurn && !wasMyTurn) { playSfx('turn'); return }
    // Otherwise, the most salient board change this tick.
    const prevMelds = prev.tableMelds.length
    const melds = view.tableMelds.length
    const prevTiles = prev.tableMelds.reduce((a, m) => a + m.tiles.length, 0)
    const tiles = view.tableMelds.reduce((a, m) => a + m.tiles.length, 0)
    const oppDiscarded = view.opponents.some((o) => {
      const b = prev.opponents.find((x) => x.seat === o.seat)
      return b != null && o.discardCount > b.discardCount
    })
    const prevPen = (prev.penalties ?? []).reduce((a, b) => a + b, 0)
    const pen = (view.penalties ?? []).reduce((a, b) => a + b, 0)
    if (pen > prevPen) playSfx('penalty')           // işlek / okey-discard penalty applied
    else if (melds > prevMelds) playSfx('open')     // someone opened / laid a new meld
    else if (tiles > prevTiles) playSfx('layoff')   // someone laid onto a meld ("işle")
    else if (view.you.rack.length > prev.you.rack.length) playSfx('draw') // you drew
    else if (oppDiscarded) playSfx('discard')
  }, [view])

  if (!view) return null

  const isMyTurn = view.turn.seat === view.seat && view.status === 'PLAYING'
  // Single source of truth for action gating (engine legality for the human seat).
  const legal = adapter.legalMoves()

  // The human's single discard spot shows their thrown tiles (top + count).
  const myDiscardTop = view.you.discard.length > 0 ? view.you.discard[view.you.discard.length - 1] : undefined
  const myDiscardCount = view.you.discard.length

  // The current layout (fall back to fresh initLayout if state hasn't been set yet)
  const currentLayout: SlotLayout = layout ?? initLayout(view.you.rack, COLS)

  // The tile in the selected slot (null if slot is empty or no selection)
  const selectedTile = selectedSlot !== null ? currentLayout[selectedSlot] ?? null : null

  const send = (intent: GameEvent) => {
    adapter
      .dispatch({ ...intent, expectedVersion: adapter.currentVersion() } as GameEvent & { expectedVersion: number })
      .then((res) => {
        if (!res.accepted) showReject(res.reason)
      })
  }

  const handleArrange = () => {
    if (!view.okey) return
    const okey = view.okey
    withFlip(() => setLayout(autoArrange(view.you.rack, okey, view.config, COLS)), 0.42)
  }

  const handleArrangePairs = () => {
    if (!view.okey) return
    const okey = view.okey
    withFlip(() => setLayout(autoArrangePairs(view.you.rack, okey, view.config, COLS)), 0.42)
  }

  const handleHint = () => {
    if (!view.okey) return
    const suggested = suggestDiscard(view.you.rack, view.okey, view.config)
    // Find the slot index in the current layout that contains this tile
    const slotIdx = currentLayout.findIndex(t => t !== null && tilesEqual(t, suggested))
    if (slotIdx !== -1) setSelectedSlot(slotIdx)
  }

  const handleNextHand = () => {
    adapter.nextHand()
    setMatch(adapter.getMatch())
    setHistory(adapter.getHistory())
  }

  const updateSettings = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
    if (patch.theme) applyTheme(patch.theme)
  }

  // ── 101-specific pre-computed values ──────────────────────────────────────
  const is101 = !!view.config.requiresOpening

  // LAYOUT-DRIVEN opening (the player's rack arrangement is the source of truth):
  // parse the rack into the player's intended meld segments and value THOSE — the
  // engine's auto-arrangement never overrides how the player grouped their tiles.
  const meldSegments = view.okey ? parseMeldSegments(currentLayout) : []
  const openingThreshold = view.config.openingThreshold ?? 101
  const pairsNeeded = view.config.pairsOpenCount ?? 5

  // Seri-route valid melds (runs/groups ≥3) the player has arranged, and their
  // combined opening value — this is the live hand total shown above the rack.
  const validSeriMelds = view.okey
    ? meldSegments.filter((s) => s.length >= 3 && isValidMeldSet([s], view.okey!, view.config))
    : []
  const handMeldValue = view.okey ? openingValue(validSeriMelds, view.okey) : 0

  // Centre-table badges: the HIGHEST seri first-open value across players (only the
  // first open counts — later lay-offs don't change it) and the çift-open pair count.
  const allSeats = [
    { openRoute: view.you.openRoute, openedValue: view.you.openedValue },
    ...view.opponents.map((o) => ({ openRoute: o.openRoute, openedValue: o.openedValue })),
  ]
  const seriOpenValue = allSeats.reduce(
    (mx, p) => (p.openRoute === 'seri' && typeof p.openedValue === 'number' ? Math.max(mx, p.openedValue) : mx),
    0,
  )
  const pairOpenCount = allSeats.some((p) => p.openRoute === 'cift') ? pairsNeeded : 0

  // Çift-route valid pairs the player has arranged.
  const pairSegments = view.okey
    ? meldSegments.filter((s) => s.length === 2 && isValidPairSet([s], view.okey!))
    : []

  // Can the player open right now, FROM THEIR ARRANGEMENT?
  const canOpenSeri = is101 && !view.you.hasOpened && validSeriMelds.length > 0 && handMeldValue >= openingThreshold
  const canOpenCift = is101 && !view.you.hasOpened && pairSegments.length >= pairsNeeded
  const standingsForSeat = match.standings[view.seat] ?? 0
  const openSeriMelds = validSeriMelds
  const openCiftMelds = pairSegments.slice(0, pairsNeeded)

  // Determine the player's open route (after first open)
  const openRoute = view.you.openRoute as 'seri' | 'cift' | undefined
  // A çift player (declared OR opened via pairs) may never lay new runs/groups.
  const isCiftPlayer = openRoute === 'cift' || view.you.declaredCift === true

  // findLayableMeld result: post-opening meld laying (only for seri-route players)
  const layableMeld101 = is101 && view.okey && view.you.hasOpened && !isCiftPlayer
    ? findLayableMeld(view.you.rack, view.okey, view.config)
    : null

  // A çift route is open on the table once anyone has laid a pair. Once it is,
  // ANY opened player may lay additional pairs (even a seri-route player).
  const tableHasPair = (view.tableMelds ?? []).some((m) => m.kind === 'pair')
  // findLayablePairs result: post-opening pair laying (allowed when a çift route exists)
  const layablePairs101 = is101 && view.okey && view.you.hasOpened && tableHasPair
    ? findLayablePairs(view.you.rack, view.okey, view.config)
    : null

  // Find first rack tile + meld index that produces a legal LayOff
  type LayOffTarget = { meldIndex: number; tile: typeof view.you.rack[0] } | null
  const layOffTarget: LayOffTarget = (() => {
    if (!is101 || !view.you.hasOpened || !view.okey) return null
    const tableMelds = view.tableMelds
    const okey = view.okey
    for (let mi = 0; mi < tableMelds.length; mi++) {
      const meld = tableMelds[mi]!
      // Pairs are never lay-off targets — you can't extend a çift into a run/group.
      if (meld.kind === 'pair') continue
      // Only try 1-tile lay-off (cap per run is 2, but we try one at a time)
      for (const tile of view.you.rack) {
        const merged = [...meld.tiles, tile]
        if (isValidMeldSet([merged], okey, view.config)) {
          return { meldIndex: mi, tile }
        }
      }
    }
    return null
  })()

  // "İşlek" tiles: rack tiles that fit onto a meld already on the table. Marked with
  // a red dot so the player can see which tiles are layable (shown whenever there are
  // table melds — informational, regardless of whether the human has opened yet).
  const layableKeys: Set<string> = (() => {
    const keys = new Set<string>()
    if (!is101 || !view.okey || view.tableMelds.length === 0) return keys
    const okey = view.okey
    for (const tile of view.you.rack) {
      const key = tileToString(tile)
      if (keys.has(key)) continue
      for (const meld of view.tableMelds) {
        // Pairs are not lay-off targets, so a tile that only "fits" a pair is not işlek.
        if (meld.kind === 'pair') continue
        if (isValidMeldSet([[...meld.tiles, tile]], okey, view.config)) { keys.add(key); break }
      }
    }
    return keys
  })()

  // Determine hand result text
  let handResultLine: string
  if (view.terminal?.reason === 'win') {
    const winnerSeat = view.terminal.winnerSeat
    const winnerName = winnerSeat != null ? seatName(winnerSeat) : 'Bilinmeyen'
    const winTypeLabel = view.terminal.winType === 'pairs' ? 'Çift' : 'Per'
    handResultLine = winnerSeat === view.seat
      ? `🏆 Kazandın! — ${winTypeLabel}`
      : `${winnerName} kazandı — ${winTypeLabel}`
  } else {
    handResultLine = 'Berabere (stok bitti)'
  }

  // Determine match winner. Direction depends on the scoring model:
  //  - 101 (yuzbir-penalty): negative = good, so the LOWEST total wins.
  //  - Klasik (points): the winner gains points, so the HIGHEST total wins.
  const bestStanding = is101 ? Math.min(...match.standings) : Math.max(...match.standings)
  const matchWinnerSeat = match.standings.indexOf(bestStanding)
  const matchWinnerName = seatName(matchWinnerSeat)

  const handleTakeDiscard = () => {
    send({ type: 'DrawFromDiscard', seat: view.seat })
  }

  // Guard: only allow discard when human is in DISCARD phase
  const isDiscardPhase = isMyTurn && view.turn.phase === 'DISCARD'

  // While a rack tile is being dragged, which table melds is it a LEGAL lay-off
  // for? Those melds get a green "valid target" outline so the player can see
  // exactly where to drop (drag-to-işle). Empty unless a layable rack tile is
  // actively being dragged during the player's discard phase.
  const dragLayoffTargets: Set<number> = (() => {
    const targets = new Set<number>()
    const dragTile = activeDrag?.kind === 'rack' ? activeDrag.tile : undefined
    if (
      !dragTile || !is101 || !view.okey || !view.you.hasOpened ||
      !isDiscardPhase || view.you.rack.length <= 1
    ) return targets
    const okey = view.okey
    view.tableMelds.forEach((m, i) => {
      if (m.kind === 'pair') return // pairs are never lay-off targets
      if (isValidMeldSet([[...m.tiles, dragTile]], okey, view.config)) targets.add(i)
    })
    return targets
  })()

  // Discard the EXACT tile in `slotIdx` (not a duplicate the engine happens to
  // match first). We optimistically empty that precise slot so reconcile keeps
  // any identical tile in its own slot instead of reshuffling the rack.
  const discardFromSlot = (slotIdx: number) => {
    if (!isDiscardPhase) return
    const tile = currentLayout[slotIdx]
    if (tile == null) return
    // Fly the tile from its rack slot to the discard spot (before it's removed).
    if (animationsEnabled()) {
      const tileEl = document.querySelector(`[data-slot="${slotIdx}"] [data-flip-id]`)
      const zoneEl = document.querySelector('[data-testid="discard-zone"]')
      if (tileEl && zoneEl) void flyTile({ clone: tileEl, from: tileEl, to: zoneEl, durationSec: 0.28, fadeOut: true })
    }
    const optimistic = currentLayout.map((t, i) => (i === slotIdx ? null : t))
    setLayout(optimistic)
    adapter
      .dispatch({ type: 'Discard', seat: view.seat, tile, expectedVersion: adapter.currentVersion() } as GameEvent & { expectedVersion: number })
      .then((res) => {
        if (!res.accepted) {
          showReject(res.reason)
          // Roll the optimistic removal back from the authoritative rack.
          setLayout(reconcile(optimistic, view.you.rack))
        } else {
          playSfx('discard') // immediate feedback for the human's own throw
        }
      })
  }

  // Track the dragged tile for the DragOverlay (so it floats above everything).
  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    if (/^\d+$/.test(id)) {
      setActiveDrag({ kind: 'rack', tile: currentLayout[Number(id)] ?? undefined })
    } else if (id === 'draw-stock') {
      setActiveDrag({ kind: 'stock' })
    } else if (id === 'draw-floor') {
      const left = view.opponents.find((o) => (o.seat - view.seat + 4) % 4 === 3)
      setActiveDrag({ kind: 'floor', tile: left?.discardTop })
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = event
    const activeId = String(active.id)
    const overId = over ? String(over.id) : null

    // Lay-off via drag: a rack tile dropped on a table meld ("layoff:meldIndex").
    // Extend THAT specific meld. Validated by the engine; rejection → toast.
    if (overId && overId.startsWith('layoff:') && /^\d+$/.test(activeId)) {
      const meldIndex = Number(overId.split(':')[1])
      const tile = currentLayout[Number(activeId)]
      if (
        tile != null && isDiscardPhase && view.you.hasOpened &&
        view.you.rack.length > 1 && legal.includes('LayOff')
      ) {
        send({ type: 'LayOff', seat: view.seat, meldIndex, tiles: [tile] })
      }
      return
    }

    // Okey-swap: a rack tile dropped on a table-meld okey ("take-okey:meld:tile").
    // Insert the real tile and take the okey back into the hand.
    if (overId && overId.startsWith('take-okey:') && /^\d+$/.test(activeId)) {
      const meldIndex = Number(overId.split(':')[1])
      const tile = currentLayout[Number(activeId)]
      if (tile != null && isDiscardPhase && view.you.hasOpened) {
        playSfx('takeokey') // swap leaves rack length unchanged → not caught by the view diff
        send({ type: 'TakeOkey', seat: view.seat, meldIndex, tile })
      }
      return
    }

    const result = interpretDragEnd(activeId, overId)

    // If the draw was dropped onto a specific slot, remember it so the drawn tile
    // lands exactly there (reconcile honours pendingDrawSlot).
    const dropSlot = overId && /^\d+$/.test(overId) ? Number(overId) : null

    switch (result.action) {
      case 'draw-stock':
        pendingDrawSlot.current = dropSlot
        send({ type: 'DrawFromStock', seat: view.seat })
        break

      case 'draw-floor':
        pendingDrawSlot.current = dropSlot
        send({ type: 'DrawFromDiscard', seat: view.seat })
        break

      case 'discard':
        discardFromSlot(result.from)
        break

      case 'move':
        withFlip(() => setLayout(l => moveTile(l!, result.from, result.to)), 0.3)
        break

      case 'none':
      default:
        // no-op
        break
    }
  }

  return (
    <DndContext
      collisionDetection={collisionStrategy}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
    {/* Dragged tile floats above the rack/table (portal) — never clipped/hidden. */}
    <DragOverlay dropAnimation={null} zIndex={1000}>
      {activeDrag?.kind === 'stock' ? (
        <div className="stock-deste" style={{ width: 'var(--tile-w)', height: 'var(--tile-h)' }}><span className="count" /></div>
      ) : activeDrag?.tile ? (
        <TileView tile={activeDrag.tile} colorblind={settings.colorblind} />
      ) : null}
    </DragOverlay>
    {toast && (
      <div
        role="alert"
        data-testid="reject-toast"
        style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, background: 'rgba(28,6,6,0.92)', color: '#ffd9d9',
          border: '1px solid rgba(255,120,120,0.45)', padding: '10px 18px',
          borderRadius: 10, fontFamily: 'system-ui', fontWeight: 700, fontSize: 14,
          boxShadow: '0 6px 20px rgba(0,0,0,0.55)', pointerEvents: 'none',
        }}
      >
        {toast}
      </div>
    )}
    <Table
      view={view}
      onTakeDiscard={handleTakeDiscard}
      standings={match.standings}
      tableMelds={is101 && view.okey ? (
        <CenterMelds
          melds={view.tableMelds}
          okey={view.okey}
          takeOkeyEnabled={isDiscardPhase && view.you.hasOpened}
          layoffEnabled={isDiscardPhase && view.you.hasOpened && !!view.config.layOff && view.you.rack.length > 1}
          validTargetIndices={dragLayoffTargets}
          seriOpenValue={seriOpenValue}
          pairOpenCount={pairOpenCount}
        />
      ) : null}
      humanDiscard={
        <MyDiscardTarget
          topTile={myDiscardTop}
          count={myDiscardCount}
          active={isMyTurn && isDiscardPhase}
          onDropTile={() => { if (selectedSlot !== null) discardFromSlot(selectedSlot) }}
          okey={view.okey}
          colorblind={settings.colorblind}
          repValue={settings.repValue}
        />
      }
    >
      {/* ── ACTION BAR (above the rack): açma (left) · nameplate+total (center) · git/diz (right) ── */}
      <div
        className="action-bar"
        style={{
          display: 'flex', width: '100%', maxWidth: 1320, margin: '2px auto 8px',
          alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}
      >
        {/* LEFT: hand-count badge + game-action buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {/* Which hand of the match + my hand total (the opening value before I open,
              the running score after). When the opening value reaches the threshold
              the box pulses green — no extra "açabilirsin" text needed. */}
          {(() => {
            const showOpenTotal = is101 && !view.you.hasOpened
            const opensReady = showOpenTotal && handMeldValue >= openingThreshold
            return (
              <div
                data-testid="hand-count"
                className={opensReady ? 'open-ready' : undefined}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15,
                  padding: '3px 10px', borderRadius: 8, background: 'rgba(0,0,0,.35)',
                  border: opensReady ? '1px solid #7BE38B' : '1px solid rgba(255,255,255,.14)',
                  fontFamily: 'system-ui', flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 700 }}>El {match.handNo}/{match.totalHands}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: opensReady ? '#7BE38B' : '#fff' }}>
                  {showOpenTotal ? handMeldValue : standingsForSeat}
                </span>
              </div>
            )
          })()}
          {isMyTurn && view.turn.phase === 'DRAW' && legal.includes('DrawFromStock') && (
            <button onClick={() => send({ type: 'DrawFromStock', seat: view.seat })}>Stoktan Çek</button>
          )}
          {isMyTurn && view.turn.phase === 'DRAW' && legal.includes('DrawFromDiscard') && (
            <button onClick={() => send({ type: 'DrawFromDiscard', seat: view.seat })}>Yerden Çek</button>
          )}
          {/* Opening buttons (pre-open). "Aç ≥101" hidden once çift is declared. */}
          {isMyTurn && isDiscardPhase && is101 && !view.you.hasOpened && !view.you.declaredCift && (
            <button
              disabled={!canOpenSeri}
              title="İstakadaki perlerinle aç (toplam ≥101)"
              onClick={() => { if (canOpenSeri) send({ type: 'OpenMeld', seat: view.seat, melds: openSeriMelds }) }}
            >
              Aç (≥101)
            </button>
          )}
          {isMyTurn && isDiscardPhase && is101 && !view.you.hasOpened && (
            <button
              disabled={!canOpenCift}
              title="5 çift ile aç"
              onClick={() => { if (canOpenCift) send({ type: 'OpenMeld', seat: view.seat, melds: openCiftMelds }) }}
            >
              Çift Aç
            </button>
          )}
          {/* Çifte Git (binding) — left group, with confirm so it isn't hit by accident */}
          {isMyTurn && isDiscardPhase && is101 && !view.you.hasOpened && !view.you.declaredCift && legal.includes('DeclareCift') && (
            <button
              title="Çift rotasını seç (bağlayıcı)"
              onClick={() => {
                if (window.confirm('Çifte gitmek BAĞLAYICIDIR: bu el boyunca yalnız çift açıp dizebilirsin, seri/grup açamazsın. Emin misin?')) {
                  send({ type: 'DeclareCift', seat: view.seat })
                }
              }}
            >
              Çifte Git
            </button>
          )}
          {/* Taşı Geri Al — non-çift taker who can't open returns the floor tile (Kural 11) */}
          {isMyTurn && isDiscardPhase && is101 && view.turn.tookFromLeft && !view.you.hasOpened && !view.you.declaredCift && (
            <button
              title="Yerden aldığın taşı geri koy, stoktan çek"
              onClick={() => send({ type: 'ReturnFloorTile', seat: view.seat })}
            >
              ↩ Taşı Geri Al
            </button>
          )}
          {/* İşle (lay-off) — left group */}
          {isMyTurn && isDiscardPhase && is101 && view.you.hasOpened && (
            <button
              disabled={layOffTarget === null || !legal.includes('LayOff') || view.you.rack.length <= 1}
              title={view.you.rack.length <= 1 ? 'Son taşını işleyemezsin — onu bitmek için atmalısın' : 'Yerdeki perlere taş işle'}
              onClick={() => { if (layOffTarget && view.you.rack.length > 1) send({ type: 'LayOff', seat: view.seat, meldIndex: layOffTarget.meldIndex, tiles: [layOffTarget.tile] }) }}
            >
              İşle
            </button>
          )}
          {/* Post-open laying (seri açan: yeni seri/grup; masada çift varsa: çift) — left group */}
          {isMyTurn && isDiscardPhase && is101 && view.you.hasOpened && !isCiftPlayer && (
            <button
              disabled={layableMeld101 === null}
              title="Yere yeni bir seri/grup aç"
              onClick={() => { if (layableMeld101) send({ type: 'OpenMeld', seat: view.seat, melds: [layableMeld101] }) }}
            >
              Seri Aç
            </button>
          )}
          {isMyTurn && isDiscardPhase && is101 && view.you.hasOpened && tableHasPair && (
            <button
              disabled={layablePairs101 === null}
              title="Yerdeki çift sırasına yeni çift(ler) aç"
              onClick={() => { if (layablePairs101) send({ type: 'OpenMeld', seat: view.seat, melds: layablePairs101 }) }}
            >
              Çift Aç
            </button>
          )}
        </div>

        {/* CENTER: live hand total (101) + human nameplate */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div
            data-testid="human-nameplate"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 10,
              background: 'linear-gradient(180deg,#c08a44,#7a4a1c)', color: '#fff',
              boxShadow: isMyTurn ? '0 0 12px #5ad1c4' : '0 2px 4px rgba(0,0,0,.4)',
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#3a4570', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>S</div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{seatName(view.seat)}</span>
            <span style={{ background: 'rgba(0,0,0,.3)', borderRadius: 8, padding: '2px 7px', fontSize: 12 }}>{view.you.rack.length}</span>
            <span style={{ background: 'rgba(0,0,0,.45)', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 700, color: '#ffd27a' }}>{standingsForSeat}</span>
            {(view.penalties?.[view.seat] ?? 0) > 0 && (
              <span title={`${view.penalties![view.seat]} ceza (×101)`} style={{ background: 'rgba(200,40,40,.92)', color: '#fff', borderRadius: 8, padding: '2px 7px', fontSize: 11, fontWeight: 800 }}>
                ⚠{view.penalties![view.seat]}
              </span>
            )}
          </div>
        </div>

        {/* RIGHT of the nameplate: sort (diz) buttons + hint, then the draw stock +
            gösterge at the far right. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'flex-end' }}>
          <div className="act" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isMyTurn && <button onClick={handleArrangePairs} title="Çiftlere göre diz">↺ Çift Diz</button>}
            {isMyTurn && <button onClick={handleArrange} title="Serilere/gruplara göre diz">↺ Seri Diz</button>}
            {isMyTurn && isDiscardPhase && <button onClick={handleHint} aria-label="İpucu" title="İpucu">💡</button>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StockPile stockCount={view.stockCount} enabled={isMyTurn && view.turn.phase === 'DRAW' && view.stockCount > 0} />
            {view.indicator && (
              <div data-testid="gosterge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                {/* Identical structure to a rack tile: a `.okey-slot` (--tile-w/h)
                    wrapping the TileView — so it renders at the exact rack tile size.
                    Always a numbered tile (a legacy false-joker indicator falls back
                    to the okey tile; `plain` forces an ivory body — no gold). */}
                <div className="okey-slot" style={{ flexShrink: 0 }}>
                  <TileView tile={view.indicator.kind === 'FALSE_JOKER' && view.okey ? view.okey : view.indicator} testId="gosterge-tile" plain />
                </div>
                <span style={{ fontSize: 10, opacity: 0.85, color: '#fff' }}>
                  okey: <strong>{view.okey ? tileToString(view.okey) : '-'}</strong>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <SlotRack
          layout={currentLayout}
          okey={view.okey}
          colorblind={settings.colorblind}
          repValue={settings.repValue}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
          layableKeys={layableKeys}
        />
      </div>

      {/* Score table + Help + Settings buttons — fixed top-right of the screen */}
      <button
        aria-label="Skor Tabelası"
        onClick={() => { setHistory(adapter.getHistory()); setShowScores(true) }}
        style={{ position: 'fixed', top: 12, right: 96, zIndex: 210, fontSize: 18, padding: '6px 12px', borderRadius: 8 }}
      >
        📊
      </button>
      <button
        aria-label="Nasıl Oynanır?"
        onClick={() => setShowHelp(true)}
        style={{ position: 'fixed', top: 12, right: 54, zIndex: 210, fontSize: 18, padding: '6px 12px', borderRadius: 8 }}
      >
        ?
      </button>
      <button
        aria-label="Ayarlar"
        onClick={() => setShowSettings(v => !v)}
        style={{ position: 'fixed', top: 12, right: 12, zIndex: 210, fontSize: 18, padding: '6px 12px', borderRadius: 8 }}
      >
        ⚙
      </button>

      {showHelp && (
        <div
          data-testid="help-modal"
          role="dialog"
          aria-label="Nasıl Oynanır?"
          onClick={() => setShowHelp(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(0,0,0,.75)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 12px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#13361f', color: '#fff', borderRadius: 12, padding: '18px 22px',
              maxWidth: 580, width: '100%', fontFamily: 'system-ui',
              boxShadow: '0 10px 40px rgba(0,0,0,.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Nasıl Oynanır? {is101 ? '(101)' : '(Klasik)'}</h2>
              <button onClick={() => setShowHelp(false)} aria-label="Kapat">Kapat</button>
            </div>
            <HelpContent variant={is101 ? 'yuzbir' : 'klasik'} />
          </div>
        </div>
      )}

      {showScores && (
        <div
          data-testid="score-modal"
          role="dialog"
          aria-label="Skor Tabelası"
          onClick={() => setShowScores(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(0,0,0,.75)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 12px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#13361f', color: '#fff', borderRadius: 12, padding: '18px 22px',
              maxWidth: 620, width: '100%', fontFamily: 'system-ui',
              boxShadow: '0 10px 40px rgba(0,0,0,.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>📊 Skor Tabelası</h2>
              <button onClick={() => setShowScores(false)} aria-label="Kapat">Kapat</button>
            </div>
            <ScoreTable history={history} standings={match.standings} names={[...SEAT_NAMES]} />
          </div>
        </div>
      )}

      {showSettings && (
        <div
          className="settings-panel"
          style={{
            background: 'rgba(0,0,0,.85)',
            color: '#fff',
            borderRadius: 10,
            padding: '16px 20px',
            position: 'fixed',
            top: 60,
            right: 16,
            zIndex: 200,
            minWidth: 220,
            fontFamily: 'system-ui',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <strong style={{ fontSize: 15 }}>Ayarlar</strong>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Tema:
            <select
              value={settings.theme}
              onChange={e => updateSettings({ theme: e.target.value as 'klasik' | 'gece' })}
              style={{ flex: 1 }}
            >
              <option value="klasik">Klasik</option>
              <option value="gece">Gece</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={settings.colorblind}
              onChange={e => updateSettings({ colorblind: e.target.checked })}
            />
            Renk körü desteği
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={settings.repValue}
              onChange={e => updateSettings({ repValue: e.target.checked })}
            />
            Rep değeri göster
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={e => updateSettings({ sound: e.target.checked })}
            />
            Ses
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Zorluk:
            <select
              value={settings.difficulty}
              onChange={e => updateSettings({ difficulty: e.target.value as 'easy' | 'medium' | 'hard' })}
              style={{ flex: 1 }}
            >
              <option value="easy">Kolay</option>
              <option value="medium">Orta</option>
              <option value="hard">Zor</option>
            </select>
          </label>
          <button onClick={() => setShowSettings(false)} style={{ marginTop: 4 }}>Kapat</button>
        </div>
      )}

      {view.status === 'ENDED' && (
        <div
          className="overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.82)',
            color: '#fff', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-start', gap: 16,
            paddingTop: '5vh', overflowY: 'auto',
            fontFamily: 'system-ui',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22 }}>{handResultLine}</h2>

          <Scoreboard
            standings={match.standings}
            names={[...SEAT_NAMES]}
            handNo={match.handNo}
            totalHands={match.totalHands}
          />

          {match.over ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: 26, color: '#ffd700' }}>Maç Bitti</h2>
                <p style={{ margin: 0, fontSize: 16, opacity: 0.9 }}>
                  Kazanan: <strong>{matchWinnerName}</strong>
                </p>
              </div>
              <div className="act" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={() => onRestart?.()}>↻ Yeniden Başlat</button>
                <button onClick={() => onExitToMenu?.()}>🏠 Ana Menü</button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleNextHand}
              style={{
                fontSize: 17, padding: '10px 28px', cursor: 'pointer',
                background: 'linear-gradient(180deg,#f0b53e,#d2811a)', color: '#3a2400',
                fontWeight: 800, border: 'none', borderRadius: 10,
                boxShadow: '0 3px 0 #9a5e12, 0 4px 10px rgba(0,0,0,.4)',
              }}
            >
              Sonraki El ▸
            </button>
          )}
        </div>
      )}
    </Table>
    </DndContext>
  )
}
