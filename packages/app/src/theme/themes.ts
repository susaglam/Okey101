export function applyTheme(id: 'klasik' | 'gece'): void {
  if (typeof document === 'undefined') return
  document.body.dataset.theme = id
}
