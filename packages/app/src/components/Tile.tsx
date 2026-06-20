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
  plain,
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
  /** Render as a normal ivory tile even for a FALSE_JOKER (no gold body). Used by
   *  the gösterge, which must always look like a normal okey tile. */
  plain?: boolean
}) {
  const isJoker = tile.kind === 'FALSE_JOKER'
  const label = isJoker ? 'sahte okey' : tileToString(tile)
  const color = tile.color ? COLOR_CLASS[tile.color] : '#7a4a1c'
  const glyph = colorblind && tile.color ? COLORBLIND_GLYPH[tile.color] : null
  const showRepValue = repValue !== undefined

  return (
    <button
      type="button"
      className={`okey-tile${selected ? ' sel' : ''}${small ? ' sm' : ''}${plain ? ' plain' : ''}`}
      data-testid={testId ?? undefined}
      aria-label={isJoker ? 'sahte okey' : label}
      onClick={onClick}
      style={{ color }}
    >
      <span>{isJoker ? '♣' : tile.number}</span>
      {glyph && (
        <span className="cb-glyph" style={{ fontSize: 10, lineHeight: 1 }}>{glyph}</span>
      )}
      {/* The round hole turns red when this tile is "işlek" (layable onto a table
          meld) — clearer than a top-corner dot, which overlapped the number. */}
      <span
        className={`hole${layable ? ' islek' : ''}`}
        data-testid={layable ? 'islek-dot' : undefined}
        title={layable ? 'İşlek: yerdeki perlere işlenebilir' : undefined}
      />
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
