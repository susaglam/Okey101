export default function Menu({ onStart }: { onStart: () => void }) {
  return (
    <div className="menu">
      <h1>♣ CS OKEY</h1>
      <button onClick={onStart}>OYNA ▸</button>
    </div>
  )
}
