export function Seat({
  name,
  count,
  isTurn,
  position,
  score,
  chips,
  stack,
  seat,
  penalties,
}: {
  name: string
  count: number
  isTurn: boolean
  position?: 'top' | 'left' | 'right' | 'bottom'
  score?: number
  chips?: number | string
  /** Rakip varlığı için yüz-aşağı mini taş yığını göster */
  stack?: boolean
  /** Oturma indeksi — animasyon çapası (data-seat) için. */
  seat?: number
  /** Bu el alınan düz ceza sayısı (işlek/okey-atma) — >0 ise kırmızı rozet. */
  penalties?: number
}) {
  const isVertical = position === 'left' || position === 'right'

  const containerStyle: React.CSSProperties = {
    position: 'relative',
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
    position: 'relative',
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
    maxWidth: isVertical ? 40 : undefined,
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

  // Yüz-aşağı mini taş yığını (rakip elinin görsel temsili)
  const stackCount = stack ? Math.min(count, 7) : 0

  return (
    <div
      className={`seat${isTurn ? ' turn' : ''}`}
      data-testid="seat"
      data-seat={seat}
      style={containerStyle}
    >
      <div style={avatarStyle}>
        {name[0]}
        {isTurn && (
          <span
            className="active-dot"
            style={{ position: 'absolute', bottom: -1, right: -1, border: '1px solid #7a4a1c' }}
          />
        )}
      </div>
      <span style={nameStyle}>{name}</span>
      {stackCount > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'relative',
            width: 14 + (stackCount - 1) * 3,
            height: 20,
            flexShrink: 0,
          }}
        >
          {Array.from({ length: stackCount }, (_, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: i * 3,
                top: 0,
                width: 12,
                height: 18,
                borderRadius: 2,
                background: 'linear-gradient(175deg,#f5f0e8,#e2d8c4)',
                border: '1px solid #b8ac90',
                borderBottom: '2px solid #9a8e72',
                boxShadow: '0 1px 1px rgba(0,0,0,.25)',
              }}
            />
          ))}
        </div>
      )}
      <span style={badgeStyle}>{count}</span>
      {chips !== undefined && (
        <span style={{ ...badgeStyle, background: 'rgba(60,180,60,.35)', fontSize: isVertical ? 9 : 11 }}>
          {chips}
        </span>
      )}
      {score !== undefined && (
        <span style={scoreStyle}>{score}</span>
      )}
      {!!penalties && penalties > 0 && (
        <span
          title={`${penalties} ceza (×101)`}
          aria-label={`${penalties} ceza`}
          style={{
            background: 'rgba(200,40,40,.92)', color: '#fff', borderRadius: 8,
            padding: isVertical ? '1px 5px' : '2px 7px', fontSize: isVertical ? 9 : 11,
            fontWeight: 800, lineHeight: 1.1,
          }}
        >
          ⚠{penalties}
        </span>
      )}
    </div>
  )
}
