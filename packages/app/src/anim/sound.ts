/**
 * Self-contained game sound effects via the Web Audio API.
 *
 * No asset files and no network: every sound is synthesised from short
 * oscillator "notes", so the bundle stays tiny and it works fully offline.
 *
 * - A single AudioContext is created lazily on the first play (browsers block
 *   audio before a user gesture; the game is click-driven so the context
 *   resumes on the first interaction).
 * - No-op when Web Audio is unavailable (jsdom / SSR) so tests stay green.
 * - Respects the user's "Ses" setting via setSoundEnabled().
 *
 * Keep sounds SHORT and QUIET (low master gain) — feedback, not a soundtrack.
 */

let enabled = false
let ctx: AudioContext | null = null

/** Toggle all sound on/off (driven by the user's settings). */
export function setSoundEnabled(on: boolean): void {
  enabled = on
}

type AudioCtor = typeof AudioContext

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function getCtx(): AudioContext | null {
  const Ctor = audioCtor()
  if (!Ctor) return null
  if (!ctx) {
    try { ctx = new Ctor() } catch { return null }
  }
  // Autoplay policy: the context may start suspended until a user gesture.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

type Note = {
  /** Frequency in Hz. */
  freq: number
  /** Start offset (seconds) from "now". */
  start: number
  /** Duration in seconds. */
  dur: number
  type?: OscillatorType
  /** Per-note gain multiplier (0..1) applied on top of the master gain. */
  gain?: number
}

const MASTER = 0.12 // quiet by default

function playNotes(notes: Note[]): void {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  for (const n of notes) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.value = n.freq
    const t0 = now + n.start
    const peak = Math.max(0.0001, (n.gain ?? 1) * MASTER)
    // Tiny attack + exponential decay → no clicks. (Exponential ramps can't hit 0.)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.02, n.dur))
    osc.connect(g).connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + n.dur + 0.03)
  }
}

export type Sfx =
  | 'discard'   // a tile hits the floor
  | 'draw'      // pick a tile from stock / floor
  | 'takeokey'  // swap a real tile in for an okey on the table
  | 'layoff'    // lay a tile onto an existing meld ("işle")
  | 'open'      // a player opens / lays a new meld
  | 'win'       // you win the hand
  | 'lose'      // hand ends without you winning (or exhaustion)
  | 'turn'      // it becomes your turn
  | 'deal'      // a fresh hand is dealt
  | 'error'     // an illegal move was rejected

/** Play a named sound effect (no-op when sound is disabled/unavailable). */
export function playSfx(name: Sfx): void {
  if (!enabled) return
  switch (name) {
    case 'discard':
      playNotes([{ freq: 196, start: 0, dur: 0.10, type: 'triangle' }])
      break
    case 'draw':
      playNotes([
        { freq: 340, start: 0, dur: 0.06, type: 'triangle', gain: 0.8 },
        { freq: 470, start: 0.05, dur: 0.06, type: 'triangle', gain: 0.8 },
      ])
      break
    case 'takeokey':
      playNotes([
        { freq: 620, start: 0, dur: 0.05, gain: 0.7 },
        { freq: 880, start: 0.05, dur: 0.08, gain: 0.7 },
      ])
      break
    case 'layoff':
      playNotes([{ freq: 660, start: 0, dur: 0.05, type: 'square', gain: 0.4 }])
      break
    case 'open':
      playNotes([
        { freq: 523, start: 0, dur: 0.12 },
        { freq: 659, start: 0.08, dur: 0.12 },
        { freq: 784, start: 0.16, dur: 0.16 },
      ])
      break
    case 'win':
      playNotes([
        { freq: 523, start: 0, dur: 0.12 },
        { freq: 659, start: 0.10, dur: 0.12 },
        { freq: 784, start: 0.20, dur: 0.12 },
        { freq: 1047, start: 0.30, dur: 0.26 },
      ])
      break
    case 'lose':
      playNotes([
        { freq: 330, start: 0, dur: 0.18, type: 'triangle' },
        { freq: 247, start: 0.16, dur: 0.30, type: 'triangle' },
      ])
      break
    case 'turn':
      playNotes([
        { freq: 587, start: 0, dur: 0.14, gain: 0.7 },
        { freq: 880, start: 0.07, dur: 0.16, gain: 0.6 },
      ])
      break
    case 'deal':
      playNotes([0, 1, 2, 3].map((i) => ({
        freq: 300 + i * 45, start: i * 0.06, dur: 0.05, type: 'triangle' as OscillatorType, gain: 0.4,
      })))
      break
    case 'error':
      playNotes([{ freq: 150, start: 0, dur: 0.18, type: 'sawtooth', gain: 0.45 }])
      break
  }
}
