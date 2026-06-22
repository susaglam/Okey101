import './theme/klasik.css'
import './theme/gece.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme } from './theme/themes'
import { loadSettings } from './settings'
import { setBotNames } from './names'
// Apply persisted theme + bot names on load so the board matches saved settings
// (no flash of the wrong theme / default names).
const _s = loadSettings()
applyTheme(_s.theme)
setBotNames(_s.botNames)
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
