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
      style={{
        width: 56,
        height: 72,
        borderRadius: 8,
        border: `2px dashed ${isActive ? '#ffe066' : 'rgba(255,255,255,0.35)'}`,
        background: isActive
          ? 'rgba(255,220,0,0.18)'
          : 'rgba(0,0,0,0.22)',
        boxShadow: isActive ? '0 0 12px 3px rgba(255,220,0,0.45)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.12s ease',
        cursor: 'pointer',
        fontSize: 10,
        color: isActive ? '#ffe066' : 'rgba(255,255,255,0.45)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {isActive ? '↓' : 'AT'}
    </div>
  )
}
