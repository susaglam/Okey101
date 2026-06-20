import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import { suggestDiscard, tilesEqual, findLayableMeld, findLayablePairs, isValidMeldSet, isValidPairSet, openingValue } from '@cs-okey/engine'
import { DndContext } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import type { LocalAdapter } from '../adapter/LocalAdapter'
import type { RejectionCode } from '../adapter/Adapter'
import type { MatchState } from '../match'
import { Table } from '../components/Table'
import { SlotRack } from '../components/SlotRack'
import { DiscardZone } from '../components/DiscardZone'
import { Scoreboard } from '../components/Scoreboard'
import { TableMelds } from '../components/TableMelds'
import { loadSettings, saveSettings } from '../settings'
import { applyTheme } from '../theme/themes'
import type { SlotLayout } from '../rack/slots'
import { initLayout, reconcile, moveTile, autoArrange, parseMeldSegments } from '../rack/slots'
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
  'unknown': 'Hamle reddedildi',
}

export default function GameScreen({ adapter }: { adapter: LocalAdapter }) {
  const [view, setView] = useState<PlayerView | null>(null)
  const [layout, setLayout] = useState<SlotLayout | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [match, setMatch] = useState<MatchState>(() => adapter.getMatch())
  const [settings, setSettings] = useState(() => loadSettings())
  const [showSettings, setShowSettings] = useState(false)
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

  useEffect(() =>
    adapter.subscribe(
      (v) => {
        setView(v)
        setLayout(prev => {
          if (!prev) return initLayout(v.you.rack, COLS)
          const pref = pendingDrawSlot.current
          pendingDrawSlot.current = null
          return reconcile(prev, v.you.rack, pref)
        })
        setSelectedSlot(null)
        setMatch(adapter.getMatch())
      },
      () => {}
    ),
    [adapter]
  )

  if (!view) return null

  const isMyTurn = view.turn.seat === view.seat && view.status === 'PLAYING'
  // Single source of truth for action gating (engine legality for the human seat).
  const legal = adapter.legalMoves()

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
  const openSeriMelds = validSeriMelds
  const openCiftMelds = pairSegments.slice(0, pairsNeeded)

  // Determine the player's open route (after first open)
  const openRoute = view.you.openRoute as 'seri' | 'cift' | undefined

  // findLayableMeld result: post-opening meld laying (only for seri-route players)
  const layableMeld101 = is101 && view.okey && view.you.hasOpened && openRoute !== 'cift'
    ? findLayableMeld(view.you.rack, view.okey, view.config)
    : null

  // findLayablePairs result: post-opening pair laying (only for çift-route players)
  const layablePairs101 = is101 && view.okey && view.you.hasOpened && openRoute === 'cift'
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
    <Table view={view} onTakeDiscard={handleTakeDiscard} standings={match.standings}>
      {is101 && view.okey && (
        <TableMelds
          melds={view.tableMelds}
          okey={view.okey}
          takeOkeyEnabled={isDiscardPhase && view.you.hasOpened}
        />
      )}
      {is101 && !view.you.hasOpened && (
        <div
          data-testid="hand-total"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            padding: '3px 12px', borderRadius: 999, fontFamily: 'system-ui', fontSize: 13,
            background: 'rgba(0,0,0,.35)',
            color: handMeldValue >= openingThreshold ? '#7BE38B' : '#ffe9b0',
            border: handMeldValue >= openingThreshold ? '1px solid rgba(123,227,139,.6)' : '1px solid rgba(255,233,176,.3)',
            fontWeight: 700,
          }}
        >
          El toplamı: {handMeldValue}
          <span style={{ opacity: 0.7, fontWeight: 500 }}>
            {handMeldValue >= openingThreshold ? `✓ açabilirsin` : `/ ${openingThreshold}`}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <SlotRack
          layout={currentLayout}
          okey={view.okey}
          colorblind={settings.colorblind}
          repValue={settings.repValue}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
          onMove={(from, to) => setLayout(l => moveTile(l!, from, to))}
        />
        <DiscardZone
          onDropTile={() => {
            if (selectedSlot !== null) discardFromSlot(selectedSlot)
          }}
          highlight={isDiscardPhase}
        />
      </div>
      <div className="act" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
        {isMyTurn && view.turn.phase === 'DRAW' && (
          <>
            {legal.includes('DrawFromStock') && (
              <button onClick={() => send({ type: 'DrawFromStock', seat: view.seat })}>Stoktan Çek</button>
            )}
            {legal.includes('DrawFromDiscard') && (
              <button onClick={() => send({ type: 'DrawFromDiscard', seat: view.seat })}>Yerden Çek</button>
            )}
          </>
        )}
        {isMyTurn && view.turn.phase === 'DISCARD' && (
          <>
            <button onClick={handleHint}>💡 İpucu</button>
            {is101 && (
              <>
                {!view.you.hasOpened && (
                  <>
                    <button
                      disabled={!canOpenSeri}
                      title="İstakadaki perlerinle aç (toplam ≥101)"
                      onClick={() => {
                        if (canOpenSeri) send({ type: 'OpenMeld', seat: view.seat, melds: openSeriMelds })
                      }}
                    >
                      Aç (≥101)
                    </button>
                    <button
                      disabled={!canOpenCift}
                      title="5 çift ile aç"
                      onClick={() => {
                        if (canOpenCift) send({ type: 'OpenMeld', seat: view.seat, melds: openCiftMelds })
                      }}
                    >
                      Çift Aç (5)
                    </button>
                  </>
                )}
                {view.you.hasOpened && openRoute !== 'cift' && (
                  <button
                    disabled={layableMeld101 === null}
                    onClick={() => {
                      if (layableMeld101) send({ type: 'OpenMeld', seat: view.seat, melds: [layableMeld101] })
                    }}
                  >
                    Seri Aç
                  </button>
                )}
                {view.you.hasOpened && openRoute === 'cift' && (
                  <button
                    disabled={layablePairs101 === null}
                    onClick={() => {
                      if (layablePairs101) send({ type: 'OpenMeld', seat: view.seat, melds: layablePairs101 })
                    }}
                  >
                    Çift Aç
                  </button>
                )}
                <button
                  disabled={layOffTarget === null || !legal.includes('LayOff') || view.you.rack.length <= 1}
                  title={view.you.rack.length <= 1 ? 'Son taşını işleyemezsin — onu bitmek için atmalısın' : 'Yerdeki perlere taş işle'}
                  onClick={() => {
                    if (layOffTarget && view.you.rack.length > 1) send({ type: 'LayOff', seat: view.seat, meldIndex: layOffTarget.meldIndex, tiles: [layOffTarget.tile] })
                  }}
                >
                  İşle
                </button>
                <button
                  disabled={!legal.includes('DeclareCift')}
                  onClick={() => send({ type: 'DeclareCift', seat: view.seat })}
                >
                  Çifte Git
                </button>
              </>
            )}
          </>
        )}
        {isMyTurn && (
          <button onClick={handleArrange}>↺ Sırala</button>
        )}
        <button
          aria-label="Ayarlar"
          onClick={() => setShowSettings(v => !v)}
          style={{ fontSize: 18, padding: '6px 12px' }}
        >
          ⚙
        </button>
      </div>

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
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
            color: '#fff', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 18,
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
              className="act"
              onClick={handleNextHand}
              style={{ fontSize: 17, padding: '10px 28px', cursor: 'pointer' }}
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
