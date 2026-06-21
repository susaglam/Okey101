import type { HandRecord } from '../match'

const PENALTY_LABEL: Record<string, string> = {
  'islek': 'işlek',
  'islek-floor-open': 'işlek', // legacy
  'okey-discard': 'okey attı',
}

function penaltyLabel(type: string): string {
  return PENALTY_LABEL[type] ?? type
}

/** Green when the delta is GOOD for that seat (negative in 101, positive in Klasik). */
function goodColor(delta: number, lowerWins?: boolean): string {
  if (delta === 0) return '#ddd'
  const good = lowerWins ? delta < 0 : delta > 0
  return good ? '#7BE38B' : '#f08a8a'
}

/**
 * Per-hand score table: one row per hand, one column per seat, each cell showing
 * that seat's net score for the hand plus any flat penalties (by type). A footer
 * row shows the running match totals.
 */
export function ScoreTable({ history, standings, names, lowerWins }: {
  history: HandRecord[]
  standings: number[]
  names: string[]
  /** 101: a NEGATIVE delta is good (finisher credit), positive is a penalty —
   *  flip the green/red so green always means "good for that seat". */
  lowerWins?: boolean
}) {
  const seats = standings.map((_, i) => i)
  const th: React.CSSProperties = { padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,.25)' }
  const td: React.CSSProperties = { padding: '6px 10px', textAlign: 'center', verticalAlign: 'top' }

  return (
    <div data-testid="score-table" style={{ width: '100%', overflowX: 'auto' }}>
      {history.length === 0 ? (
        <p style={{ opacity: 0.75, textAlign: 'center', margin: '12px 0' }}>Henüz biten el yok.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'system-ui', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>El</th>
              {seats.map((s) => (
                <th key={s} style={th}>{names[s] ?? `O${s}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.handNo}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, opacity: 0.8 }}>{h.handNo}</td>
                {seats.map((s) => {
                  const delta = h.deltas[s] ?? 0
                  const pens = h.penalties.filter((p) => p.seat === s)
                  const isWinner = h.winnerSeat === s
                  return (
                    <td key={s} style={td}>
                      <div style={{ fontWeight: 800, color: goodColor(delta, lowerWins) }}>
                        {delta > 0 ? `+${delta}` : delta}{isWinner ? ' 🏆' : ''}
                      </div>
                      {pens.map((p, i) => (
                        <div key={i} style={{ fontSize: 10, color: '#f0b24a', lineHeight: 1.3 }}>
                          {penaltyLabel(p.type)} +101
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...td, textAlign: 'left', fontWeight: 800, borderTop: '2px solid rgba(255,255,255,.35)' }}>Toplam</td>
              {seats.map((s) => (
                <td key={s} style={{ ...td, fontWeight: 800, borderTop: '2px solid rgba(255,255,255,.35)', color: '#ffd27a' }}>
                  {standings[s] ?? 0}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
