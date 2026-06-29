/**
 * Reusable rules content, shared by the full Help screen (menu) and the in-game
 * help modal. `variant` emphasises the relevant ruleset; when omitted, both the
 * Klasik and 101 sections are shown.
 */
export function HelpContent({ variant }: { variant?: 'klasik' | 'yuzbir' }) {
  const showKlasik = variant !== 'yuzbir'
  const show101 = variant !== 'klasik'

  return (
    <section className="help-content" style={{ maxWidth: 520, margin: '0 auto' }}>
      <h2>Taşlar</h2>
      <p>
        106 taş: 4 renk (kırmızı, sarı, mavi, siyah) × 1–13 sayı, 2'şer kopya, + 2 sahte okey (♣).
        Sahte okey JOKER DEĞİLDİR — okey değerindeki düz taş gibi kullanılır.
      </p>

      <h2>Gösterge → Okey</h2>
      <p>
        Göstergeyle aynı rengin bir sonraki sayısı <strong>okey</strong>'dir (gösterge 13 ise okey 1).
        Gerçek okey taşı <strong>tam joker</strong>dir, her taşın yerine geçer.
      </p>

      <h2>El Oluşturma</h2>
      <p><strong>Seri:</strong> Aynı renkte ardışık ≥3 taş (örn. kırmızı 3-4-5). Klasik'te 13-1 sarması serbesttir (…12-13-1).</p>
      <p><strong>Grup:</strong> Aynı sayıdan farklı renklerde 3–4 taş (örn. 7-kırmızı, 7-sarı, 7-mavi).</p>

      <h2>Tur Akışı</h2>
      <p>
        <strong>Stoktan çek</strong> ya da <strong>solundaki</strong> oyuncunun attığı son taşı al; <strong>sağdaki</strong>
        oyuncunun önüne bir taş at. Sıra sağa döner. Taşları sürükle-bırak ile diz, at, çek.
      </p>

      {showKlasik && (
        <>
          <h2>Klasik — Bitiş & Puanlama</h2>
          <p>Tüm taşları perlere bağlayıp son taşı atarak ya da <strong>7 çift</strong> ile bitirilir.</p>
          <p>Okey ile bitirirsen puan <strong>×2</strong>. Biten, rakiplerden puan toplar; okey tutan daha ağır ceza alır.</p>
        </>
      )}

      {show101 && (
        <>
          <h2>101 — El Açma</h2>
          <p>
            Açmak için yere serdiğin perlerin toplamı <strong>≥101</strong> olmalı (okey, yerleştiği değeri sayar; sahte okey kendi değerini).
            Alternatif: <strong>5 çift</strong> ile <strong>Çift Aç</strong>. El toplamın ıstakanın üstünde canlı gösterilir.
          </p>
          <p>
            <strong>Önemli:</strong> Açma değeri ve hangi perlerin gönderileceği <em>senin ıstakadaki dizilimine</em> göredir —
            okeyi nereye koyduysan o değeri sayar. "Sırala" sadece en iyi diziliş önerisidir.
          </p>

          <h2>101 — İşleme & Diz</h2>
          <p>
            Açtıktan sonra elindeki taşı yerdeki bir pere <strong>sürükleyip işleyebilirsin</strong> (per başına tur başına en çok 2).
            Yeni per/çift dizmek için <strong>Seri Diz</strong> / <strong>Çift Diz</strong>. Daima elinde atacak <strong>≥1 taş</strong> kalmalı.
          </p>

          <h2>101 — Çift / Seri Rotası & İşlek</h2>
          <p>
            Seri açtıysan sadece seri/grup, çift açtıysan sadece çift dizebilirsin (<strong>Çifte Git</strong> bağlayıcıdır).
            Solundakinin attığı taşı alıp açarsan, sol komşuya <strong>işlek cezası</strong> yazılır.
          </p>

          <h2>101 — Okeyi Yerden Alma</h2>
          <p>
            Yerdeki bir perde okey başka bir taşın yerine kullanılıyorsa, o gerçek taş sende varsa onu okeyin üstüne
            sürükle: okey eline döner, istediğin gibi yeniden kullanırsın.
          </p>

          <h2>101 — Puanlama</h2>
          <p>
            En düşük toplam kazanır. <strong>Biten −101</strong> (eksi = iyi) alır.
            <strong>Hiç açamayan +202</strong>, çift ilan edip açamayan <strong>+404</strong> yer.
          </p>
          <p>
            <strong>Açıp bitiremeyen</strong> elinde kalan taşların toplamını yer (çift açmışsa bu toplamın <strong>2 katı</strong>).
            Elde her taş kendi sayısı kadar sayılır; <strong>gerçek okey 101</strong>; <strong>sahte okey ise o el okeyin denk geldiği sayı kadar</strong> (örn. okey 8 ise 8).
          </p>
          <p>
            <strong>Bitiş çarpanı herkese işler:</strong> okeyle biten ×2, çiftle biten ×2, ikisi birden ×4 — o elde herkesin puanı katlanır. <em>Riziko</em> ayrıca ×2.
          </p>
          <p>
            <strong>Elden bitme (800):</strong> kimse açmadan açıp bitirirsen tüm masa <strong>×2</strong> daha yer (okey/çiftle çarpışır: elden+okey ×4, elden+çift+okey ×8). Biten de aynı oranda fazla düşer.
          </p>
          <p>
            <strong>Düz cezalar (+101, çarpılmaz):</strong> işlek besleme · yerdeki pere işlenebilen taşı atma · okeyi atma · açtıktan sonra okeyi elinde tutma.
          </p>
          <p>
            <strong>Eşli mod:</strong> 2 takım (Sen + karşı). Herkes kendi cezasını yazdırır ama puanlar takımca toplanır; en düşük toplamlı takım kazanır. Bir eş <strong>bitince</strong> diğer eşin el-sayısı silinir (düz cezaları kalır).
          </p>
        </>
      )}
    </section>
  )
}
