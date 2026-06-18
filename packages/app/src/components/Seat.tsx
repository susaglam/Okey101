export function Seat({
  name,
  count,
  isTurn,
  position,
  score,
  chips,
}: {
  name: string
  count: number
  isTurn: boolean
  position?: 'top' | 'left' | 'right' | 'bottom'
  score?: number
  chips?: number | string
}) {
  const isVertical = position === 'left' || position === 'right'

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: isVertical ? 'column' : 'row',
    alignItems: 'center',
    gap: isVertical ? 4 : 8,
    padding: isVertical ? '6px 6px' : '6px 10px',
    borderRadius: 10,
    background: 'linear-gradient(180deg,#c08a44,#7a4a1c)',
    color: '#fff',
    boxShadow: isTurn ? '0 0 12px #5ad1c4' : '0 2px 4px rgba(0,0,0,.4)',
  }

  const avatarStyle: React.CSSProperties = {
    width: isVertical ? 24 : 30,
    height: isVertical ? 24 : 30,
    borderRadius: '50%',
    background: '#3a4570',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: isVertical ? 12 : 14,
    flexShrink: 0,
  }

  const nameStyle: React.CSSProperties = {
    fontWeight: 700,
    fontSize: isVertical ? 11 : 14,
    maxWidth: isVertical ? 32 : undefined,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  const badgeStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,.3)',
    borderRadius: 8,
    padding: isVertical ? '1px 5px' : '2px 7px',
    fontSize: isVertical ? 10 : 12,
  }

  const scoreStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,.45)',
    borderRadius: 6,
    padding: isVertical ? '1px 4px' : '2px 6px',
    fontSize: isVertical ? 9 : 11,
    fontWeight: 700,
    color: '#ffd27a',
  }

  return (
    <div
      className={`seat${isTurn ? ' turn' : ''}`}
      data-testid="seat"
      style={containerStyle}
    >
      <div style={avatarStyle}>{name[0]}</div>
      <span style={nameStyle}>{name}</span>
      <span style={badgeStyle}>{count}</span>
      {chips !== undefined && (
        <span style={{ ...badgeStyle, background: 'rgba(60,180,60,.35)', fontSize: isVertical ? 9 : 11 }}>
          {chips}
        </span>
      )}
      {score !== undefined && (
        <span style={scoreStyle}>{score}</span>
      )}
    </div>
  )
}
