import './theme/klasik.css'
import './theme/gece.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme } from './theme/themes'
import { loadSettings } from './settings'
// Apply the persisted theme on load so the board matches the saved setting (no flash of the wrong theme).
applyTheme(loadSettings().theme)
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
