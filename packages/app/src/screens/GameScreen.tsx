import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import { suggestDiscard, tilesEqual, findOpening, findLayableMeld, findPairOpening, findLayablePairs, isValidMeldSet } from '@cs-okey/engine'
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
import { initLayout, reconcile, moveTile, autoArrange } from '../rack/slots'
import { interpretDragEnd } from '../utils/dragEnd'
import { captureRackFlip, runRackFlip } from '../anim/flip'

const NAMES = ['Sen', 'Ayşe', 'Mert', 'Can']
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

  useEffect(() =>
    adapter.subscribe(
      (v) => {
        setView(v)
        setLayout(prev => prev ? reconcile(prev, v.you.rack) : initLayout(v.you.rack, COLS))
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

  // findOpening result (null if can't open or already opened) — seri route
  const opening101 = is101 && view.okey && !view.you.hasOpened
    ? findOpening(view.you.rack, view.okey, view.config)
    : null

  // findPairOpening result — çift route initial open (5 pairs)
  const pairOpening101 = is101 && view.okey && !view.you.hasOpened
    ? findPairOpening(view.you.rack, view.okey, view.config)
    : null

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
    const winnerName = winnerSeat != null ? (NAMES[winnerSeat] ?? `Oyuncu ${winnerSeat}`) : 'Bilinmeyen'
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
  const matchWinnerName = NAMES[matchWinnerSeat] ?? `Oyuncu ${matchWinnerSeat}`

  const handleTakeDiscard = () => {
    send({ type: 'DrawFromDiscard', seat: view.seat })
  }

  // Guard: only allow discard when human is in DISCARD phase
  const isDiscardPhase = isMyTurn && view.turn.phase === 'DISCARD'

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const activeId = String(active.id)
    const overId = over ? String(over.id) : null

    const result = interpretDragEnd(activeId, overId)

    switch (result.action) {
      case 'draw-stock':
        send({ type: 'DrawFromStock', seat: view.seat })
        break

      case 'draw-floor':
        send({ type: 'DrawFromDiscard', seat: view.seat })
        break

      case 'discard': {
        // Only when it's the human's DISCARD turn
        if (!isDiscardPhase) return
        const tile = currentLayout[result.from]
        if (tile == null) return
        send({ type: 'Discard', seat: view.seat, tile })
        break
      }

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
    <Table view={view} onTakeDiscard={handleTakeDiscard}>
      {is101 && view.okey && <TableMelds melds={view.tableMelds} okey={view.okey} />}
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
            if (!isDiscardPhase) return
            const tile = selectedSlot !== null ? currentLayout[selectedSlot] : null
            if (tile != null) {
              send({ type: 'Discard', seat: view.seat, tile })
            }
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
                      disabled={opening101 === null}
                      onClick={() => {
                        if (opening101) send({ type: 'OpenMeld', seat: view.seat, melds: opening101 })
                      }}
                    >
                      Aç (≥101)
                    </button>
                    <button
                      disabled={pairOpening101 === null}
                      onClick={() => {
                        if (pairOpening101) send({ type: 'OpenMeld', seat: view.seat, melds: pairOpening101 })
                      }}
                    >
                      Çift Aç
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
                  disabled={layOffTarget === null || !legal.includes('LayOff')}
                  onClick={() => {
                    if (layOffTarget) send({ type: 'LayOff', seat: view.seat, meldIndex: layOffTarget.meldIndex, tiles: [layOffTarget.tile] })
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
            names={NAMES}
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
