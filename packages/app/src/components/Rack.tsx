import type { Tile } from '@cs-okey/engine'
import { TileView } from './Tile'

export function Rack({ tiles, selectedIndex, onSelect }:
  { tiles: Tile[]; selectedIndex: number | null; onSelect: (i: number) => void }) {
  const split = Math.ceil(tiles.length / 2)
  const back = tiles.slice(0, split); const front = tiles.slice(split)
  return (
    <div className="okey-rack">
      <div className="okey-tier">{back.map((t, i) =>
        <TileView key={i} tile={t} selected={selectedIndex === i} onClick={() => onSelect(i)} />)}</div>
      <div className="okey-tier">{front.map((t, i) =>
        <TileView key={split + i} tile={t} selected={selectedIndex === split + i} onClick={() => onSelect(split + i)} />)}</div>
    </div>
  )
}
