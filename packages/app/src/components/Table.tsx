import type { ReactNode } from 'react'
import type { PlayerView } from '@cs-okey/engine'
import { tileToString } from '@cs-okey/engine'
import { Seat } from './Seat'
import { TileView } from './Tile'

const BOT_NAMES = ['Ayşe','Mert','Can','Arda','Elif']
export function Table({ view, children }: { view: PlayerView; children?: ReactNode }) {
  return (
    <div className="felt" style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'space-between',padding:16,color:'#fff',fontFamily:'system-ui' }}>
      <div style={{ display:'flex',gap:40,width:'100%',justifyContent:'space-between' }}>
        {view.opponents.map((o, i) => (
          <Seat key={o.seat} name={BOT_NAMES[i % BOT_NAMES.length]!} count={o.rackCount} isTurn={view.turn.seat === o.seat} />
        ))}
      </div>
      <div style={{ display:'flex',gap:18,alignItems:'center',margin:'18px 0' }}>
        <div data-testid="stock-count" style={{ background:'rgba(0,0,0,.35)',borderRadius:8,padding:'14px 18px',fontWeight:800 }}>
          STOK {view.stockCount}
        </div>
        {view.indicator && (
          <div data-testid="gosterge" style={{ textAlign:'center' }}>
            <TileView tile={view.indicator} testId="gosterge-tile" />
            <div style={{ fontSize:11,opacity:.8 }}>okey: {view.okey ? tileToString(view.okey) : '-'}</div>
          </div>
        )}
        {view.opponents.map((o) => o.discardTop ? (
          <div key={`d${o.seat}`} style={{ opacity:.85 }}><TileView tile={o.discardTop} testId="discard-tile" /></div>
        ) : null)}
      </div>
      <div>{children}</div>
    </div>
  )
}
