import { DndContext } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Tile } from '@cs-okey/engine'
import type { SlotLayout } from '../rack/slots'
import { TileView } from './Tile'

// ---------------------------------------------------------------------------
// Slot sub-components
// ---------------------------------------------------------------------------

function DroppableSlot({
  slotIndex,
  children,
}: {
  slotIndex: number
  children?: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slotIndex })
  return (
    <div
      ref={setNodeRef}
      data-slot={slotIndex}
      style={{
        width: 44,
        height: 58,
        borderRadius: 5,
        boxSizing: 'border-box',
        position: 'relative',
        background: isOver ? 'rgba(255,255,255,0.18)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {children}
    </div>
  )
}

function EmptySlotGap() {
  return (
    <div
      data-testid="slot-empty"
      style={{
        width: 44,
        height: 58,
        borderRadius: 5,
        background: 'rgba(0,0,0,0.18)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.35)',
        border: '1px solid rgba(0,0,0,0.25)',
        boxSizing: 'border-box',
      }}
    />
  )
}

function DraggableTile({
  slotIndex,
  tile,
  selected,
  colorblind,
  repValue,
  onSelectSlot,
}: {
  slotIndex: number
  tile: Tile
  selected: boolean
  colorblind?: boolean
  repValue?: number
  onSelectSlot: (slot: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: slotIndex,
  })

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.75 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TileView
        tile={tile}
        selected={selected}
        colorblind={colorblind}
        repValue={repValue}
        onClick={() => onSelectSlot(slotIndex)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SlotRack
// ---------------------------------------------------------------------------

export function SlotRack({
  layout,
  okey,
  colorblind,
  repValue,
  selectedSlot,
  onSelectSlot,
  onMove,
}: {
  layout: SlotLayout
  okey?: Tile
  colorblind?: boolean
  repValue?: boolean
  selectedSlot: number | null
  onSelectSlot: (slot: number | null) => void
  onMove: (from: number, to: number) => void
}) {
  const cols = layout.length / 2
  const backRow = layout.slice(0, cols)
  const frontRow = layout.slice(cols)

  // Compute the numeric okey value for false-joker repValue display,
  // mirroring the existing Rack.tsx wiring.
  const okeyNumber = okey?.number

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const fromSlot = active.id as number
    const toSlot = over.id as number
    if (fromSlot !== toSlot) {
      onMove(fromSlot, toSlot)
    }
  }

  function renderSlot(tile: Tile | null, slotIndex: number) {
    if (tile === null) {
      return (
        <DroppableSlot key={slotIndex} slotIndex={slotIndex}>
          <EmptySlotGap />
        </DroppableSlot>
      )
    }
    const tileRepValue =
      repValue && tile.kind === 'FALSE_JOKER' && okeyNumber !== undefined
        ? okeyNumber
        : undefined

    return (
      <DroppableSlot key={slotIndex} slotIndex={slotIndex}>
        <DraggableTile
          slotIndex={slotIndex}
          tile={tile}
          selected={selectedSlot === slotIndex}
          colorblind={colorblind}
          repValue={tileRepValue}
          onSelectSlot={onSelectSlot}
        />
      </DroppableSlot>
    )
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div
        data-testid="slot-rack"
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          gap: 6,
          padding: '10px 12px',
          background: 'linear-gradient(180deg, #b5783a 0%, #8b5e2a 100%)',
          borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
          border: '2px solid #6b4420',
        }}
      >
        {/* Back row (top): slots 0 .. cols-1 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {backRow.map((tile, i) => renderSlot(tile, i))}
        </div>
        {/* Front row (bottom): slots cols .. 2*cols-1 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {frontRow.map((tile, i) => renderSlot(tile, cols + i))}
        </div>
      </div>
    </DndContext>
  )
}
