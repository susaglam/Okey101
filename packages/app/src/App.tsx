import { useState } from 'react'
import Menu from './screens/Menu'

export default function App() {
  const [started, setStarted] = useState(false)
  if (!started) return <Menu onStart={() => setStarted(true)} />
  return <div>game placeholder</div> // replaced in Task 6
}
