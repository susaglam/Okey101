export function Seat({ name, count, isTurn }: { name: string; count: number; isTurn: boolean }) {
  return (
    <div className={`seat${isTurn ? ' turn' : ''}`} data-testid="seat"
      style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:10,
        background:'linear-gradient(180deg,#c08a44,#7a4a1c)',color:'#fff',
        boxShadow: isTurn ? '0 0 12px #5ad1c4' : '0 2px 4px rgba(0,0,0,.4)' }}>
      <div style={{ width:30,height:30,borderRadius:'50%',background:'#3a4570',
        display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800 }}>{name[0]}</div>
      <span style={{ fontWeight:700 }}>{name}</span>
      <span style={{ background:'rgba(0,0,0,.3)',borderRadius:8,padding:'2px 7px',fontSize:12 }}>{count}</span>
    </div>
  )
}
