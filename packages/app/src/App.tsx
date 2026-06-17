import { useState, useMemo } from 'react'
import Menu from './screens/Menu'
import GameScreen from './screens/GameScreen'
import Help from './screens/Help'
import { LocalAdapter } from './adapter/LocalAdapter'

type View = 'menu' | 'game' | 'help'

export default function App() {
  const [view, setView] = useState<View>('menu')
  const adapter = useMemo(() => new LocalAdapter({ seed: 12345, humanSeat: 0 }), [])
  if (view === 'game') return <GameScreen adapter={adapter} />
  if (view === 'help') return <Help onBack={() => setView('menu')} />
  return <Menu onStart={() => setView('game')} onHelp={() => setView('help')} />
}
