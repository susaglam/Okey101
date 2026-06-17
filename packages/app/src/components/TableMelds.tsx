import type { PlayerView } from '@cs-okey/engine'
import { TileView } from './Tile'

const OWNER_LABELS: Record<number, string> = {
  0: 'Sen',
  1: 'O1',
  2: 'O2',
  3: 'O3',
}

function ownerLabel(owner: number): string {
  return OWNER_LABELS[owner] ?? `O${owner}`
}

export function TableMelds({ melds }: { melds: PlayerView['tableMelds'] }) {
  return (
    <div
      data-testid="table-melds"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 24,
        marginBottom: 8,
      }}
    >
      {melds.map((meld, idx) => (
        <div
          key={idx}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              opacity: 0.75,
              minWidth: 22,
              textAlign: 'right',
              color: '#fff',
            }}
          >
            {ownerLabel(meld.owner)}
          </span>
          {meld.tiles.map((tile, ti) => (
            <TileView key={ti} tile={tile} testId="table-meld-tile" />
          ))}
        </div>
      ))}
    </div>
  )
}
