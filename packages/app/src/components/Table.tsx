import type { ReactNode } from 'react'
import type { PlayerView } from '@cs-okey/engine'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Seat } from './Seat'
import { DiscardPile } from './DiscardPile'
import { seatName } from '../names'

// ── DraggableFloorPile ───────────────────────────────────────────────────────
// Wraps the takeable floor pile (DiscardPile) with a dnd-kit draggable.
// Only rendered when takeablePile is true.
function DraggableFloorPile({
  topTile,
  count,
  onTake,
  seat,
}: {
  topTile: Parameters<typeof DiscardPile>[0]['topTile']
  count: number
  onTake?: () => void
  seat?: number
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: 'draw-floor',
  })

  return (
    <div
      ref={setNodeRef}
      data-testid="draw-floor"
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.75 : 1,
        zIndex: isDragging ? 100 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      {...listeners}
      {...attributes}
    >
      <DiscardPile
        topTile={topTile}
        count={count}
        takeable={true}
        onTake={onTake}
        seat={seat}
      />
    </div>
  )
}

// Seat layout:
//   view.seat = 0 (human) = BOTTOM
//   seat 1 = RIGHT  (nextSeat(0)=1)
//   seat 2 = TOP
//   seat 3 = LEFT   (leftSeat(0)=3, human takes from seat 3's discard)
//
// Discard pile positions (between seat and its right-neighbour):
//   seat 0's discard → bottom-right area (between bottom and right)
//   seat 1's discard → right-top area (between right and top)
//   seat 2's discard → top-left area (between top and left)
//   seat 3's discard → left-bottom area (between left and bottom) = human's takeable pile

// Map a seat number to its visual position name
function seatPosition(seat: number, humanSeat: number): 'top' | 'left' | 'right' {
  const offset = (seat - humanSeat + 4) % 4
  if (offset === 1) return 'right'
  if (offset === 2) return 'top'
  return 'left' // offset === 3
}

export function Table({
  view,
  children,
  onTakeDiscard,
  standings,
  tableMelds,
}: {
  view: PlayerView
  children?: ReactNode
  onTakeDiscard?: () => void
  /** Running match standings (seat-indexed), accumulated from completed hands. */
  standings?: number[]
  /** Opened melds shown in the CENTRE of the table (height-capped + scrollable so
   * they never push the rack off-screen). */
  tableMelds?: ReactNode
}) {
  // Find opponents by relative position
  const rightOpponent = view.opponents.find(o => (o.seat - view.seat + 4) % 4 === 1)
  const topOpponent = view.opponents.find(o => (o.seat - view.seat + 4) % 4 === 2)
  const leftOpponent = view.opponents.find(o => (o.seat - view.seat + 4) % 4 === 3)

  // Takeable condition: it's our DRAW turn and left opponent's pile is non-empty
  const isMyDrawTurn = view.turn.seat === view.seat && view.turn.phase === 'DRAW'
  const leftPileCount = leftOpponent?.discardCount ?? 0
  const takeablePile = isMyDrawTurn && leftPileCount > 0

  const outerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    minHeight: 520,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    color: '#fff',
    fontFamily: 'system-ui',
    boxSizing: 'border-box',
  }

  // Center panel styles
  const centerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  }

  return (
    <div className="felt" style={outerStyle}>
      {/* TOP ROW: top seat + its discard pile */}
      <div style={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'flex-start', gap: 24 }}>
        {topOpponent && (
          <>
            {/* Top seat discards toward the LEFT seat → its pile sits to its left. */}
            <DiscardPile
              topTile={topOpponent.discardTop}
              count={topOpponent.discardCount}
              takeable={false}
              seat={topOpponent.seat}
            />
            <Seat
              name={seatName(topOpponent.seat)}
              seat={topOpponent.seat}
              count={topOpponent.rackCount}
              isTurn={view.turn.seat === topOpponent.seat}
              position="top"
              score={standings?.[topOpponent.seat]}
              stack
            />
          </>
        )}
      </div>

      {/* OPENED MELDS: full-width band, wraps horizontally (no scrollbars) */}
      {tableMelds && (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
          {tableMelds}
        </div>
      )}

      {/* MIDDLE ROW: left seat | center | right seat */}
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', flex: 1, margin: '8px 0' }}>
        {/* LEFT side: seat 3 + its discard pile BELOW it (bottom-left corner). This
            is the human's takeable pile — seat 3 discards toward the human. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {leftOpponent && (
            <Seat
              name={seatName(leftOpponent.seat)}
              seat={leftOpponent.seat}
              count={leftOpponent.rackCount}
              isTurn={view.turn.seat === leftOpponent.seat}
              position="left"
              score={standings?.[leftOpponent.seat]}
              stack
            />
          )}
          {/* Seat 3's discard = human's takeable pile */}
          {leftOpponent && (
            takeablePile ? (
              <DraggableFloorPile
                topTile={leftOpponent.discardTop}
                count={leftOpponent.discardCount}
                onTake={onTakeDiscard}
                seat={leftOpponent.seat}
              />
            ) : (
              <DiscardPile
                topTile={leftOpponent.discardTop}
                count={leftOpponent.discardCount}
                takeable={false}
                seat={leftOpponent.seat}
              />
            )
          )}
        </div>

        {/* CENTER: just the turn-direction arrow. The draw stock + gösterge moved to
            the rack's upper-right (rendered by GameScreen). */}
        <div style={centerStyle}>
          <div style={{ fontSize: 18, opacity: 0.7 }}>↻</div>
        </div>

        {/* RIGHT side: seat 1 + its discard pile ABOVE it (top-right corner) —
            seat 1 discards toward the top seat. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {rightOpponent && (
            <DiscardPile
              topTile={rightOpponent.discardTop}
              count={rightOpponent.discardCount}
              takeable={false}
              seat={rightOpponent.seat}
            />
          )}
          {rightOpponent && (
            <Seat
              name={seatName(rightOpponent.seat)}
              seat={rightOpponent.seat}
              count={rightOpponent.rackCount}
              isTurn={view.turn.seat === rightOpponent.seat}
              position="right"
              score={standings?.[rightOpponent.seat]}
              stack
            />
          )}
        </div>
      </div>

      {/* BOTTOM: action bar + human nameplate + rack (rendered by GameScreen). The
          human's discard spot now lives in the action bar (MyDiscardTarget), so there
          is no separate bottom discard pile here. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
        <div style={{ width: '100%' }}>{children}</div>
      </div>
    </div>
  )
}
