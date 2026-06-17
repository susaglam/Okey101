import type { Tile } from '@cs-okey/engine'
import { TileView } from './Tile'

export function DiscardPile({
  topTile,
  count,
  takeable,
  onTake,
}: {
  topTile?: Tile
  count: number
  takeable?: boolean
  onTake?: () => void
}) {
  const glowStyle: React.CSSProperties = takeable
    ? {
        boxShadow: '0 0 0 3px #5ad1c4, 0 0 16px 4px #5ad1c4',
        borderRadius: 10,
      }
    : {}

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    cursor: takeable ? 'pointer' : 'default',
    ...glowStyle,
  }

  const emptyStyle: React.CSSProperties = {
    width: 36,
    height: 48,
    borderRadius: 6,
    border: '1px dashed rgba(255,255,255,0.25)',
    background: 'rgba(0,0,0,0.15)',
  }

  const badgeStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.45)',
    color: '#fff',
    borderRadius: 6,
    padding: '1px 6px',
    fontSize: 11,
    fontWeight: 700,
  }

  return (
    <div
      data-testid="discard-pile"
      data-takeable={takeable ? 'true' : undefined}
      style={containerStyle}
      onClick={takeable ? onTake : undefined}
      role={takeable ? 'button' : undefined}
      aria-label={takeable ? 'Yerden çek' : undefined}
      tabIndex={takeable ? 0 : undefined}
      onKeyDown={
        takeable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onTake?.()
            }
          : undefined
      }
    >
      {topTile ? (
        <TileView tile={topTile} testId="discard-top-tile" />
      ) : (
        <div style={emptyStyle} />
      )}
      <span style={badgeStyle}>{count}</span>
    </div>
  )
}
