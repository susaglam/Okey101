import { useDroppable } from '@dnd-kit/core'

export function DiscardZone({
  onDropTile,
  highlight,
}: {
  onDropTile: () => void
  highlight?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'discard' })
  const isActive = isOver || highlight

  return (
    <div
      ref={setNodeRef}
      data-testid="discard-zone"
      onClick={onDropTile}
      className={`discard-target${isActive ? ' active' : ''}`}
      title="Taşı buraya at"
    >
      {isActive ? '↓ AT' : 'AT'}
    </div>
  )
}
