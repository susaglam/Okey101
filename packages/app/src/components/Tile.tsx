import type { Tile } from '@cs-okey/engine'
import { tileToString } from '@cs-okey/engine'

const COLOR_CLASS: Record<string, string> = { RED: 'var(--c-red)', BLACK: 'var(--c-black)', BLUE: 'var(--c-blue)', YELLOW: 'var(--c-yellow)' }

const COLORBLIND_GLYPH: Record<string, string> = {
  RED: '●',
  BLACK: '■',
  BLUE: '▲',
  YELLOW: '◆',
}

export function TileView({
  tile,
  selected,
  onClick,
  testId = 'tile',
  colorblind,
  repValue,
  small,
  layable,
}: {
  tile: Tile
  selected?: boolean
  onClick?: () => void
  testId?: string | undefined
  colorblind?: boolean
  repValue?: number
  /** Compact size — used for table melds laid on the felt. */
  small?: boolean
  /** "İşlek": this tile can be laid off onto a meld already on the table. */
  layable?: boolean
}) {
  const isJoker = tile.kind === 'FALSE_JOKER'
  const label = isJoker ? 'sahte okey' : tileToString(tile)
  const color = tile.color ? COLOR_CLASS[tile.color] : '#7a4a1c'
  const glyph = colorblind && tile.color ? COLORBLIND_GLYPH[tile.color] : null
  const showRepValue = repValue !== undefined

  return (
    <button
      type="button"
      className={`okey-tile${selected ? ' sel' : ''}${small ? ' sm' : ''}`}
      data-testid={testId ?? undefined}
      aria-label={isJoker ? 'sahte okey' : label}
      onClick={onClick}
      style={{ color }}
    >
      <span>{isJoker ? '♣' : tile.number}</span>
      {glyph && (
        <span className="cb-glyph" style={{ fontSize: 10, lineHeight: 1 }}>{glyph}</span>
      )}
      <span className="hole" />
      {layable && (
        <span
          className="islek-dot"
          data-testid="islek-dot"
          aria-label="işlek taş"
          title="İşlek: yerdeki perlere işlenebilir"
          style={{
            position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: '50%',
            background: '#ff3b30', border: '1px solid rgba(255,255,255,.85)',
            boxShadow: '0 0 5px 1px rgba(255,59,48,.85)',
          }}
        />
      )}
      {showRepValue && (
        <span
          className="rep-value"
          style={{ position: 'absolute', top: 3, right: 4, fontSize: 9, fontWeight: 700, opacity: 0.8 }}
        >
          ={repValue}
        </span>
      )}
      <span className="tile-edge" aria-hidden="true" />
    </button>
  )
}
