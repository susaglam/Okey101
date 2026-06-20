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
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
    >
      <div
        ref={enabled ? setNodeRef : undefined}
        data-testid={enabled ? 'draw-stock' : 'stock-tile'}
        className="stock-deste"
        style={enabled ? {
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          transform: CSS.Translate.toString(transform),
          zIndex: isDragging ? 100 : 1,
          boxShadow: isDragging ? '0 6px 20px rgba(0,0,0,.8), 0 0 0 2px #e8c87a' : undefined,
        } : undefined}
        {...(enabled ? listeners : {})}
        {...(enabled ? attributes : {})}
      >
        <span className="count">{stockCount}</span>
      </div>
    </div>
  )
}
