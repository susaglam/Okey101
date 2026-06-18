import type { PlayerView, Tile } from '@cs-okey/engine'
import { tilesEqual } from '@cs-okey/engine'
import { TileView } from './Tile'
import { orderMeldForDisplay, meldRepresentedValues } from '../rack/slots'

const OWNER_LABELS: Record<number, string> = {
  0: 'Sen',
  1: 'O1',
  2: 'O2',
  3: 'O3',
}

function ownerLabel(owner: number): string {
  return OWNER_LABELS[owner] ?? `O${owner}`
}

function isWild(t: Tile, okey: Tile): boolean {
  return t.kind === 'FALSE_JOKER' || tilesEqual(t, okey)
}

export function TableMelds({ melds, okey }: { melds: PlayerView['tableMelds']; okey: Tile }) {
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
      {melds.map((meld, idx) => {
        const ordered = orderMeldForDisplay(meld.tiles, okey)
        const reps = meldRepresentedValues(ordered, okey)
        return (
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
            {ordered.map((tile, ti) => (
              <TileView
                key={ti}
                tile={tile}
                testId="table-meld-tile"
                repValue={isWild(tile, okey) ? (reps[ti] ?? undefined) : undefined}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
