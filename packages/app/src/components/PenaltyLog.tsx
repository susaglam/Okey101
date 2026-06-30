import type { Tile } from '@cs-okey/engine'

/** A penalty event for the audit log: who, what, with which tile, in which hand. */
export interface PenaltyEvent { seat: number; type: string; tile?: Tile; handNo: number }

const COLOR_TR: Record<string, string> = { RED: 'Kırmızı', BLACK: 'Siyah', BLUE: 'Mavi', YELLOW: 'Sarı' }
const PENALTY_VALUE = 101 // each flat penalty is +101 (never multiplied)

function describeTile(t?: Tile): string {
  if (!t) return ''
  if (t.kind === 'FALSE_JOKER') return 'sahte okey'
  return `${COLOR_TR[t.color ?? ''] ?? ''} ${t.number ?? ''}`.trim()
}
export function describePenalty(type: string, tile?: Tile): string {
  switch (type) {
    case 'okey-discard': return `Yere okey attı${tile ? ` (${describeTile(tile)})` : ''}`
    case 'islek-discard': return `İşlek taş attı${tile ? ` (${describeTile(tile)})` : ''}`
    case 'islek': return `Açana işlek taş besledi${tile ? ` (${describeTile(tile)})` : ''}`
    case 'okey-held': return 'El sonunda okeyi elinde tuttu'
    default: return type
  }
}

/**
 * Penalty audit log: every penalty-point-generating action across the match, listed
 * like an audit trail — "El 3 · Yusuf · İşlek taş attı (Siyah 8) · +101". Grouped by
 * player so you can see who earned which penalties and why.
 */
export function PenaltyLog({ events, names, onClose }: {
  events: PenaltyEvent[]
  names: string[]
  onClose: () => void
}) {
  // Group by seat; within a seat, newest hand first.
  const bySeat = new Map<number, PenaltyEvent[]>()
  for (const e of events) {
    if (!bySeat.has(e.seat)) bySeat.set(e.seat, [])
    bySeat.get(e.seat)!.push(e)
  }
  const seats = [...bySeat.keys()].sort((a, b) => a - b)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 620, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="penalty-log" style={{ width: '100%', maxWidth: 460, maxHeight: '86vh', overflowY: 'auto', background: 'linear-gradient(180deg,#23613f,#16482e)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 14, padding: 20, color: '#fff7e9', fontFamily: 'system-ui' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>⚠ Ceza Kaydı</h2>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.25)' }}>Kapat</button>
        </div>
        {events.length === 0 ? (
          <p style={{ opacity: 0.75 }}>Henüz ceza yok. 🎉</p>
        ) : (
          seats.map((seat) => {
            const list = bySeat.get(seat)!.slice().sort((a, b) => b.handNo - a.handNo)
            const total = list.length * PENALTY_VALUE
            return (
              <div key={seat} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1px solid rgba(255,255,255,.18)', paddingBottom: 4, marginBottom: 6 }}>
                  <strong style={{ fontSize: 15 }}>{names[seat] ?? `Oyuncu ${seat + 1}`}</strong>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 13, color: '#ffb4b4', fontWeight: 800 }}>{list.length} ceza · +{total}</span>
                </div>
                {list.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 0' }}>
                    <span style={{ opacity: 0.6, minWidth: 38 }}>El {e.handNo}</span>
                    <span style={{ flex: 1 }}>{describePenalty(e.type, e.tile)}</span>
                    <span style={{ color: '#ffb4b4', fontWeight: 700 }}>+{PENALTY_VALUE}</span>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
