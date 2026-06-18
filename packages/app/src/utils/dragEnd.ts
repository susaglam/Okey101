/**
 * Pure helper for interpreting dnd-kit drag-end events.
 *
 * Active IDs:
 *   - 'draw-stock'  → stock pile being dragged
 *   - 'draw-floor'  → takeable floor pile being dragged
 *   - numeric string (e.g. '3') → rack tile at slot index
 *
 * Over IDs:
 *   - 'rack'          → the rack droppable wrapper
 *   - numeric string  → a specific rack slot
 *   - 'discard'       → the discard zone
 *   - null            → dropped outside any droppable
 */

export type DragAction =
  | { action: 'move'; from: number; to: number }
  | { action: 'discard'; from: number }
  | { action: 'draw-stock' }
  | { action: 'draw-floor' }
  | { action: 'none' }

/**
 * Interpret a dnd-kit drag-end event into a typed action.
 * This is a pure function with no side effects.
 *
 * @param activeId - the id of the dragged item (string)
 * @param overId   - the id of the drop target, or null if dropped outside
 */
export function interpretDragEnd(activeId: string, overId: string | null): DragAction {
  // ── draw-stock ──────────────────────────────────────────────────────────────
  if (activeId === 'draw-stock') {
    if (overId === null || overId === 'discard') return { action: 'none' }
    // over 'rack' or any numeric slot id → draw from stock
    if (overId === 'rack' || isSlotId(overId)) return { action: 'draw-stock' }
    return { action: 'none' }
  }

  // ── draw-floor ──────────────────────────────────────────────────────────────
  if (activeId === 'draw-floor') {
    if (overId === null || overId === 'discard') return { action: 'none' }
    if (overId === 'rack' || isSlotId(overId)) return { action: 'draw-floor' }
    return { action: 'none' }
  }

  // ── rack tile (numeric slot id) ─────────────────────────────────────────────
  if (isSlotId(activeId)) {
    const from = Number(activeId)

    if (overId === null) return { action: 'none' }

    if (overId === 'discard') {
      return { action: 'discard', from }
    }

    if (overId === 'rack' || isSlotId(overId)) {
      const to = overId === 'rack' ? from : Number(overId)
      if (from === to) return { action: 'none' }
      return { action: 'move', from, to }
    }

    return { action: 'none' }
  }

  // unknown active id
  return { action: 'none' }
}

/** Returns true if the id string is a non-negative integer (rack slot) */
function isSlotId(id: string): boolean {
  return /^\d+$/.test(id)
}
