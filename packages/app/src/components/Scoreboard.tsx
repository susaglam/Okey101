export function Scoreboard({
  standings,
  names,
  handNo,
  totalHands,
}: {
  standings: number[]
  names: string[]
  handNo: number
  totalHands: number
}) {
  const maxScore = Math.max(...standings)

  return (
    <div
      style={{
        background: 'rgba(0,0,0,.5)',
        borderRadius: 10,
        padding: '14px 24px',
        minWidth: 240,
        fontFamily: 'system-ui',
        color: '#fff',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          fontSize: 13,
          opacity: 0.8,
          marginBottom: 10,
          letterSpacing: 1,
        }}
      >
        El {handNo}/{totalHands}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {names.map((name, i) => {
            const score = standings[i] ?? 0
            const isLeader = score === maxScore
            const scoreColor =
              score > 0 ? '#6ee86e' : score < 0 ? '#f07070' : '#ccc'
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
