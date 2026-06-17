import type { Tile } from '@cs-okey/engine'
import { tileToString } from '@cs-okey/engine'

const COLOR_CLASS: Record<string,string> = { RED:'var(--c-red)', BLACK:'var(--c-black)', BLUE:'var(--c-blue)', YELLOW:'var(--c-yellow)' }

export function TileView({ tile, selected, onClick }: { tile: Tile; selected?: boolean; onClick?: () => void }) {
  const isJoker = tile.kind === 'FALSE_JOKER'
  const label = isJoker ? 'sahte okey' : tileToString(tile)
  const color = tile.color ? COLOR_CLASS[tile.color] : '#7a4a1c'
  return (
    <button type="button" className={`okey-tile${selected ? ' sel' : ''}`} data-testid="tile"
      aria-label={isJoker ? 'sahte okey' : label} onClick={onClick} style={{ color }}>
      <span>{isJoker ? '♣' : tile.number}</span>
      <span className="hole" />
    </button>
  )
}
