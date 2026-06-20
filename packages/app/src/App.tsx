import { useState, useMemo } from 'react'
import Menu from './screens/Menu'
import GameScreen from './screens/GameScreen'
import Help from './screens/Help'
import { LocalAdapter } from './adapter/LocalAdapter'
import { KLASIK, KLASIK_101 } from '@cs-okey/engine'
import { clearGame, loadGame, isResumableSave } from './persistence'
import type { SaveData } from './persistence'

type View = 'menu' | 'game' | 'help'
type Variant = 'klasik' | 'yuzbir'

// A fresh random 31-bit seed. Engine RNG is deterministic from this seed, but the
// SEED itself must vary per game so each new game is genuinely random — even after
// a page reload (a counter-based seed repeated the same first few deals).
const freshSeed = () => Math.floor(Math.random() * 0x7fffffff)

export default function App() {
  const [view, setView] = useState<View>('menu')
  const [gameKey, setGameKey] = useState(0)
  const [variantId, setVariantId] = useState<Variant>('klasik')
  const [gameSeed, setGameSeed] = useState<number>(() => freshSeed())
  const [pendingResume, setPendingResume] = useState<SaveData | null>(null)

  const adapter = useMemo(() => {
    if (pendingResume) {
      // seed is restored from the snapshot (rf.seed ?? state.rngSeed) inside LocalAdapter.
      return new LocalAdapter({ seed: gameSeed, humanSeat: 0, resumeFrom: pendingResume })
    }
    return new LocalAdapter({ seed: gameSeed, humanSeat: 0, variant: variantId === 'yuzbir' ? KLASIK_101 : KLASIK })
  }, [gameKey, variantId, pendingResume, gameSeed])

  const handleStart = (v: Variant) => {
    clearGame()
    setPendingResume(null)
    setVariantId(v)
    setGameSeed(freshSeed()) // new random deal each game
    setGameKey(k => k + 1)
    setView('game')
  }

  const handleResume = () => {
    const save = loadGame()
    // Guard against a corrupt/partial save: resuming it would crash on render.
    // Drop it and stay on the menu rather than throwing.
    if (!isResumableSave(save)) {
      clearGame()
      setPendingResume(null)
      return
    }
    setPendingResume(save)
    setGameKey(k => k + 1)
    setView('game')
  }

  if (view === 'game') return <GameScreen adapter={adapter} />
  if (view === 'help') return <Help onBack={() => setView('menu')} />
  return (
    <Menu
      onStart={handleStart}
      onHelp={() => setView('help')}
      onResume={handleResume}
    />
  )
}
