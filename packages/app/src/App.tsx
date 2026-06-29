import { useState, useMemo, useEffect } from 'react'
import Lobby from './screens/Lobby'
import GameScreen from './screens/GameScreen'
import Help from './screens/Help'
import Login from './screens/Login'
import Admin from './screens/Admin'
import { LocalAdapter } from './adapter/LocalAdapter'
import { clearGame, loadGame, isResumableSave } from './persistence'
import type { SaveData } from './persistence'
import { configForMode, type GameMode } from './modes'
import { loadTables, createTable, deleteTable, type TableDescriptor } from './tables'
import { currentUser, logout, type CurrentUser } from './auth'
import { setHumanName } from './names'

type View = 'lobby' | 'table' | 'help' | 'admin'

// A fresh random 31-bit seed. Engine RNG is deterministic from this seed, but the
// SEED itself must vary per game so each new game is genuinely random.
const freshSeed = () => Math.floor(Math.random() * 0x7fffffff)

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(() => currentUser())
  const [view, setView] = useState<View>('lobby')
  const [tables, setTables] = useState<TableDescriptor[]>(() => loadTables())
  const [activeTable, setActiveTable] = useState<TableDescriptor | null>(null)
  const [gameKey, setGameKey] = useState(0)
  const [gameSeed, setGameSeed] = useState<number>(() => freshSeed())
  const [pendingResume, setPendingResume] = useState<SaveData | null>(null)

  // Seat 0's display name follows the signed-in user (guest → "Misafir" → "Sen").
  useEffect(() => { setHumanName(user?.name) }, [user])

  const refreshTables = () => setTables(loadTables())

  const adapter = useMemo(() => {
    if (!activeTable) return null
    const botDelayMs = 450 // pace bot moves so each is visible
    if (pendingResume) {
      return new LocalAdapter({ seed: gameSeed, humanSeat: 0, resumeFrom: pendingResume, botDelayMs })
    }
    return new LocalAdapter({
      seed: gameSeed, humanSeat: 0,
      tableId: activeTable.id, mode: activeTable.mode, variant: configForMode(activeTable.mode),
      botDelayMs,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey, activeTable, pendingResume, gameSeed])

  /** Open a table: resume its in-progress game if any, else deal a fresh one. */
  const enterTable = (table: TableDescriptor) => {
    const save = loadGame(table.id)
    if (isResumableSave(save)) {
      setPendingResume(save)
    } else {
      clearGame(table.id)
      setPendingResume(null)
      setGameSeed(freshSeed())
    }
    setActiveTable(table)
    setGameKey((k) => k + 1)
    setView('table')
  }

  /** Start a brand-new match on a table (fresh deal), discarding any save. */
  const startFresh = (table: TableDescriptor) => {
    clearGame(table.id)
    setPendingResume(null)
    setGameSeed(freshSeed())
    setActiveTable(table)
    setGameKey((k) => k + 1)
    setView('table')
  }

  const handleNewTable = (mode: GameMode) => {
    const table = createTable(mode)
    refreshTables()
    startFresh(table)
  }

  const handleDeleteTable = (table: TableDescriptor) => {
    deleteTable(table.id)
    refreshTables()
  }

  const backToLobby = () => {
    setActiveTable(null)
    setPendingResume(null)
    refreshTables() // pick up the just-saved in-progress game
    setView('lobby')
  }

  // Entry gate: nobody signed in → the Login screen (guest or register/login).
  if (!user) return <Login onAuthed={() => setUser(currentUser())} />

  if (view === 'table' && adapter) return (
    <GameScreen
      adapter={adapter}
      user={user}
      onExitToMenu={backToLobby}
      onRestart={() => activeTable && startFresh(activeTable)}
      isResumed={!!pendingResume}
    />
  )
  if (view === 'help') return <Help onBack={() => setView('lobby')} />
  if (view === 'admin') return <Admin onBack={() => setView('lobby')} />
  return (
    <Lobby
      user={user}
      tables={tables}
      onNewTable={handleNewTable}
      onEnter={enterTable}
      onDelete={handleDeleteTable}
      onHelp={() => setView('help')}
      onAdmin={() => setView('admin')}
      onLogout={() => { logout(); setUser(null) }}
    />
  )
}
