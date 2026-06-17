import { useState, useMemo } from 'react'
import Menu from './screens/Menu'
import GameScreen from './screens/GameScreen'
import Help from './screens/Help'
import { LocalAdapter } from './adapter/LocalAdapter'
import { KLASIK, KLASIK_101 } from '@cs-okey/engine'

type View = 'menu' | 'game' | 'help'
type Variant = 'klasik' | 'yuzbir'

export default function App() {
  const [view, setView] = useState<View>('menu')
  const [gameKey, setGameKey] = useState(0)
  const [variantId, setVariantId] = useState<Variant>('klasik')
  const adapter = useMemo(
    () => new LocalAdapter({ seed: 1000 + gameKey, humanSeat: 0, variant: variantId === 'yuzbir' ? KLASIK_101 : KLASIK }),
    [gameKey, variantId],
  )
  if (view === 'game') return <GameScreen adapter={adapter} />
  if (view === 'help') return <Help onBack={() => setView('menu')} />
  return (
    <Menu
      onStart={(v) => { setVariantId(v); setGameKey(k => k + 1); setView('game') }}
      onHelp={() => setView('help')}
    />
  )
}
