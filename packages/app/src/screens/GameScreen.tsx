import { useEffect, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import { scoreHand } from '@cs-okey/engine'
import type { LocalAdapter } from '../adapter/LocalAdapter'
import { Table } from '../components/Table'
import { Rack } from '../components/Rack'

export default function GameScreen({ adapter }: { adapter: LocalAdapter }) {
  const [view, setView] = useState<PlayerView | null>(null)
  const [sel, setSel] = useState<number | null>(null)

  useEffect(() => adapter.subscribe((v) => { setView(v); setSel(null) }, () => {}), [adapter])
  if (!view) return null

  const isMyTurn = view.turn.seat === view.seat && view.status === 'PLAYING'
  const send = (intent: GameEvent) => { void adapter.dispatch({ ...intent, expectedVersion: adapter.currentVersion() } as GameEvent & { expectedVersion: number }) }

  return (
    <Table view={view}>
      <Rack tiles={view.you.rack} selectedIndex={sel} onSelect={setSel} />
      <div className="act" style={{ display:'flex',gap:10,justifyContent:'center',marginTop:12 }}>
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
        <div className="overlay" style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',color:'#fff',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,fontFamily:'system-ui' }}>
          {view.terminal?.reason === 'win'
            ? <h2>{view.terminal.winnerSeat === view.seat ? '🏆 Kazandın!' : 'El bitti'} — {view.terminal.winType === 'pairs' ? 'Çift' : 'Per'}</h2>
            : <h2>Berabere (stok bitti)</h2>}
          <pre style={{ fontSize:14 }}>{JSON.stringify(scoreHand({ ...stateShim(view) }), null, 0)}</pre>
        </div>
      )}
    </Table>
  )
}

// scoreHand needs a GameState-like terminal; build a minimal shim from the view for display only.
function stateShim(view: PlayerView) {
  return {
    gameId: 'x', config: view.config, rngSeed: 0, handNo: view.handNo, stock: [],
    indicator: view.indicator, okey: view.okey, turn: view.turn,
    players: [view.you, ...view.opponents.map((o) => ({ seat:o.seat, rack:[], discard:[], hasOpened:o.hasOpened, isOut:false }))],
    scores: view.scores, status: view.status, terminal: view.terminal,
  } as any
}
