/**
 * Ghost-tile uçuş animasyonları — taşın bir konteynerden diğerine (rack → iskarta,
 * rack → masa, merkez → rack) uçtuğu çapraz-konteyner geçişler. GSAP Flip yalnızca
 * TEK konteyner içinde çalıştığı için (bkz. flip.ts) burada geçici bir "ghost"
 * (klon) düğümü <body>'ye eklenip kaynak dikdörtgenden hedefe animasyonla taşınır
 * ve bitince kaldırılır.
 *
 * jsdom (vitest) ve `prefers-reduced-motion` durumlarında tamamen no-op olur ve
 * Promise hemen çözülür → testler etkilenmez, hareket-azaltma tercihine saygı duyulur.
 */
import { gsap } from 'gsap'

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Animasyonların çalışabileceği bir ortam var mı (gerçek DOM + hareket izinli). */
export function animationsEnabled(): boolean {
  if (typeof document === 'undefined') return false
  if (reducedMotion()) return false
  return true
}

function rectOf(x: Element | DOMRect | null | undefined): DOMRect | null {
  if (!x) return null
  if (x instanceof DOMRect) return x
  const r = (x as Element).getBoundingClientRect()
  return r
}

/** Klon ghost'undan, eşleşme sorunlarına yol açacak kimlikleri temizle. */
function stripIds(el: Element): void {
  el.removeAttribute('data-testid')
  el.removeAttribute('data-flip-id')
  el.removeAttribute('data-seat')
  el.removeAttribute('id')
  el.querySelectorAll('[data-testid],[data-flip-id],[data-seat],[id]').forEach((c) => {
    c.removeAttribute('data-testid')
    c.removeAttribute('data-flip-id')
    c.removeAttribute('data-seat')
    c.removeAttribute('id')
  })
}

export interface FlyOpts {
  /** Görünüşü için klonlanacak eleman (örn. rack taşı veya iskarta üst taşı). */
  clone: Element | null | undefined
  /** Başlangıç konumu (eleman ya da hazır DOMRect). */
  from: Element | DOMRect | null | undefined
  /** Bitiş konumu (eleman ya da hazır DOMRect). */
  to: Element | DOMRect | null | undefined
  durationSec?: number
  delaySec?: number
  ease?: string
  /** Uçuş sonunda ghost'u soldur (varsayılan: hayır — hedefte beliren gerçek taşa karışmasın diye genelde true iyi). */
  fadeOut?: boolean
  /**
   * Verilirse: uçuş boyunca bu gerçek hedef elemanı GİZLE (opacity 0) ve ghost
   * inince GÖSTER. Böylece "önce animasyon, sonra göster" olur — taş zaten yerinde
   * görünürken üstünden hayalet uçmaz; taş, hayalet inince belirir.
   */
  revealTarget?: Element | null
}

/**
 * Bir ghost taşı `from` → `to` uçurur. `clone` elemanı görünüm için klonlanır.
 * Promise uçuş bitince (veya no-op ise hemen) çözülür.
 */
export function flyTile(opts: FlyOpts): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!animationsEnabled()) { resolve(); return }
    const from = rectOf(opts.from)
    const to = rectOf(opts.to)
    const cloneSrc = opts.clone
    if (!from || !to || !cloneSrc || !from.width || !to.width) { resolve(); return }

    // "Animation first, then show": hide the real destination tile for the flight
    // so the ghost lands AS the tile, instead of flying over an already-visible one.
    const reveal = (opts.revealTarget ?? null) as HTMLElement | null
    if (reveal) reveal.style.opacity = '0'

    const ghost = cloneSrc.cloneNode(true) as HTMLElement
    stripIds(ghost)
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: '0',
      zIndex: '350', // ENDED overlay (z-400) üstünü kapamasın; tıklamaları da engellemesin
      pointerEvents: 'none',
      transform: 'none',
      transition: 'none',
    } as Partial<CSSStyleDeclaration>)
    document.body.appendChild(ghost)

    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)

    gsap.to(ghost, {
      x: dx,
      y: dy,
      opacity: opts.fadeOut ? 0 : 1,
      duration: opts.durationSec ?? 0.3,
      delay: opts.delaySec ?? 0,
      ease: opts.ease ?? 'power2.inOut',
      onComplete: () => { ghost.remove(); if (reveal) reveal.style.opacity = ''; resolve() },
    })
  })
}

/**
 * A looping "ghost hand" move hint: a 👆 cursor drifts from `from` to `to` a few times
 * to show the player the engine-suggested move (take this tile / discard here). Returns
 * a cancel fn; no-op (returns a no-op canceller) when animations are disabled or the
 * endpoints are missing.
 */
export function ghostHandHint(
  from: Element | DOMRect | null | undefined,
  to: Element | DOMRect | null | undefined,
  repeat = 3,
): () => void {
  if (!animationsEnabled()) return () => {}
  const a = rectOf(from), b = rectOf(to)
  if (!a || !b || !a.width || !b.width) return () => {}
  const hand = document.createElement('div')
  hand.textContent = '👆'
  hand.setAttribute('aria-hidden', 'true')
  Object.assign(hand.style, {
    position: 'fixed',
    left: `${a.left + a.width / 2 - 15}px`,
    top: `${a.top + a.height / 2 - 6}px`,
    fontSize: '30px',
    zIndex: '360',
    pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.6))',
    transform: 'none',
  } as Partial<CSSStyleDeclaration>)
  document.body.appendChild(hand)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const tl = gsap.timeline({ repeat: Math.max(0, repeat - 1), onComplete: () => hand.remove() })
  tl.set(hand, { x: 0, y: 0, opacity: 0 })
    .to(hand, { opacity: 1, duration: 0.2 })
    .to(hand, { x: dx, y: dy, duration: 0.9, ease: 'power1.inOut' })
    .to(hand, { opacity: 0, duration: 0.25 })
    .to(hand, { duration: 0.35 }) // brief pause between loops
  return () => { tl.kill(); hand.remove() }
}

/** Bir testid ya da seçici ile ilk eşleşen elemanı bul (yoksa null). */
export function q(selector: string): Element | null {
  if (typeof document === 'undefined') return null
  return document.querySelector(selector)
}
