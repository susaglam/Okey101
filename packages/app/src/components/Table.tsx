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
        // Moving copy is rendered in GameScreen's DragOverlay; keep the original in
        // place (dimmed), no drag transform — so it isn't clipped under the rack.
        transform: isDragging ? undefined : CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
        zIndex: 1,
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
  humanDiscard,
  turnTimer,
}: {
  view: PlayerView
  children?: ReactNode
  onTakeDiscard?: () => void
  /** Running match standings (seat-indexed), accumulated from completed hands. */
  standings?: number[]
  /** Opened melds shown in the CENTRE of the table. */
  tableMelds?: ReactNode
  /** The human's discard target, placed at the bottom-right corner of the play area. */
  humanDiscard?: ReactNode
  /** Active turn countdown (online) — drawn as a ring around the active opponent. */
  turnTimer?: { seat: number; budgetMs: number; deadlineMs: number } | null
}) {
  const ringFor = (seat: number) =>
    turnTimer && turnTimer.seat === seat ? { turnDeadlineMs: turnTimer.deadlineMs, turnBudgetMs: turnTimer.budgetMs } : {}
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
    minHeight: '100vh', // fill the screen height — the play area (flex:1) expands
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    color: '#fff',
    fontFamily: 'system-ui',
    boxSizing: 'border-box',
  }

  return (
    <div className="felt" style={outerStyle}>
      {/* PLAY AREA: opponents at the edges, each discard pile at a corner, the
          CENTRE kept empty (opened melds shown there for now; reserved for the
          opening layout). Each player discards toward the player on their right,
          so the pile sits in the corner between them. */}
      <div style={{ position: 'relative', flex: 1, width: '100%', minHeight: 340 }}>
        {/* TOP seat — card centred at the top; its discard stays in the TOP-LEFT
            corner (out of the centre meld area). */}
        {topOpponent && (
          <>
            {/* Centred again now that the centre meld area sits lower (top:58) and no
                longer collides with a top-centre card (PO 2026-06-23). */}
            <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 6 }}>
              <Seat name={seatName(topOpponent.seat)} seat={topOpponent.seat} count={topOpponent.rackCount} isTurn={view.turn.seat === topOpponent.seat} position="top" score={standings?.[topOpponent.seat]} penalties={topOpponent.penalties} stack {...ringFor(topOpponent.seat)} />
            </div>
            <div style={{ position: 'absolute', top: 60, left: 14 }}>
              <DiscardPile topTile={topOpponent.discardTop} count={topOpponent.discardCount} takeable={false} seat={topOpponent.seat} />
            </div>
          </>
        )}
        {/* RIGHT seat (Aras) — right edge; its discard at the TOP-RIGHT corner. */}
        {rightOpponent && (
          <>
            <div style={{ position: 'absolute', right: 4, top: '46%', transform: 'translateY(-50%)' }}>
              <Seat name={seatName(rightOpponent.seat)} seat={rightOpponent.seat} count={rightOpponent.rackCount} isTurn={view.turn.seat === rightOpponent.seat} position="right" score={standings?.[rightOpponent.seat]} penalties={rightOpponent.penalties} stack {...ringFor(rightOpponent.seat)} />
            </div>
            {/* Pushed below the fixed top-right UI buttons (stats/help/settings)
                so they never overlap this discard pile. */}
            <div style={{ position: 'absolute', top: 58, right: 8 }}>
              <DiscardPile topTile={rightOpponent.discardTop} count={rightOpponent.discardCount} takeable={false} seat={rightOpponent.seat} />
            </div>
          </>
        )}
        {/* LEFT seat (Gamze) — left edge; its discard at the BOTTOM-LEFT corner
            (the human's takeable pile — left seat discards toward the human). */}
        {leftOpponent && (
          <>
            <div style={{ position: 'absolute', left: 4, top: '46%', transform: 'translateY(-50%)' }}>
              <Seat name={seatName(leftOpponent.seat)} seat={leftOpponent.seat} count={leftOpponent.rackCount} isTurn={view.turn.seat === leftOpponent.seat} position="left" score={standings?.[leftOpponent.seat]} penalties={leftOpponent.penalties} stack {...ringFor(leftOpponent.seat)} />
            </div>
            <div style={{ position: 'absolute', bottom: 6, left: 8 }}>
              {takeablePile ? (
                <DraggableFloorPile topTile={leftOpponent.discardTop} count={leftOpponent.discardCount} onTake={onTakeDiscard} seat={leftOpponent.seat} />
              ) : (
                <DiscardPile topTile={leftOpponent.discardTop} count={leftOpponent.discardCount} takeable={false} seat={leftOpponent.seat} />
              )}
            </div>
          </>
        )}
        {/* BOTTOM-RIGHT corner: the human's own discard target. */}
        {humanDiscard && (
          <div style={{ position: 'absolute', bottom: 6, right: 8 }}>{humanDiscard}</div>
        )}
        {/* CENTRE: opened melds (otherwise empty). Starts BELOW the top nameplate
            (top:58) and leaves a bottom margin so it never sits under the top
            seat card or the bottom corners. */}
        {tableMelds && (
          <div style={{ position: 'absolute', top: 58, bottom: 12, left: 96, right: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            {tableMelds}
          </div>
        )}
      </div>

      {/* BOTTOM: action bar + rack (rendered by GameScreen). */}
      <div style={{ width: '100%' }}>{children}</div>
    </div>
  )
}
