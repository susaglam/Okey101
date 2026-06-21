import type { ReactNode } from 'react'
import type { Tile } from '@cs-okey/engine'
import { tilesEqual } from '@cs-okey/engine'
import { useDroppable } from '@dnd-kit/core'
import { TileView } from './Tile'
import { orderMeldForDisplay, meldRepresentedValues, meldRepresentedColors } from '../rack/slots'

type Meld = { owner: number; kind: 'run' | 'group' | 'pair'; tiles: Tile[] }

const CELL_W = 40
const CELL_H = 52
const MIN_ROWS = 2 // keep a small board even when nearly empty

function isRealOkey(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && tilesEqual(t, okey)
}

/**
 * A meld's lay-off drop target — spans `colSpan` columns starting at `colStart`.
 * The span is sized to HUG the meld's tiles (not the full grid width) so the
 * droppable's rect sits directly over the visible tiles — both pointer-based and
 * distance-based collision then resolve to the meld the player is aiming at.
 *
 * `valid` (a legal target for the tile currently being dragged) shows a green
 * dashed outline so the player sees where they may drop; `isOver` shows a solid
 * turquoise highlight on the meld under the cursor.
 */
function RowDropTarget({ gi, enabled, valid, row, colStart = 1, colSpan }: { gi: number; enabled: boolean; valid?: boolean; row: number; colStart?: number; colSpan: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `layoff:${gi}`, disabled: !enabled })
  const active = isOver && enabled
  return (
    <div
      ref={setNodeRef}
      data-testid={enabled ? 'layoff-target' : undefined}
      data-meld-index={gi}
      style={{
        gridColumn: `${colStart} / ${colStart + colSpan}`,
        gridRow: `${row + 1} / ${row + 2}`,
        borderRadius: 4,
        background: active ? 'rgba(90,209,196,.22)' : valid ? 'rgba(90,209,196,.10)' : 'transparent',
        outline: active ? '2px solid #5ad1c4' : valid ? '2px dashed rgba(90,209,196,.85)' : 'none',
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

/** One grid area (runs / groups / pairs) with a cell-grid backdrop.
 *  `rows` is dynamic (only as many as the melds need) so the board never grows
 *  taller than its content — no vertical overflow into the nameplate, no scroll. */
function GridArea({
  cols, rows, children, badge, title,
}: { cols: number; rows: number; children: ReactNode; badge?: ReactNode; title?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        title={title}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
          gridTemplateRows: `repeat(${rows}, ${CELL_H}px)`,
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
  melds, okey, takeOkeyEnabled, layoffEnabled, validTargetIndices, seriOpenValue, pairOpenCount,
}: {
  melds: Meld[]
  okey: Tile
  takeOkeyEnabled?: boolean
  layoffEnabled?: boolean
  /** Global meld indices that are legal lay-off targets for the tile being dragged. */
  validTargetIndices?: Set<number>
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

  // Dynamic row count — each area is only as tall as its melds need (runs: one per
  // row; groups & pairs: two per row). Shared across the three areas so their tops
  // align. No fixed 11-row board → it never overflows into the top nameplate, and
  // no scroll is ever needed.
  const rows = Math.max(MIN_ROWS, runs.length, Math.ceil(groups.length / 2), Math.ceil(pairs.length / 2))

  const renderMeldTiles = (m: Meld & { gi: number }, row: number, colFor: (ti: number, reps: (number | null)[]) => number) => {
    const ordered = orderMeldForDisplay(m.tiles, okey)
    const reps = meldRepresentedValues(ordered, okey)
    const repColors = meldRepresentedColors(ordered, okey)
    // A FALSE_JOKER is a fixed-value tile (not a true wild); in a run it blends in as
    // the run's own colour so no "wrong colour" tile appears in a per.
    const runColor = m.kind === 'run'
      ? m.tiles.find((t) => t.kind === 'NUMBER' && !tilesEqual(t, okey))?.color
      : undefined
    return ordered.map((tile, ti) => {
      const col = colFor(ti, reps)
      // Key MUST be unique across the whole GridArea: every meld's tiles are
      // flat-mapped into the SAME grid parent, so a bare `ti` (0,1,2…) collides
      // between melds. Prefix with the global meld index.
      const key = `${m.gi}-${ti}`
      const rep = reps[ti]

      // REAL OKEY laid on the table → blank (face-down) ivory tile + a badge showing
      // the value it stands in for, coloured by that value's colour.
      if (isRealOkey(tile, okey)) {
        const repColor = repColors[ti] ?? runColor
        const tileEl = (
          <TileView
            tile={tile}
            testId="table-meld-tile"
            small
            isOkey
            okeyRep={rep != null ? { number: rep, color: repColor ?? undefined } : undefined}
          />
        )
        if (takeOkeyEnabled) {
          return <OkeyDropCell key={key} id={`take-okey:${m.gi}:${ti}`} col={col} row={row}>{tileEl}</OkeyDropCell>
        }
        return <div key={key} style={cell(col, row)}>{tileEl}</div>
      }

      // FALSE_JOKER blends into a run as the run's colour; elsewhere shows its own
      // face + represented number. Normal tiles render as themselves.
      const isFalse = tile.kind === 'FALSE_JOKER'
      const displayTile: Tile = isFalse && runColor && rep != null
        ? { kind: 'NUMBER', number: rep, color: runColor }
        : tile
      const tileEl = (
        <TileView
          tile={displayTile}
          testId="table-meld-tile"
          small
          repValue={isFalse && displayTile === tile ? (rep ?? undefined) : undefined}
        />
      )
      return <div key={key} style={cell(col, row)}>{tileEl}</div>
    })
  }

  return (
    <div data-testid="center-melds" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, justifyContent: 'center', maxWidth: '100%', overflowX: 'auto' }}>
      {/* AREA A — runs, number-aligned (col = represented number 1-13). */}
      <GridArea
        cols={13}
        rows={rows}
        title="Seri perler"
        badge={seriOpenValue > 0 ? <Badge>{seriOpenValue}</Badge> : undefined}
      >
        {/* Full-row drop target (cols 1-13): one run per row, so dropping anywhere
            on the row extends THAT run — the empty columns before/after the tiles
            are exactly the valid front/back işle spots. pointerWithin keeps it precise. */}
        {runs.map((m, row) => (
          <RowDropTarget key={`r-${m.gi}`} gi={m.gi} enabled={!!layoffEnabled} valid={validTargetIndices?.has(m.gi)} row={row} colSpan={13} />
        ))}
        {/* NUMBER-ALIGNED: each tile sits in the COLUMN of the number it represents
            (1→col1 … 13→col13), one run per row. So 8-9-10 sits under columns 8-10
            and the gaps show exactly where a tile can be işle'd. Two runs never share
            a row, so different colours never visually merge. */}
        {runs.flatMap((m, row) => renderMeldTiles(m, row, (ti, reps) => Math.min(Math.max(reps[ti] ?? ti + 1, 1), 13)))}
      </GridArea>

      {/* AREA B — same-number groups: 9 cols = 4 + 1 gap + 4, so TWO groups fit per
          row (cols 1–4 and 6–9). Up to 22 groups across 11 rows. */}
      <GridArea cols={9} rows={rows} title="Aynı sayı grupları">
        {groups.map((m, idx) => {
          const row = Math.floor(idx / 2)
          const startCol = idx % 2 === 0 ? 1 : 6
          return <RowDropTarget key={`g-${m.gi}`} gi={m.gi} enabled={!!layoffEnabled} valid={validTargetIndices?.has(m.gi)} row={row} colStart={startCol} colSpan={Math.min(m.tiles.length, 4)} />
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
        rows={rows}
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
