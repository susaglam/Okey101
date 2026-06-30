import { useState } from 'react'
import { submitFeedback, type FeedbackKind } from '../net/feedbackClient'

/**
 * Bottom-right "🐞 Hata Bildir" + "💡 Öneri" buttons + a modal form. Any signed-in
 * player can file a bug (with a game-specific category + optional screenshot) or a
 * suggestion. Submissions are stored server-side and reviewed in the admin panel
 * (no email). Self-contained; only mounted in the online build.
 */
const BUG_CATEGORIES = [
  ['move', 'Taş alma/atma hatası'],
  ['open', 'Açma / işleme (per/çift) hatası'],
  ['finish', 'Bitiş / okey hatası'],
  ['score', 'Puanlama hatası'],
  ['timer', 'Süre / sıra hatası'],
  ['connection', 'Bağlantı / oturum'],
  ['ui', 'Görünüm / arayüz'],
  ['sound', 'Ses'],
  ['other', 'Diğer'],
] as const
const SUGGESTION_CATEGORIES = [
  ['feature', 'Yeni özellik'],
  ['improvement', 'İyileştirme'],
  ['rules', 'Kural / oyun akışı'],
  ['other', 'Diğer'],
] as const
const MAX_SHOT_BYTES = 2_500_000

export function FeedbackWidget({ tableId }: { tableId?: string }) {
  const [kind, setKind] = useState<FeedbackKind | null>(null)
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [shot, setShot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const open = (k: FeedbackKind) => {
    setKind(k); setCategory(''); setMessage(''); setShot(null); setErr(null); setDone(false)
  }
  const close = () => setKind(null)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    if (!f.type.startsWith('image/')) { setErr('Sadece resim dosyası eklenebilir.'); return }
    if (f.size > MAX_SHOT_BYTES) { setErr('Görüntü çok büyük (en fazla ~2.5 MB).'); return }
    const r = new FileReader()
    r.onload = () => { setShot(String(r.result)); setErr(null) }
    r.readAsDataURL(f)
  }

  const submit = async () => {
    if (message.trim().length < 3) { setErr('Lütfen kısaca açıklayın.'); return }
    setBusy(true); setErr(null)
    const r = await submitFeedback({ kind: kind!, category: category || undefined, message, screenshot: shot ?? undefined, tableId })
    setBusy(false)
    if (r.error) { setErr(r.error); return }
    setDone(true)
    setTimeout(() => setKind(null), 1400)
  }

  const cats = kind === 'bug' ? BUG_CATEGORIES : SUGGESTION_CATEGORIES
  const field: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(0,0,0,.34)', color: '#fff7e9', fontSize: 14, width: '100%', boxSizing: 'border-box' }
  const fab: React.CSSProperties = { fontSize: 12, fontWeight: 800, padding: '7px 11px', borderRadius: 999, border: '1px solid rgba(0,0,0,.25)', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.35)' }

  return (
    <>
      <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 350, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => open('bug')} style={{ ...fab, background: 'linear-gradient(180deg,#e9846b,#c5482f)', color: '#fff' }}>🐞 Hata Bildir</button>
        <button onClick={() => open('suggestion')} style={{ ...fab, background: 'linear-gradient(180deg,#f0b53e,#d2811a)', color: '#3a2400' }}>💡 Öneri</button>
      </div>

      {kind && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'linear-gradient(180deg,#23613f,#16482e)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 14, padding: 20, color: '#fff7e9', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '88vh', overflowY: 'auto' }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>{kind === 'bug' ? '🐞 Hata Bildir' : '💡 Öneri / Geliştirme'}</h2>
            {done ? (
              <p style={{ color: '#9be8a8', fontSize: 15 }}>Teşekkürler! Geri bildirimin iletildi. 🙌</p>
            ) : (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700 }}>
                  {kind === 'bug' ? 'Hata türü' : 'Tür'}
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={field}>
                    <option value="">— seç —</option>
                    {cats.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700 }}>
                  {kind === 'bug' ? 'Ne oldu? Nasıl tekrarlanır?' : 'Önerin nedir?'}
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000}
                    placeholder={kind === 'bug' ? 'Örn: Sarı 7 ile yerden okey aldım ama hamle reddedildi…' : 'Örn: El sonunda kazananın taşları açık gösterilsin…'}
                    style={{ ...field, resize: 'vertical' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700 }}>
                  Ekran görüntüsü (isteğe bağlı)
                  <input type="file" accept="image/*" onChange={onFile} style={{ fontSize: 12 }} />
                </label>
                {shot && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={shot} alt="ekran görüntüsü" style={{ maxHeight: 80, maxWidth: 140, borderRadius: 6, border: '1px solid rgba(255,255,255,.3)' }} />
                    <button onClick={() => setShot(null)} style={{ fontSize: 12, padding: '4px 9px', borderRadius: 7, cursor: 'pointer' }}>Kaldır</button>
                  </div>
                )}
                {err && <span style={{ color: '#ffb4b4', fontSize: 13 }}>{err}</span>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={close} style={{ fontSize: 14, padding: '8px 16px', borderRadius: 9, cursor: 'pointer', background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.25)' }}>Vazgeç</button>
                  <button onClick={() => void submit()} disabled={busy} style={{ fontSize: 14, padding: '8px 18px', borderRadius: 9, fontWeight: 800, cursor: 'pointer', border: 'none', background: 'linear-gradient(180deg,#f0b53e,#d2811a)', color: '#3a2400' }}>{busy ? 'Gönderiliyor…' : 'Gönder'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
