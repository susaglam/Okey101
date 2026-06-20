import type { ReactNode } from 'react'
import type { PlayerView, Tile } from '@cs-okey/engine'
import { tilesEqual } from '@cs-okey/engine'
import { useDroppable } from '@dnd-kit/core'
import { TileView } from './Tile'
import { orderMeldForDisplay, meldRepresentedValues } from '../rack/slots'
import { seatName } from '../names'

function ownerLabel(owner: number): string {
  return seatName(owner)
}

function isWild(t: Tile, okey: Tile): boolean {
  return t.kind === 'FALSE_JOKER' || tilesEqual(t, okey)
}

// Only the REAL okey tile (a NUMBER tile equal to okey) can be taken back —
// a false joker is a fixed plain tile, not a reusable wild.
function isRealOkey(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && tilesEqual(t, okey)
}

// Drop target wrapping a table-meld okey: drag your matching real tile here to
// take the okey back into your hand ("okeyi yerden alma"). Turquoise outline.
function DroppableOkey({ id, enabled, children }: { id: string; enabled: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled })
  return (
    <div
      ref={setNodeRef}
      data-testid="take-okey-target"
      style={{
        borderRadius: 7,
        outline: enabled ? (isOver ? '2px solid #5ad1c4' : '2px dashed rgba(90,209,196,.7)') : undefined,
        outlineOffset: 1,
        transition: 'outline-color .12s',
      }}
    >
      {children}
    </div>
  )
}

// Drop target wrapping a whole table meld: drag a rack tile here to lay it off
// onto THIS meld ("işle"). Gold outline, distinct from the okey target.
function DroppableMeld({ id, enabled, meldIndex, children }: { id: string; enabled: boolean; meldIndex: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled })
  return (
    <div
      ref={setNodeRef}
      data-testid={enabled ? 'layoff-target' : undefined}
      data-meld-index={meldIndex}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        borderRadius: 8,
        background: 'rgba(0,0,0,.18)',
        outline: enabled ? (isOver ? '2px solid #f0b24a' : '2px dashed rgba(240,178,74,.5)') : undefined,
        outlineOffset: 1,
        transition: 'outline-color .12s',
      }}
    >
      {children}
    </div>
  )
}

export function TableMelds({
  melds,
  okey,
  takeOkeyEnabled = false,
  layoffEnabled = false,
}: {
  melds: PlayerView['tableMelds']
  okey: Tile
  takeOkeyEnabled?: boolean
  /** When true, each non-pair meld becomes a lay-off drop target. */
  layoffEnabled?: boolean
}) {
  return (
    <div
      data-testid="table-melds"
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 8,
        minHeight: 24,
        width: '100%',
      }}
    >
      {melds.map((meld, idx) => {
        const ordered = orderMeldForDisplay(meld.tiles, okey)
        const reps = meldRepresentedValues(ordered, okey)
        return (
          <DroppableMeld
            key={idx}
            id={`layoff:${idx}`}
            meldIndex={idx}
            enabled={layoffEnabled && meld.kind !== 'pair'}
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
            {ordered.map((tile, ti) => {
              const tileEl = (
                <TileView
                  tile={tile}
                  testId="table-meld-tile"
                  small
                  repValue={isWild(tile, okey) ? (reps[ti] ?? undefined) : undefined}
                />
              )
              // Real okey tiles become drop targets so the player can swap in the
              // tile it represents and take the okey back.
              if (takeOkeyEnabled && isRealOkey(tile, okey)) {
                return (
                  <DroppableOkey key={ti} id={`take-okey:${idx}:${ti}`} enabled>
                    {tileEl}
                  </DroppableOkey>
                )
              }
              return <span key={ti}>{tileEl}</span>
            })}
          </DroppableMeld>
        )
      })}
    </div>
  )
}
