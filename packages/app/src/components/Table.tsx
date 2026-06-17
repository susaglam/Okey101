import type { ReactNode } from 'react'
import type { PlayerView } from '@cs-okey/engine'
import { tileToString } from '@cs-okey/engine'
import { Seat } from './Seat'
import { TileView } from './Tile'
import { DiscardPile } from './DiscardPile'

const BOT_NAMES = ['Ayşe', 'Mert', 'Can', 'Arda', 'Elif']

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
}: {
  view: PlayerView
  children?: ReactNode
  onTakeDiscard?: () => void
}) {
  // Find opponents by relative position
  const rightOpponent = view.opponents.find(o => (o.seat - view.seat + 4) % 4 === 1)
  const topOpponent = view.opponents.find(o => (o.seat - view.seat + 4) % 4 === 2)
  const leftOpponent = view.opponents.find(o => (o.seat - view.seat + 4) % 4 === 3)

  // Human's own discard
  const myDiscardTop = view.you.discard.length > 0 ? view.you.discard[view.you.discard.length - 1] : undefined
  const myDiscardCount = view.you.discard.length

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

  const centerRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  }

  return (
    <div className="felt" style={outerStyle}>
      {/* TOP ROW: top seat + its discard pile */}
      <div style={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'flex-start', gap: 24 }}>
        {topOpponent && (
          <>
            <Seat
              name={BOT_NAMES[(topOpponent.seat) % BOT_NAMES.length]!}
              count={topOpponent.rackCount}
              isTurn={view.turn.seat === topOpponent.seat}
              position="top"
            />
            {/* seat 2's discard pile sits between top and left */}
            <DiscardPile
              topTile={topOpponent.discardTop}
              count={topOpponent.discardCount}
              takeable={false}
            />
          </>
        )}
      </div>

      {/* MIDDLE ROW: left seat | center | right seat */}
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', flex: 1, margin: '8px 0' }}>
        {/* LEFT side: seat 3 + its discard pile (our takeable pile) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {leftOpponent && (
            <Seat
              name={BOT_NAMES[(leftOpponent.seat) % BOT_NAMES.length]!}
              count={leftOpponent.rackCount}
              isTurn={view.turn.seat === leftOpponent.seat}
              position="left"
            />
          )}
          {/* Seat 3's discard = human's takeable pile */}
          {leftOpponent && (
            <DiscardPile
              topTile={leftOpponent.discardTop}
              count={leftOpponent.discardCount}
              takeable={takeablePile}
              onTake={takeablePile ? onTakeDiscard : undefined}
            />
          )}
        </div>

        {/* CENTER: stok + gösterge + okey label + direction arrow */}
        <div style={centerStyle}>
          <div style={{ fontSize: 18, opacity: 0.7 }}>↻</div>
          <div style={centerRowStyle}>
            <div
              data-testid="stock-count"
              style={{
                background: 'rgba(0,0,0,.35)',
                borderRadius: 8,
                padding: '10px 14px',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              STOK {view.stockCount}
            </div>
            {view.indicator && (
              <div data-testid="gosterge" style={{ textAlign: 'center' }}>
                <TileView tile={view.indicator} testId="gosterge-tile" />
                <div style={{ fontSize: 10, opacity: 0.8 }}>
                  okey: {view.okey ? tileToString(view.okey) : '-'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT side: seat 1 + its discard pile */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {rightOpponent && (
            <Seat
              name={BOT_NAMES[(rightOpponent.seat) % BOT_NAMES.length]!}
              count={rightOpponent.rackCount}
              isTurn={view.turn.seat === rightOpponent.seat}
              position="right"
            />
          )}
          {/* Seat 1's discard sits between right and top */}
          {rightOpponent && (
            <DiscardPile
              topTile={rightOpponent.discardTop}
              count={rightOpponent.discardCount}
              takeable={false}
            />
          )}
        </div>
      </div>

      {/* BOTTOM ROW: human's discard + children */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
        {/* Human's discard pile (between human and right) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', paddingRight: 60 }}>
          <DiscardPile
            topTile={myDiscardTop}
            count={myDiscardCount}
            takeable={false}
          />
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}
