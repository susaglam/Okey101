import { useEffect, useState } from 'react'

/**
 * A self-animating countdown ring drawn AROUND the active player's card. The arc
 * depletes clockwise and the colour sweeps green → yellow → red as the per-turn time
 * runs out. It owns its own ticker (so the parent doesn't re-render every frame) and
 * resets whenever `deadlineMs` changes — i.e. it re-arms separately for the DRAW and
 * DISCARD phases, each of which the server gives its own deadline.
 *
 * Pure CSS (conic-gradient + a border-only mask), no SVG/asset. Rendered only for
 * server-enforced turns (online); offline play furnishes no timer so no ring appears.
 */
export function TurnRing({ deadlineMs, budgetMs, radius = 12 }: { deadlineMs: number; budgetMs: number; radius?: number }) {
  const [progress, setProgress] = useState(() =>
    budgetMs > 0 ? Math.max(0, Math.min(1, (deadlineMs - Date.now()) / budgetMs)) : 0)

  useEffect(() => {
    if (budgetMs <= 0) { setProgress(0); return }
    const tick = () => setProgress(Math.max(0, Math.min(1, (deadlineMs - Date.now()) / budgetMs)))
    tick()
    const id = setInterval(tick, 100) // 10fps — smooth enough, cheap
    return () => clearInterval(id)
  }, [deadlineMs, budgetMs])

  const hue = Math.round(progress * 120)            // 120 = green, 0 = red
  const color = `hsl(${hue}, 85%, 48%)`
  const deg = progress * 360
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: -3, borderRadius: radius + 3, padding: 3,
        background: `conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.14) ${deg}deg 360deg)`,
        // Border-only ring: paint the padding box, punch out the content box.
        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        WebkitMaskComposite: 'xor', maskComposite: 'exclude',
        transition: 'background .12s linear',
        pointerEvents: 'none', zIndex: 2,
      }}
    />
  )
}
