import { useEffect, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import { arrange, suggestDiscard, tilesEqual, findOpening, isValidMeldSet } from '@cs-okey/engine'
import type { LocalAdapter } from '../adapter/LocalAdapter'
import type { MatchState } from '../match'
import { Table } from '../components/Table'
import { Rack } from '../components/Rack'
import { Scoreboard } from '../components/Scoreboard'
import { TableMelds } from '../components/TableMelds'
import { loadSettings, saveSettings } from '../settings'
import { applyTheme } from '../theme/themes'

const NAMES = ['Sen', 'Ayşe', 'Mert', 'Can']

export default function GameScreen({ adapter }: { adapter: LocalAdapter }) {
  const [view, setView] = useState<PlayerView | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [order, setOrder] = useState<number[] | null>(null)
  const [match, setMatch] = useState<MatchState>(() => adapter.getMatch())
  const [settings, setSettings] = useState(() => loadSettings())
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() =>
    adapter.subscribe(
      (v) => {
        setView(v)
        setSel(null)
        setOrder(null)
        setMatch(adapter.getMatch())
      },
      () => {}
    ),
    [adapter]
  )

  if (!view) return null

  const isMyTurn = view.turn.seat === view.seat && view.status === 'PLAYING'

  // Displayed tiles: either raw rack or a visual reordering
  const displayedTiles = order !== null
    ? order.map(i => view.you.rack[i]!)
    : view.you.rack

  const send = (intent: GameEvent) => {
    void adapter.dispatch({ ...intent, expectedVersion: adapter.currentVersion() } as GameEvent & { expectedVersion: number })
  }

  const handleArrange = () => {
    if (!view.okey) return
    const result = arrange(view.you.rack, view.okey, view.config)
    const arranged = [...result.melds.flat(), ...result.leftovers]
    // Map each arranged tile back to an unused index in view.you.rack
    const usedIndices = new Set<number>()
    const newOrder: number[] = []
    for (const tile of arranged) {
      for (let i = 0; i < view.you.rack.length; i++) {
        if (!usedIndices.has(i) && tilesEqual(view.you.rack[i]!, tile)) {
          newOrder.push(i)
          usedIndices.add(i)
          break
        }
      }
    }
    // If any rack tiles weren't matched (shouldn't happen), append them
    for (let i = 0; i < view.you.rack.length; i++) {
      if (!usedIndices.has(i)) newOrder.push(i)
    }
    setOrder(newOrder)
  }

  const handleHint = () => {
    if (!view.okey) return
    const suggested = suggestDiscard(view.you.rack, view.okey, view.config)
    // Find in displayed order
    const idx = displayedTiles.findIndex(t => tilesEqual(t, suggested))
    if (idx !== -1) setSel(idx)
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

  return (
    <Table view={view}>
      {is101 && <TableMelds melds={view.tableMelds} />}
      <Rack
        tiles={displayedTiles}
        selectedIndex={sel}
        onSelect={setSel}
        colorblind={settings.colorblind}
        repValue={settings.repValue}
        okeyNumber={view.okey?.number}
      />
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
            <button disabled={sel === null} onClick={() => sel !== null && send({ type: 'Discard', seat: view.seat, tile: displayedTiles[sel]! })}>Taş At</button>
            <button disabled={sel === null} onClick={() => sel !== null && send({ type: 'DeclareWin', seat: view.seat, discardTile: displayedTiles[sel]! })}>Elimi Aç / Bitir</button>
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
  )
}
