import { useEffect, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import { suggestDiscard, tilesEqual, findOpening, isValidMeldSet } from '@cs-okey/engine'
import { DndContext } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import type { LocalAdapter } from '../adapter/LocalAdapter'
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

const NAMES = ['Sen', 'Ayşe', 'Mert', 'Can']
const COLS = 14

export default function GameScreen({ adapter }: { adapter: LocalAdapter }) {
  const [view, setView] = useState<PlayerView | null>(null)
  const [layout, setLayout] = useState<SlotLayout | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [match, setMatch] = useState<MatchState>(() => adapter.getMatch())
  const [settings, setSettings] = useState(() => loadSettings())
  const [showSettings, setShowSettings] = useState(false)

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

  // The current layout (fall back to fresh initLayout if state hasn't been set yet)
  const currentLayout: SlotLayout = layout ?? initLayout(view.you.rack, COLS)

  // The tile in the selected slot (null if slot is empty or no selection)
  const selectedTile = selectedSlot !== null ? currentLayout[selectedSlot] ?? null : null

  const send = (intent: GameEvent) => {
    void adapter.dispatch({ ...intent, expectedVersion: adapter.currentVersion() } as GameEvent & { expectedVersion: number })
  }

  const handleArrange = () => {
    if (!view.okey) return
    setLayout(autoArrange(view.you.rack, view.okey, view.config, COLS))
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

  // findOpening result (null if can't open or already opened)
  const opening101 = is101 && view.okey && !view.you.hasOpened
    ? findOpening(view.you.rack, view.okey, view.config)
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
    const winnerName = NAMES[view.terminal.winnerSeat] ?? `Oyuncu ${view.terminal.winnerSeat}`
    const winTypeLabel = view.terminal.winType === 'pairs' ? 'Çift' : 'Per'
    handResultLine = view.terminal.winnerSeat === view.seat
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
    if (!over) return

    const fromSlot = Number(active.id as string)

    if (over.id === 'discard') {
      // Drag to discard zone — only when it's the human's DISCARD turn
      if (!isDiscardPhase) return
      const tile = currentLayout[fromSlot]
      if (tile == null) return
      send({ type: 'Discard', seat: view.seat, tile })
    } else {
      // Drag to another slot — rearrange
      const toSlot = Number(over.id as string)
      if (fromSlot !== toSlot) {
        setLayout(l => moveTile(l!, fromSlot, toSlot))
      }
    }
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
    <Table view={view} onTakeDiscard={handleTakeDiscard}>
      {is101 && <TableMelds melds={view.tableMelds} okey={view.okey} />}
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
            <button onClick={() => send({ type: 'DrawFromStock', seat: view.seat })}>Stoktan Çek</button>
            {view.opponents.some((o) => o.seat === (view.seat - 1 + view.config.players) % view.config.players && o.discardCount > 0) && (
              <button onClick={() => send({ type: 'DrawFromDiscard', seat: view.seat })}>Yerden Çek</button>
            )}
          </>
        )}
        {isMyTurn && view.turn.phase === 'DISCARD' && (
          <>
            <button onClick={handleHint}>💡 İpucu</button>
            {is101 && (
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
                  disabled={layOffTarget === null}
                  onClick={() => {
                    if (layOffTarget) send({ type: 'LayOff', seat: view.seat, meldIndex: layOffTarget.meldIndex, tiles: [layOffTarget.tile] })
                  }}
                >
                  İşle
                </button>
                <button
                  disabled={!!view.you.declaredCift}
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
