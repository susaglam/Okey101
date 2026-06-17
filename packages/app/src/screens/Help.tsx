export default function Help({ onBack }: { onBack: () => void }) {
  return (
    <div className="menu">
      <h1>Nasıl Oynanır?</h1>

      <section style={{ textAlign: 'left', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
        <h2>Taşlar</h2>
        <p>
          106 taş, 4 renk (kırmızı, sarı, mavi, siyah) × 1–13 sayı, 2'şer kopya. Artı 2 sahte okey (yıldız/joker taşı).
        </p>

        <h2>Gösterge → Okey</h2>
        <p>
          Açılan <strong>gösterge</strong> taşıyla aynı rengin bir sonraki sayısı <strong>okey</strong>'dir.
          Gösterge 13 ise 1 okey olur.
        </p>

        <h2>El Oluşturma</h2>
        <p>
          <strong>Seri:</strong> Aynı renkte ardışık en az 3 taş (örn. kırmızı 3-4-5).
        </p>
        <p>
          <strong>Grup:</strong> Aynı sayıdan farklı renklerde en az 3 taş (örn. 7-kırmızı, 7-sarı, 7-mavi).
        </p>
        <p>
          <strong>7 Çift:</strong> 7 farklı çift oluşturarak da bitirilebilir.
        </p>

        <h2>Okey ile Bitme</h2>
        <p>
          Elinizdeki okey taşını kullanarak bitirirseniz <strong>puan × 2</strong> kazanırsınız.
        </p>

        <h2>Puanlama</h2>
        <p>
          Biten oyuncu rakiplerden puan toplar. Rakipler ellerindeki taşlara göre <strong>−2</strong> veya daha yüksek ceza puanı alır; okey taşı tutanlar <strong>−4</strong> alır.
        </p>

        <h2>Tur Akışı</h2>
        <p>
          <strong>Soldan çek</strong> (stoktan) veya atılan son taşı al; <strong>sağa at</strong> (bir taşı çöpe bırak). Sıra sola geçer.
        </p>
      </section>

      <button onClick={onBack} style={{ marginTop: 24 }}>
        Geri
      </button>
    </div>
  )
}
