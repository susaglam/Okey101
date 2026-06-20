import { HelpContent } from './HelpContent'

export default function Help({ onBack }: { onBack: () => void }) {
  return (
    <div className="menu">
      <h1>Nasıl Oynanır?</h1>
      <HelpContent />
      <button onClick={onBack} style={{ marginTop: 24 }}>
        Geri
      </button>
    </div>
  )
}
