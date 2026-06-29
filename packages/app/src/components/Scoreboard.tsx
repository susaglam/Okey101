export function Scoreboard({
  standings,
  names,
  handNo,
  totalHands,
  lowerWins,
  teamMode,
}: {
  standings: number[]
  names: string[]
  handNo: number
  totalHands: number
  /** 101: the LOWEST total leads/wins. Klasik: the highest. */
  lowerWins?: boolean
  /** Eşli mode: group seats 0&2 vs 1&3, show team subtotals, win by team. */
  teamMode?: boolean
}) {
  const wrap = {
    background: 'rgba(0,0,0,.5)',
    borderRadius: 10,
    padding: '14px 24px',
    minWidth: 240,
    fontFamily: 'system-ui',
    color: '#fff',
  } as const
  const headerRow = (
    <div style={{ textAlign: 'center', fontSize: 13, opacity: 0.8, marginBottom: 10, letterSpacing: 1 }}>
      El {handNo}/{totalHands}
    </div>
  )

  if (teamMode) {
    // Two fixed teams: seats 0&2 and 1&3. Each player keeps their own row; the
    // combined subtotal is what decides the standings/winner.
    const teams = [
      { seats: [0, 2], total: (standings[0] ?? 0) + (standings[2] ?? 0) },
      { seats: [1, 3], total: (standings[1] ?? 0) + (standings[3] ?? 0) },
    ]
    const bestTotal = lowerWins
      ? Math.min(...teams.map((t) => t.total))
      : Math.max(...teams.map((t) => t.total))

    return (
      <div style={wrap}>
        {headerRow}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {teams.map((team, ti) => {
              const isLeader = team.total === bestTotal
              const totalColor = isLeader ? '#6ee86e' : '#d8cdb8'
              return (
                <tr key={ti}>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
                      {isLeader ? '★ ' : ''}{ti + 1}. Takım
                    </div>
                    {team.seats.map((seat) => (
                      <div key={seat} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13, opacity: 0.85 }}>
                        <span>{names[seat]}</span>
                        <span style={{ color: '#d8cdb8' }}>{standings[seat] ?? 0}</span>
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, fontSize: 20, color: totalColor, verticalAlign: 'bottom' }}>
                    {team.total}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const bestScore = lowerWins ? Math.min(...standings) : Math.max(...standings)

  return (
    <div style={wrap}>
      {headerRow}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {names.map((name, i) => {
            const score = standings[i] ?? 0
            const isLeader = score === bestScore
            // The leader (best total in this variant's direction) is green; the
            // rest are neutral — avoids the "high = green" confusion in 101 where
            // a LOWER total is better.
            const scoreColor = isLeader ? '#6ee86e' : '#d8cdb8'
            return (
              <tr
                key={name}
                style={{
                  background: isLeader ? 'rgba(255,215,0,.15)' : 'transparent',
                  borderRadius: 4,
                }}
              >
                <td
                  style={{
                    padding: '5px 8px',
                    fontWeight: isLeader ? 700 : 400,
                    fontSize: 15,
                  }}
                >
                  {isLeader ? '★ ' : ''}
                  {name}
                </td>
                <td
                  style={{
                    padding: '5px 8px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: 16,
                    color: scoreColor,
                  }}
                >
                  {score}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
