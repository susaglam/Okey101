import type { ReactNode } from 'react'
import type { Tile } from '@cs-okey/engine'
import { tilesEqual } from '@cs-okey/engine'
import { useDroppable } from '@dnd-kit/core'
import { TileView } from './Tile'
import { orderMeldForDisplay, meldRepresentedValues } from '../rack/slots'

type Meld = { owner: number; kind: 'run' | 'group' | 'pair'; tiles: Tile[] }

const CELL_W = 40
const CELL_H = 52
const ROWS = 11

function isRealOkey(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && tilesEqual(t, okey)
}

/** A meld's lay-off drop target — spans `colSpan` columns starting at `colStart`. */
function RowDropTarget({ gi, enabled, row, colStart = 1, colSpan }: { gi: number; enabled: boolean; row: number; colStart?: number; colSpan: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `layoff:${gi}`, disabled: !enabled })
  return (
    <div
      ref={setNodeRef}
      data-testid={enabled ? 'layoff-target' : undefined}
      data-meld-index={gi}
      style={{
        gridColumn: `${colStart} / ${colStart + colSpan}`,
        gridRow: `${row + 1} / ${row + 2}`,
        borderRadius: 4,
        background: isOver && enabled ? 'rgba(90,209,196,.18)' : 'transparent',
        outline: isOver && enabled ? '2px solid #5ad1c4' : 'none',
        outlineOffset: -1,
        zIndex: 0,
      }}
    />
  )
}

/** Wrap an okey tile so a matching real tile can be dropped to take it back. */
function OkeyDropCell({ id, col, row, children }: { id: string; col: number; row: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      data-testid="take-okey-target"
      style={{
        gridColumn: `${col} / ${col + 1}`, gridRow: `${row + 1} / ${row + 2}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
        borderRadius: 6, outline: isOver ? '2px solid #5ad1c4' : '2px dashed rgba(90,209,196,.7)', outlineOffset: -2,
      }}
    >
      {children}
    </div>
  )
}

function cell(col: number, row: number): React.CSSProperties {
  return {
    gridColumn: `${col} / ${col + 1}`, gridRow: `${row + 1} / ${row + 2}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
  }
}

/** One grid area (runs / groups / pairs) with a cell-grid backdrop. */
function GridArea({
  cols, children, badge, title,
}: { cols: number; children: ReactNode; badge?: ReactNode; title?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        title={title}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${CELL_H}px)`,
          // Cell-grid backdrop.
          backgroundColor: 'rgba(0,0,0,.16)',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)',
          backgroundSize: `${CELL_W}px ${CELL_H}px`,
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 8,
        }}
      >
        {children}
      </div>
      {/* Badge slot below the area (always reserves height so areas stay aligned). */}
      <div style={{ minHeight: 22 }}>{badge}</div>
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <div style={{
      minWidth: 38, textAlign: 'center', padding: '2px 10px', borderRadius: 6,
      background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.18)',
      color: '#fff', fontFamily: 'system-ui', fontWeight: 800, fontSize: 14,
    }}>{children}</div>
  )
}

/**
 * The opening table laid in the CENTRE: three grid areas — runs (number-aligned,
 * 13 cols), same-number groups (4 cols), and pairs (4 cols) — with badges below
 * showing the highest seri opening value and the çift-open count.
 */
export function CenterMelds({
  melds, okey, takeOkeyEnabled, layoffEnabled, seriOpenValue, pairOpenCount,
}: {
  melds: Meld[]
  okey: Tile
  takeOkeyEnabled?: boolean
  layoffEnabled?: boolean
  /** Highest seri first-open value across players (0 → no seri opener yet). */
  seriOpenValue: number
  /** Çift first-open pair count (0 → no çift opener yet). */
  pairOpenCount: number
}) {
  // Keep each meld's GLOBAL index (lay-off / take-okey target ids use it).
  const indexed = melds.map((m, gi) => ({ ...m, gi }))
  const runs = indexed.filter((m) => m.kind === 'run')
  const groups = indexed.filter((m) => m.kind === 'group')
  const pairs = indexed.filter((m) => m.kind === 'pair')

  const renderMeldTiles = (m: Meld & { gi: number }, row: number, colFor: (ti: number, reps: (number | null)[]) => number) => {
    const ordered = orderMeldForDisplay(m.tiles, okey)
    const reps = meldRepresentedValues(ordered, okey)
    return ordered.map((tile, ti) => {
      const col = colFor(ti, reps)
      const tileEl = <TileView tile={tile} testId="table-meld-tile" small repValue={isRealOkey(tile, okey) || tile.kind === 'FALSE_JOKER' ? (reps[ti] ?? undefined) : undefined} />
      if (takeOkeyEnabled && isRealOkey(tile, okey)) {
        return <OkeyDropCell key={ti} id={`take-okey:${m.gi}:${ti}`} col={col} row={row}>{tileEl}</OkeyDropCell>
      }
      return <div key={ti} style={cell(col, row)}>{tileEl}</div>
    })
  }

  return (
    <div data-testid="center-melds" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, justifyContent: 'center', maxWidth: '100%', overflowX: 'auto' }}>
      {/* AREA A — runs, number-aligned (col = represented number 1-13). */}
      <GridArea
        cols={13}
        title="Seri perler (1–13)"
        badge={seriOpenValue > 0 ? <Badge>{seriOpenValue}</Badge> : undefined}
      >
        {runs.map((m, row) => (
          <RowDropTarget key={`r-${m.gi}`} gi={m.gi} enabled={!!layoffEnabled} row={row} colSpan={13} />
        ))}
        {runs.flatMap((m, row) =>
          renderMeldTiles(m, row, (ti, reps) => {
            const n = reps[ti]
            return n != null && n >= 1 && n <= 13 ? n : ti + 1
          }),
        )}
      </GridArea>

      {/* AREA B — same-number groups: 9 cols = 4 + 1 gap + 4, so TWO groups fit per
          row (cols 1–4 and 6–9). Up to 22 groups across 11 rows. */}
      <GridArea cols={9} title="Aynı sayı grupları">
        {groups.map((m, idx) => {
          const row = Math.floor(idx / 2)
          const startCol = idx % 2 === 0 ? 1 : 6
          return <RowDropTarget key={`g-${m.gi}`} gi={m.gi} enabled={!!layoffEnabled} row={row} colStart={startCol} colSpan={4} />
        })}
        {groups.flatMap((m, idx) => {
          const row = Math.floor(idx / 2)
          const startCol = idx % 2 === 0 ? 1 : 6
          return renderMeldTiles(m, row, (ti) => startCol + Math.min(ti, 3))
        })}
      </GridArea>

      {/* AREA C — pairs (4 cols → 2 pairs per row). */}
      <GridArea
        cols={4}
        title="Çiftler"
        badge={pairOpenCount > 0 ? <Badge>{`${pairOpenCount}${pairOpenCount}`}</Badge> : undefined}
      >
        {pairs.flatMap((m, pi) => {
          const row = Math.floor(pi / 2)
          const startCol = (pi % 2) * 2 + 1
          return renderMeldTiles(m, row, (ti) => startCol + Math.min(ti, 1))
        })}
      </GridArea>
    </div>
  )
}
