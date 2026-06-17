import { useEffect, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import type { LocalAdapter } from '../adapter/LocalAdapter'
import type { MatchState } from '../match'
import { Table } from '../components/Table'
import { Rack } from '../components/Rack'
import { Scoreboard } from '../components/Scoreboard'

const NAMES = ['Sen', 'Ayşe', 'Mert', 'Can']

export default function GameScreen({ adapter }: { adapter: LocalAdapter }) {
  const [view, setView] = useState<PlayerView | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [match, setMatch] = useState<MatchState>(() => adapter.getMatch())

  useEffect(() =>
    adapter.subscribe(
      (v) => {
        setView(v)
        setSel(null)
        setMatch(adapter.getMatch())
      },
      () => {}
    ),
    [adapter]
  )
  if (!view) return null

  const isMyTurn = view.turn.seat === view.seat && view.status === 'PLAYING'
  const send = (intent: GameEvent) => {
    void adapter.dispatch({ ...intent, expectedVersion: adapter.currentVersion() } as GameEvent & { expectedVersion: number })
  }

  const handleNextHand = () => {
    adapter.nextHand()
    setMatch(adapter.getMatch())
  }

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
      <Rack tiles={view.you.rack} selectedIndex={sel} onSelect={setSel} />
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
            <button disabled={sel === null} onClick={() => sel !== null && send({ type: 'Discard', seat: view.seat, tile: view.you.rack[sel]! })}>Taş At</button>
            <button disabled={sel === null} onClick={() => sel !== null && send({ type: 'DeclareWin', seat: view.seat, discardTile: view.you.rack[sel]! })}>Elimi Aç / Bitir</button>
          </>
        )}
      </div>
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
