import { useState, useMemo, useEffect } from 'react'
import Menu from './screens/Menu'
import GameScreen from './screens/GameScreen'
import Help from './screens/Help'
import Login from './screens/Login'
import Admin from './screens/Admin'
import { LocalAdapter } from './adapter/LocalAdapter'
import { clearGame, loadGame, isResumableSave } from './persistence'
import type { SaveData } from './persistence'
import { configForMode, type GameMode } from './modes'
import { currentUser, logout, type CurrentUser } from './auth'
import { setHumanName } from './names'

type View = 'menu' | 'game' | 'help' | 'admin'

// A fresh random 31-bit seed. Engine RNG is deterministic from this seed, but the
// SEED itself must vary per game so each new game is genuinely random — even after
// a page reload (a counter-based seed repeated the same first few deals).
const freshSeed = () => Math.floor(Math.random() * 0x7fffffff)

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(() => currentUser())
  const [view, setView] = useState<View>('menu')
  const [gameKey, setGameKey] = useState(0)
  const [mode, setMode] = useState<GameMode>('klasik')
  const [gameSeed, setGameSeed] = useState<number>(() => freshSeed())
  const [pendingResume, setPendingResume] = useState<SaveData | null>(null)

  // Seat 0's display name follows the signed-in user (guest → "Misafir" → "Sen").
  useEffect(() => { setHumanName(user?.name) }, [user])

  const adapter = useMemo(() => {
    // Pace bot moves so each is visible (the active seat glows + its pile updates).
    const botDelayMs = 450
    if (pendingResume) {
      // seed + mode + config are restored from the snapshot inside LocalAdapter.
      return new LocalAdapter({ seed: gameSeed, humanSeat: 0, resumeFrom: pendingResume, botDelayMs })
    }
    // teamMode is now INTRINSIC to the mode (Eşli 101 = configForMode('yuzbir-esli')),
    // not a runtime toggle — so a mode fully determines the rules.
    return new LocalAdapter({ seed: gameSeed, humanSeat: 0, mode, variant: configForMode(mode), botDelayMs })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey, mode, pendingResume, gameSeed])

  const handleStart = (m: GameMode) => {
    clearGame(m) // start fresh for THIS mode (other modes' saves are kept)
    setPendingResume(null)
    setMode(m)
    setGameSeed(freshSeed()) // new random deal each game
    setGameKey(k => k + 1)
    setView('game')
  }

  const handleResume = (m: GameMode) => {
    const save = loadGame(m)
    // Guard against a corrupt/partial save: resuming it would crash on render.
    if (!isResumableSave(save)) {
      clearGame(m)
      setPendingResume(null)
      return
    }
    setMode(m)
    setPendingResume(save)
    setGameKey(k => k + 1)
    setView('game')
  }

  // Entry gate: nobody signed in → the Login screen (guest or register/login).
  if (!user) return <Login onAuthed={() => setUser(currentUser())} />

  if (view === 'game') return (
    <GameScreen
      adapter={adapter}
      user={user}
      onExitToMenu={() => setView('menu')}
      onRestart={() => handleStart(mode)}
      isResumed={!!pendingResume}
    />
  )
  if (view === 'help') return <Help onBack={() => setView('menu')} />
  if (view === 'admin') return <Admin onBack={() => setView('menu')} />
  return (
    <Menu
      user={user}
      onStart={handleStart}
      onHelp={() => setView('help')}
      onResume={handleResume}
      onAdmin={() => setView('admin')}
      onLogout={() => { logout(); setUser(null) }}
    />
  )
}
