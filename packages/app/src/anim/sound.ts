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

/** A decaying white-noise burst — used for applause (oscillators can't do crowds). */
function playNoise(dur: number, gain = 0.5, hp = 800): void {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const frames = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, frames, c.sampleRate)
  const data = buf.getChannelData(0)
  // Pseudo-random (deterministic-ish) noise; the engine forbids Math.random in the
  // ENGINE but the client UI may use it freely.
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = c.createBufferSource(); src.buffer = buf
  const filt = c.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp
  const g = c.createGain()
  g.gain.setValueAtTime(Math.max(0.0001, gain * MASTER), now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  src.connect(filt).connect(g).connect(c.destination)
  src.start(now); src.stop(now + dur + 0.05)
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
  | 'penalty'   // a flat penalty was applied to someone (işlek / okey-discard)
  | 'error'     // an illegal move was rejected
  | 'laugh'     // someone discarded the OKEY by mistake — a cheeky giggle
  | 'funny'     // someone discarded an işlek tile — a comic slide
  | 'applause'  // a player finished the hand
  | 'applauseLong' // an okey-finish — longer applause + a "bravo" flourish
  | 'warn'      // last-turn warning (stock about to run out — open/act now)
  | 'gong'      // resonant "dong" — the last-turn alert
  | 'tick'      // clock tick — each of the turn timer's last 10 seconds
  | 'bell'      // time's-up bell/buzzer — the auto-action fires
  | 'winNormal' // a regular (per/run) finish
  | 'winPairs'  // a çift (5-pairs) finish
  | 'winElden'  // elden bitme (nobody else opened) — the big one
  | 'winOkey'   // finishing ON the okey — the grandest

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
    case 'penalty':
      // Descending "uh-oh" motif — distinct from the harsher 'error' buzz.
      playNotes([
        { freq: 466, start: 0, dur: 0.16, type: 'triangle', gain: 0.7 },
        { freq: 349, start: 0.15, dur: 0.30, type: 'triangle', gain: 0.7 },
      ])
      break
    case 'error':
      playNotes([{ freq: 150, start: 0, dur: 0.18, type: 'sawtooth', gain: 0.45 }])
      break
    case 'laugh':
      // Cheeky "he-he-he" — bouncy descending blips.
      playNotes([0, 1, 2, 3].map((i) => ({
        freq: 720 - i * 70, start: i * 0.11, dur: 0.08, type: 'square' as OscillatorType, gain: 0.5,
      })))
      break
    case 'funny':
      // Comic slide-whistle: quick rise then a flop down.
      playNotes([
        { freq: 400, start: 0, dur: 0.07, type: 'triangle', gain: 0.6 },
        { freq: 620, start: 0.06, dur: 0.07, type: 'triangle', gain: 0.6 },
        { freq: 880, start: 0.12, dur: 0.07, type: 'triangle', gain: 0.6 },
        { freq: 300, start: 0.20, dur: 0.18, type: 'triangle', gain: 0.6 },
      ])
      break
    case 'applause':
      playNoise(1.1, 0.6)
      break
    case 'applauseLong':
      // Longer crowd + a rising "bravo!" triad on top.
      playNoise(2.4, 0.7)
      playNotes([
        { freq: 659, start: 0.05, dur: 0.16 },
        { freq: 880, start: 0.20, dur: 0.16 },
        { freq: 1175, start: 0.36, dur: 0.34 },
      ])
      break
    case 'warn':
      // Urgent double beep — "act now, stock is running out".
      playNotes([
        { freq: 880, start: 0, dur: 0.14, type: 'square', gain: 0.5 },
        { freq: 1175, start: 0.16, dur: 0.20, type: 'square', gain: 0.5 },
      ])
      break
    case 'gong':
      // A struck-gong "dong": a soft strike transient + a low fundamental with a couple
      // of inharmonic overtones and a long decay, so it rings/resonates.
      playNoise(0.09, 0.4, 1800)
      playNotes([
        { freq: 146, start: 0, dur: 1.9, type: 'sine', gain: 1.0 },
        { freq: 392, start: 0, dur: 1.5, type: 'sine', gain: 0.4 },
        { freq: 790, start: 0, dur: 1.1, type: 'sine', gain: 0.22 },
        { freq: 1180, start: 0, dur: 0.8, type: 'sine', gain: 0.13 },
      ])
      break
    case 'tick':
      // Short, dry clock tick (one per second in the final 10s).
      playNotes([{ freq: 1500, start: 0, dur: 0.035, type: 'square', gain: 0.5 }])
      break
    case 'bell':
      // Time's-up bell/buzzer — two bright dings with a little ring.
      playNotes([
        { freq: 1318, start: 0, dur: 0.4, type: 'sine', gain: 0.9 },
        { freq: 1976, start: 0, dur: 0.35, type: 'sine', gain: 0.4 },
        { freq: 1318, start: 0.18, dur: 0.4, type: 'sine', gain: 0.7 },
      ])
      break
    case 'winNormal':
      // Bright ascending flourish + a short round of applause.
      playNoise(1.2, 0.55)
      playNotes([
        { freq: 523, start: 0, dur: 0.12 },
        { freq: 659, start: 0.10, dur: 0.12 },
        { freq: 784, start: 0.20, dur: 0.18 },
      ])
      break
    case 'winPairs':
      // Echoed/paired motif for a çift finish (each note doubled), + applause.
      playNoise(1.4, 0.55)
      playNotes([
        { freq: 587, start: 0, dur: 0.09 }, { freq: 587, start: 0.11, dur: 0.09 },
        { freq: 880, start: 0.26, dur: 0.09 }, { freq: 880, start: 0.37, dur: 0.15 },
      ])
      break
    case 'winElden':
      // "Elden bitme" (the 800) — a bold, dramatic fanfare + long, loud applause.
      playNoise(2.8, 0.8)
      playNotes([
        { freq: 392, start: 0, dur: 0.16, type: 'square', gain: 0.6 },
        { freq: 523, start: 0.16, dur: 0.16, type: 'square', gain: 0.6 },
        { freq: 784, start: 0.34, dur: 0.18, gain: 0.7 },
        { freq: 1047, start: 0.54, dur: 0.36, gain: 0.7 },
      ])
      break
    case 'winOkey':
      // Finishing ON the okey — the grandest: a rising bravo run + long applause.
      playNoise(2.6, 0.78)
      playNotes([
        { freq: 659, start: 0.04, dur: 0.15 },
        { freq: 880, start: 0.19, dur: 0.15 },
        { freq: 1175, start: 0.34, dur: 0.18 },
        { freq: 1568, start: 0.54, dur: 0.36 },
      ])
      break
  }
}
