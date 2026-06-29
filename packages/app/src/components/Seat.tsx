import { TurnRing } from './TurnRing'

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
  turnDeadlineMs,
  turnBudgetMs,
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
  /** Sıra süresi geri sayım halkası (online): bitiş epoch ms + toplam süre. */
  turnDeadlineMs?: number
  turnBudgetMs?: number
}) {
  const isVertical = position === 'left' || position === 'right'

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: isVertical ? 'column' : 'row',
    alignItems: 'center',
    gap: isVertical ? 5 : 9,
    padding: isVertical ? '8px 7px' : '7px 12px',
    borderRadius: 12,
    background: 'linear-gradient(180deg, #caa063 0%, #9a6a30 52%, #774719 100%)',
    border: '1px solid rgba(72,44,16,0.85)',
    color: '#fff7e9',
    fontFamily: 'system-ui',
    boxShadow: isTurn
      ? '0 0 0 2px rgba(90,209,196,0.95), 0 0 16px 3px rgba(90,209,196,0.5), inset 0 1px 0 rgba(255,238,205,0.5)'
      : '0 3px 9px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,238,205,0.38)',
    transition: 'box-shadow .2s ease',
  }

  const avatarStyle: React.CSSProperties = {
    position: 'relative',
    width: isVertical ? 26 : 32,
    height: isVertical ? 26 : 32,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 36% 30%, #5e6fb0 0%, #2c3768 100%)',
    border: '1.5px solid rgba(255,238,205,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: isVertical ? 12 : 15,
    color: '#fff',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3), 0 1px 2px rgba(0,0,0,0.45)',
    flexShrink: 0,
  }

  const nameStyle: React.CSSProperties = {
    fontWeight: 700,
    fontSize: isVertical ? 11 : 14,
    maxWidth: isVertical ? 44 : undefined,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textShadow: '0 1px 1px rgba(0,0,0,0.4)',
    letterSpacing: 0.2,
  }

  // Tile-count chip — small ivory pill (reads as "tiles in hand").
  const badgeStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #fbf6ea, #e8dcc4)',
    color: '#5a4420',
    borderRadius: 7,
    padding: isVertical ? '1px 6px' : '2px 8px',
    fontSize: isVertical ? 10 : 12,
    fontWeight: 800,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 1px rgba(0,0,0,0.25)',
  }

  const scoreStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,.42)',
    borderRadius: 6,
    padding: isVertical ? '1px 5px' : '2px 7px',
    fontSize: isVertical ? 9 : 11,
    fontWeight: 800,
    color: '#ffd27a',
    boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.3)',
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
      {isTurn && turnDeadlineMs != null && turnBudgetMs != null && (
        <TurnRing deadlineMs={turnDeadlineMs} budgetMs={turnBudgetMs} radius={12} />
      )}
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
