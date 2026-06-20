/**
 * GSAP Flip yardımcıları — ıstaka yeniden-dizme/sıralama animasyonu.
 *
 * Tasarım notları:
 * - `slots.ts`'teki reconcile()/moveTile()/autoArrange() taş NESNE referanslarını
 *   korur; bu yüzden bir WeakMap<Tile, id> ile her fiziksel taşa kalıcı bir
 *   `data-flip-id` atayabiliriz. Taş slot değiştirince Flip onu eski→yeni konuma
 *   kaydırır (referans aynı kaldığı için id de aynı kalır).
 * - jsdom (vitest) ortamında elemanların layout'u yoktur (genişlik 0); bu durumda
 *   capture no-op döner ve animasyon hiç çalışmaz → testler etkilenmez.
 */
import type { Tile } from '@cs-okey/engine'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'

let registered = false
function ensure(): void {
  if (!registered) {
    gsap.registerPlugin(Flip)
    registered = true
  }
}

// Taş → kalıcı sayısal id eşlemesi (nesne kimliğine göre)
const tileIds = new WeakMap<object, number>()
let nextId = 1

/** Bir taşın kalıcı flip kimliği (DOM data-flip-id değeri). */
export function tileFlipId(t: Tile): string {
  let id = tileIds.get(t)
  if (id === undefined) {
    id = nextId++
    tileIds.set(t, id)
  }
  return 't' + id
}

/**
 * Mevcut [data-flip-id] elemanlarının konum durumunu yakalar.
 * jsdom'da (layout yok) veya eleman yoksa null döner.
 */
export function captureRackFlip(): unknown {
  if (typeof document === 'undefined') return null
  const els = document.querySelectorAll('[data-flip-id]')
  if (els.length === 0) return null
  const first = els[0] as HTMLElement
  // Gerçek layout yoksa (jsdom) animasyonu atla.
  if (!first.getBoundingClientRect().width) return null
  ensure()
  return Flip.getState(els)
}

/**
 * Yakalanan durumdan yeni konumlara akıcı geçiş.
 * @param state captureRackFlip() çıktısı
 * @param duration saniye (sıralama için ~0.42, taşıma için ~0.30)
 */
export function runRackFlip(state: unknown, duration = 0.3): void {
  if (!state) return
  ensure()
  Flip.from(state as ReturnType<typeof Flip.getState>, {
    duration,
    ease: 'power2.inOut',
    stagger: { each: 0.022, from: 'start' },
  })
}
