import { useDroppable } from '@dnd-kit/core'
import type { Tile } from '@cs-okey/engine'
import { TileView } from './Tile'

/**
 * The human's single discard spot: it both SHOWS the tiles the player has thrown
 * (top tile + count) and acts as the drop/click target for discarding. When it is
 * the player's turn to discard it lights up and reads "↓ Taş At". This merges the
 * old separate "AT" zone and the bottom discard pile into one place.
 */
export function MyDiscardTarget({
  topTile,
  count,
  active,
  onDropTile,
  okey,
  colorblind,
  repValue,
}: {
  topTile?: Tile
  count: number
  active?: boolean
  onDropTile: () => void
  okey?: Tile
  colorblind?: boolean
  repValue?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'discard' })
  const hot = isOver || !!active
  // Render the thrown tile EXACTLY as it appears in the rack — same colours, same
  // FALSE_JOKER rep-value — so the discard spot never alters the tile's look.
  const tileRepValue =
    topTile && repValue && topTile.kind === 'FALSE_JOKER' && okey?.number !== undefined
      ? okey.number
      : undefined

  return (
    <div
      ref={setNodeRef}
      data-testid="discard-zone"
      onClick={onDropTile}
      title="Taşı buraya at"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 6,
        borderRadius: 10,
        cursor: active ? 'pointer' : 'default',
        // Only the OUTER border (turquoise — never yellow) lights up on your turn;
        // the tile inside keeps its own colours.
        border: hot ? '3px solid #5ad1c4' : '2px dashed rgba(255,255,255,.22)',
        background: 'rgba(0,0,0,.18)',
        boxShadow: hot ? '0 0 10px 2px rgba(90,209,196,.55)' : 'none',
        transition: 'border-color .15s, box-shadow .15s',
        minWidth: 48,
      }}
    >
      {topTile ? (
        <TileView tile={topTile} testId="my-discard-top" colorblind={colorblind} repValue={tileRepValue} />
      ) : (
        <div
          style={{
            width: 'var(--tile-w, 34px)',
            height: 'var(--tile-h, 46px)',
            borderRadius: 6,
            border: '1px dashed rgba(255,255,255,.2)',
            background: 'rgba(0,0,0,.1)',
          }}
        />
      )}
      <span style={{ fontSize: 11, fontWeight: 800, color: hot ? '#5ad1c4' : 'rgba(255,255,255,.65)' }}>
        {hot ? '↓ Taş At' : count > 0 ? count : 'AT'}
      </span>
    </div>
  )
}
