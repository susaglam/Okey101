import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import { suggestDiscard, tilesEqual, tileToString, findLayableMeld, findLayablePairs, isValidMeldSet, isValidPairSet, openingValue } from '@cs-okey/engine'
import { DndContext } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import type { LocalAdapter } from '../adapter/LocalAdapter'
import type { RejectionCode } from '../adapter/Adapter'
import type { MatchState } from '../match'
import { Table } from '../components/Table'
import { SlotRack } from '../components/SlotRack'
import { MyDiscardTarget } from '../components/MyDiscardTarget'
import { Scoreboard } from '../components/Scoreboard'
import { ScoreTable } from '../components/ScoreTable'
import { TableMelds } from '../components/TableMelds'
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

export default function GameScreen({ adapter }: { adapter: LocalAdapter }) {
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

  // Reddetme bildirimi (toast) — engine bir hamleyi reddederse kullanıcı sebebini görür.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showReject = (reason?: RejectionCode) => {
    setToast(REJECT_MSG[reason ?? 'unknown'])
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

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

  // findLayableMeld result: post-opening meld laying (only for seri-route players)
  const layableMeld101 = is101 && view.okey && view.you.hasOpened && openRoute !== 'cift'
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

  // Determine match winner (highest standings)
  const maxStanding = Math.max(...match.standings)
  const matchWinnerSeat = match.standings.indexOf(maxStanding)
  const matchWinnerName = seatName(matchWinnerSeat)

  const handleTakeDiscard = () => {
    send({ type: 'DrawFromDiscard', seat: view.seat })
  }

  // Guard: only allow discard when human is in DISCARD phase
  const isDiscardPhase = isMyTurn && view.turn.phase === 'DISCARD'

  // Discard the EXACT tile in `slotIdx` (not a duplicate the engine happens to
  // match first). We optimistically empty that precise slot so reconcile keeps
  // any identical tile in its own slot instead of reshuffling the rack.
  const discardFromSlot = (slotIdx: number) => {
    if (!isDiscardPhase) return
    const tile = currentLayout[slotIdx]
    if (tile == null) return
    const optimistic = currentLayout.map((t, i) => (i === slotIdx ? null : t))
    setLayout(optimistic)
    adapter
      .dispatch({ type: 'Discard', seat: view.seat, tile, expectedVersion: adapter.currentVersion() } as GameEvent & { expectedVersion: number })
      .then((res) => {
        if (!res.accepted) {
          showReject(res.reason)
          // Roll the optimistic removal back from the authoritative rack.
          setLayout(reconcile(optimistic, view.you.rack))
        }
      })
  }

  const handleDragEnd = (event: DragEndEvent) => {
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
    <DndContext onDragEnd={handleDragEnd}>
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
        <TableMelds
          melds={view.tableMelds}
          okey={view.okey}
          takeOkeyEnabled={isDiscardPhase && view.you.hasOpened}
          layoffEnabled={isDiscardPhase && view.you.hasOpened && !!view.config.layOff && view.you.rack.length > 1}
        />
      ) : null}
    >
      {/* ── ACTION BAR (above the rack): açma (left) · nameplate+total (center) · git/diz (right) ── */}
      <div
        className="action-bar"
        style={{
          display: 'flex', width: '100%', maxWidth: 920, margin: '2px auto 8px',
          alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}
      >
        {/* LEFT: utility + opening buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
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
              Çift Aç (5)
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
          {isMyTurn && isDiscardPhase && is101 && view.you.hasOpened && openRoute !== 'cift' && (
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
          {is101 && !view.you.hasOpened && (
            <div
              data-testid="hand-total"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '2px 12px', borderRadius: 999, fontFamily: 'system-ui', fontSize: 12,
                background: 'rgba(0,0,0,.35)',
                color: handMeldValue >= openingThreshold ? '#7BE38B' : '#ffe9b0',
                border: handMeldValue >= openingThreshold ? '1px solid rgba(123,227,139,.6)' : '1px solid rgba(255,233,176,.3)',
                fontWeight: 700,
              }}
            >
              El toplamı: {handMeldValue}
              <span style={{ opacity: 0.7, fontWeight: 500 }}>
                {handMeldValue >= openingThreshold ? '✓ açabilirsin' : `/ ${openingThreshold}`}
              </span>
            </div>
          )}
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
          </div>
        </div>

        {/* RIGHT: the player's single discard spot — shows thrown tiles; lights up
            and reads "Taş At" on your discard turn (replaces the old separate AT zone). */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
          <MyDiscardTarget
            topTile={myDiscardTop}
            count={myDiscardCount}
            active={isMyTurn && isDiscardPhase}
            onDropTile={() => { if (selectedSlot !== null) discardFromSlot(selectedSlot) }}
          />
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
        {/* Utility buttons — to the RIGHT of the rack (old AT spot), stacked. The
            `act` class gives them the themed (gold) button styling. */}
        <div className="act" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', minWidth: 96 }}>
          {isMyTurn && <button onClick={handleArrange} title="Serilere/gruplara göre diz">↺ Sırala</button>}
          {isMyTurn && <button onClick={handleArrangePairs} title="Çiftlere göre diz">↺ Çift Sırala</button>}
          {isMyTurn && isDiscardPhase && <button onClick={handleHint}>💡 İpucu</button>}
        </div>
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
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 26, color: '#ffd700' }}>Maç Bitti</h2>
              <p style={{ margin: 0, fontSize: 16, opacity: 0.9 }}>
                Kazanan: <strong>{matchWinnerName}</strong>
              </p>
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
