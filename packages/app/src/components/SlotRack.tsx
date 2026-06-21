import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Tile } from '@cs-okey/engine'
import { tileToString } from '@cs-okey/engine'
import type { SlotLayout } from '../rack/slots'
import { TileView } from './Tile'
import { tileFlipId } from '../anim/flip'

// ---------------------------------------------------------------------------
// DraggableTile — taş + dnd-kit sürükleme + "pop" hissi + flip kimliği
// ---------------------------------------------------------------------------
function DraggableTile({
  slotIndex,
  tile,
  selected,
  colorblind,
  repValue,
  layable,
  isOkey,
  onSelectSlot,
}: {
  slotIndex: number
  tile: Tile
  selected: boolean
  colorblind?: boolean
  repValue?: number
  layable?: boolean
  isOkey?: boolean
  onSelectSlot: (slot: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(slotIndex),
  })

  // The moving copy is rendered in the GameScreen <DragOverlay> (so it floats above
  // everything, never clipped by the rack). Here we leave the original in place and
  // just dim it as a placeholder — do NOT apply the drag transform.
  const t = CSS.Translate.toString(transform)
  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: isDragging ? undefined : t,
    transformOrigin: 'center',
    zIndex: 1,
    opacity: isDragging ? 0.35 : 1,
    // Only transition OPACITY — never `transform`. A CSS transform-transition
    // fights GSAP Flip (Flip snaps the element to its old spot, the CSS transition
    // then re-animates that snap), producing the "jump then animate back" double
    // movement on Seri/Çift Diz. Flip and dnd-kit both drive transform directly.
    transition: isDragging ? undefined : 'opacity 0.12s ease',
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  }

  return (
    <div ref={setNodeRef} data-flip-id={tileFlipId(tile)} style={style} {...listeners} {...attributes}>
      <TileView
        tile={tile}
        selected={selected}
        colorblind={colorblind}
        repValue={repValue}
        layable={layable}
        isOkey={isOkey}
        onClick={() => onSelectSlot(slotIndex)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// RackSlot — tek yuva (dolu veya boş); droppable + data-slot her zaman var
// ---------------------------------------------------------------------------
function RackSlot({
  slotIndex,
  tile,
  selected,
  colorblind,
  repValue,
  layable,
  isOkey,
  onSelectSlot,
}: {
  slotIndex: number
  tile: Tile | null
  selected: boolean
  colorblind?: boolean
  repValue?: number
  layable?: boolean
  isOkey?: boolean
  onSelectSlot: (slot: number) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: String(slotIndex) })
  const empty = tile === null

  return (
    <div
      ref={setNodeRef}
      data-slot={slotIndex}
      data-testid={empty ? 'slot-empty' : undefined}
      className={`okey-slot${empty ? ' empty' : ''}${isOver ? ' over' : ''}`}
    >
      {!empty && (
        <DraggableTile
          slotIndex={slotIndex}
          tile={tile}
          selected={selected}
          colorblind={colorblind}
          repValue={repValue}
          layable={layable}
          isOkey={isOkey}
          onSelectSlot={onSelectSlot}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SlotRack — basamaklı 2 katlı ahşap ıstaka
// ---------------------------------------------------------------------------
export function SlotRack({
  layout,
  okey,
  colorblind,
  repValue,
  selectedSlot,
  onSelectSlot,
  layableKeys,
}: {
  layout: SlotLayout
  okey?: Tile
  colorblind?: boolean
  repValue?: boolean
  selectedSlot: number | null
  onSelectSlot: (slot: number | null) => void
  /** Keys (tileToString) of rack tiles that can be laid off onto a table meld — marked "işlek". */
  layableKeys?: Set<string>
}) {
  const cols = layout.length / 2
  const backRow = layout.slice(0, cols)
  const frontRow = layout.slice(cols)

  // FALSE_JOKER için gösterilen rep-değeri = okey'in sayısı (Rack.tsx ile aynı)
  const okeyNumber = okey?.number

  function renderSlot(tile: Tile | null, slotIndex: number) {
    const tileRepValue =
      tile !== null && repValue && tile.kind === 'FALSE_JOKER' && okeyNumber !== undefined
        ? okeyNumber
        : undefined

    const layable = tile !== null && !!layableKeys && layableKeys.has(tileToString(tile))

    // The real okey wild (number+colour == okey) is shown blank/face-down in hand.
    // The sahte okey (FALSE_JOKER) keeps its ♣ mark so the two wilds stay distinct.
    const isOkey =
      tile !== null && okey != null && tile.kind === 'NUMBER' &&
      tile.number === okey.number && tile.color === okey.color

    return (
      <RackSlot
        key={slotIndex}
        slotIndex={slotIndex}
        tile={tile}
        selected={selectedSlot === slotIndex}
        colorblind={colorblind}
        repValue={tileRepValue}
        layable={layable}
        isOkey={isOkey}
        onSelectSlot={onSelectSlot}
      />
    )
  }

  const { setNodeRef: setRackRef } = useDroppable({ id: 'rack' })

  return (
    <div ref={setRackRef} data-testid="rack-droppable" className="okey-rack-outer">
      <div className="okey-rack-pegs left" aria-hidden="true"><i /><i /></div>

      <div data-testid="slot-rack" className="okey-rack-surface">
        <div className="okey-rack-wm" aria-hidden="true">
          <b>101</b>
          <small>OKEY</small>
        </div>
        {/* Üst kat: 0 .. cols-1 */}
        <div className="okey-rack-row">
          {backRow.map((tile, i) => renderSlot(tile, i))}
        </div>
        <div className="okey-rack-groove" aria-hidden="true" />
        {/* Alt kat: cols .. 2*cols-1 */}
        <div className="okey-rack-row">
          {frontRow.map((tile, i) => renderSlot(tile, cols + i))}
        </div>
      </div>

      <div className="okey-rack-pegs right" aria-hidden="true"><i /><i /></div>
    </div>
  )
}
