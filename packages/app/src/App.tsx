import { useState, useMemo } from 'react'
import Menu from './screens/Menu'
import GameScreen from './screens/GameScreen'
import { LocalAdapter } from './adapter/LocalAdapter'

export default function App() {
  const [started, setStarted] = useState(false)
  const adapter = useMemo(() => new LocalAdapter({ seed: 12345, humanSeat: 0 }), [started])
  if (!started) return <Menu onStart={() => setStarted(true)} />
  return <GameScreen adapter={adapter} />
}
