import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

/**
 * The draw stock shown as a white tile-stack (deste) with the remaining count in
 * its inner corner. Draggable (drag-to-draw) when `enabled`; otherwise static.
 */
export function StockPile({ stockCount, enabled }: { stockCount: number; enabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: 'draw-stock',
    disabled: !enabled,
  })

  return (
    <div
      data-testid="stock-count"
      data-stockcount={stockCount}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}
    >
      <div
        ref={enabled ? setNodeRef : undefined}
        data-testid={enabled ? 'draw-stock' : 'stock-tile'}
        className="stock-deste"
        style={enabled ? {
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          // Moving copy is in GameScreen's DragOverlay; dim the original, no transform.
          transform: isDragging ? undefined : CSS.Translate.toString(transform),
          opacity: isDragging ? 0.35 : 1,
          zIndex: 1,
        } : undefined}
        {...(enabled ? listeners : {})}
        {...(enabled ? attributes : {})}
      >
        <span className="count">{stockCount}</span>
      </div>
    </div>
  )
}
