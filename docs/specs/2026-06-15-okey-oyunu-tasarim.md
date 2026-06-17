# CS_Okey — Türk Okeyi Oyunu · Tasarım Dokümanı (Spec) — v2

> Durum: TASLAK v2 (red-team revizyonu işlendi) — kullanıcı incelemesi bekliyor
> Tarih: 2026-06-15
> Proje kökü: `e:\cs_okey`
> İmza: `cs_` (codesnap)
> Revizyon notu: 4-boyutlu adversarial red-team (kural/skor, mimari, kod-sadakati, kapsam) bulguları (6 bloker + major + minor) bu sürüme işlendi. Doğrulanan kod gerçekleri §9'da dosya:satır ile.

---

## 0. Özet

Görsel olarak güzel, Türk okeyi mantığını sadık yansıtan, kullanıcı dostu bir Okey oyunu. **Bağımsız React/TypeScript web uygulaması**. Motor **tüm varyantları** kapsayacak şekilde baştan **config-güdümlü**; ilk teslimat (MVP) **Klasik Okey, botlara karşı offline**.

Kalp: **saf, deterministik, UI/ağ bilmeyen motor çekirdeği** + **takılabilir transport adapter'ları**. "offline → LAN → online" = transport değişimi, yeniden yazım değil. Ağ özelliği bilinçli olarak **sonraya** bırakıldı; önce çalışan bir sistem.

### Hedefler
- **Güzel:** referans-tabanlı masa, basamaklı ahşap ıstaka, akıcı drag-drop/animasyon, tema seçici (Klasik Yeşil + Gece).
- **Sadık:** doğrulanmış kurallar; el-değerlendirici Kotlin'den **port** + eski test korpusuna karşı **differential** doğrulama.
- **Kullanıcı dostu:** tek-tuş otomatik dizme, ipucu, net skor ekranı, "Nasıl Oynanır?", renk-körü modu, kaydet/devam et.

### Hedef olmayanlar (şimdilik)
- İnternet çok-oyunculu — mimari hazır, yapılmaz.
- Aynı ağ (LAN) modu — mimari hazır; mekanizma sonra prototiple seçilir.
- Çip/para ekonomisi — yalnız puan (yasal sebeplerle ertelendi).
- 101/Katlamalı/Çanak/51/Eşli oynanabilir UI'ları — motor parametrik kurulur, MVP UI yalnız Klasik.
- **Tur zamanlayıcısı offline MVP'de:** aktif **değil** (tur-zamanı çubuğu kozmetik/pasif). Otomatik-hamle güvenliği yalnız ağ fazında devreye girer. (§7/§8)

---

## 1. Bağlam

| Proje | Ne | Yığın | Katkısı |
|---|---|---|---|
| `okey-game-engine` (enderdincer, v1.4, **MIT**) | Saf kural motoru | Kotlin/JVM | El-değerlendirici **port kaynağı** + testler **oracle** |
| `okey101` ("101 RakipBul") | Sosyal buluşma platformu (oyun değil) | React 19 + Vite + Supabase | İleride link/entegrasyon adayı; şimdilik ayrı |

**Karar:** İkisinden de bağımsız yeni proje (`e:\cs_okey`). Kotlin motoru runtime tüketilmez; evaluator TS'e **port** edilir (MIT → yasal).

> Kotlin motoru klasik-only çekirdektir: puanlama yok, 101/açma yok, gösterge alanı yok, sıra zorlaması yok, ağ/AI yok. Yani "genişletme" değil; Kotlin ağacını **plan/oracle** alan sıfırdan inşadır.

---

## 2. Kapsam ve Fazlar (red-team'e göre yeniden tahmin)

- **Faz 0 — Temeller & risk azaltma (~2-3 hf):** evaluator port + 3-katman test; bug'lar (§9); gösterge/okey + indicator yaşam döngüsü; tohumlu RNG; **evaluator WinKind metası** (net-new); 101 kuralları araştırma-kararı (MVP dışı, kayda geçir).
- **Faz 1 — MVP: Klasik vs bots offline.** Realist tahmin **~7-10 hf** (tek geliştirici) veya **1a/1b** böl (aşağıda §11). Asıl teslimat.
- **Faz 2 — 101 + tam puanlama + Katlamalı.**
- **Faz 3 — Otoritatif online/LAN.**
- **Faz 4 — Çanak/Eşli/51, sosyal, interaktif öğretici, polish.**

**MVP "bitti" tanımı (definition-of-done):** Klasik, 3 bota karşı, tam tur akışı (gösterge→okey, sol-komşu iskartadan/stoktan çekme, sıra+faz zorlaması, per/çift bitiş, okey ile bitiş), **stok tükenmesi=void el**, config klasik puanlama, çok-el maç, kaydet/devam et, güzel masa + ıstaka drag-drop + otomatik dizme + ipucu + skor tablosu + "Nasıl Oynanır?" + ayarlar + iki tema + hata/boş durumlar.

---

## 3. Mimari

### Monorepo
```
e:\cs_okey\
├─ packages\
│  ├─ engine\  @cs-okey/engine  ── SAF TS, sıfır bağımlılık, UI/ağ/DOM bilmez, SAAT okumaz
│  ├─ bot\     @cs-okey/bot     ── platform-nötr saf TS (DOM/window/app import YOK; Node-target build)
│  └─ app\     @cs-okey/app     ── React istemci (Vite + TS)
│      ├─ board\   masa, ıstaka, taşlar, temalar (renderer — store üstünde ince katman)
│      ├─ screens\ menü, lobi, skor tablosu, "Nasıl Oynanır?", ayarlar
│      ├─ theme\   token: Klasik Yeşil / Gece
│      ├─ adapters\ LocalAdapter (MVP) │ [sonra] LanAdapter, CloudAdapter
│      └─ store\   tek doğruluk kaynağı: PlayerView + legalMoves → render
```
> **Sınır kuralı (ESLint no-restricted-imports):** `engine` ve `bot` saf/platform-nötr; DOM/window/`app` import edemez. Böylece aynı bot hem sekme-içi MVP rakibi hem (Faz 3) sunucu-tarafı doldurucu olarak çalışır.

### İlkeler
1. **Motor saf & deterministik.** `Date.now()`/`Math.random()` **yok**. Zaman, motora **olay olarak** girer: `Tick`/`TurnTimeout` olayı, otoritatif timestamp/tur-indeksi payload'da; reduce()'tan geçer ve log'a yazılır. Motor asla saat okumaz.
2. **Gizli bilgi tasarımdan.** İstemci yalnız `redactFor(seat)` çıktısı **PlayerView**'i görür — deste sırası ve rakip taşları ASLA içinde yok (sadece sayım). Tam `GameState` yalnız otoritededir.
3. **Botlar da redactFor'dan geçer (sert değişmez).** Bot girişi: `decide(view: PlayerView, legalMoves): GameEvent`. Bot asla ham `GameState` görmez. Hile izni gerekiyorsa `config.botOmniscient` (varsayılan KAPALI; LAN/online adapter'larda ayarlanamaz).
4. **Transport adapter — gerçek sözleşme (LAN/online'a hazır).**
   ```ts
   type RejectionCode = 'not-your-turn'|'wrong-phase'|'illegal-move'|'stale-version'|'not-winning'|...
   type Status = 'connected'|'reconnecting'|'desync'
   interface Adapter {
     dispatch(intent: GameEvent & { expectedVersion: number }): Promise<{accepted: boolean; reason?: RejectionCode}>
     subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void
   }
   ```
   `PlayerView` monoton `version/stateSeq` taşır; intent `expectedVersion` taşır → otorite bayat hamleyi deterministik reddeder. **LocalAdapter** bunların hepsini *trivially* uygular (senkron resolve, reduce başına version++) → MVP gerçek sözleşmeyi kullanır, sonradan retrofit gerekmez.
5. **Varyant = config, branch değil.** Tek motor, `VariantConfig`.
6. **Meld-çözücü 3 yerde ortak:** kazanma + tek-tuş dizme + bot + (101) ≥101 açma.
7. **Renderer de adapter gibi:** store+PlayerView+legalMoves **tek doğruluk kaynağı**; hem canvas hem DOM **ince renderer/input** katmanı; tüm girdiler (drag/dnd-kit/klavye/mobil tap) **aynı GameEvent intent'ini** üretir, yerel layout'u mutasyona uğratmaz; cross-renderer test aynı intent'i doğrular.

### Teknoloji & a11y kararı (red-team gereği)
- **MVP'de DOM-first board** (dnd-kit + Framer Motion + CSS): basamaklı ıstaka, snap-home, hayalet taş, magnetik snap hepsi DOM ile yapılabilir; canvas'ın erişilebilirlik ağacı yok. Canvas (Konva/Phaser) **gerekiyorsa** sonra, aynı store/intent disiplini üstünde ikinci renderer olarak. **Konva-vs-Phaser kararı, ikinci renderer'a geçilirse** verilir (MVP'yi bloklamaz).
- **zustand** store · **Vite + TS strict** · **PWA**.

---

## 4. Motor Tasarımı (@cs-okey/engine)

### Domain
- `Tile { number?: 1..13, color?: RED|BLACK|BLUE|YELLOW, kind: NUMBER|FALSE_JOKER }`
  - Renkler **kırmızı/siyah/mavi/sarı**. Kotlin enum'u `RED/GREEN/BLACK/YELLOW` (B=BLACK!); **tek değişiklik GREEN→BLUE (mavi)**; RED/BLACK/YELLOW aynı. TS kısa-kodları çakışmasız seç: **R / K(siyah) / M(mavi) / S(sarı)**. Kotlin↔TS taş-string eşleme katmanı (oracle 'G' üretir) §10'da.
- `GameState` (varyantları sürmek için **genişletildi**):
  ```
  { gameId, config, rngSeed, handNo,
    turn: { seat, phase: DRAW|DISCARD, deadlineTickFromSeed? },
    seats: [{ hand|count, hasOpened, openedMelds[], isOut, finishRank, indicatorPairDeclaredTurn1 }],
    stockRemaining: number,                 // çekme yığını sayısı
    discardPiles: Tile[][],                  // her oturak için sıralı iskarta yığını
    indicator: Tile, okey: Tile,             // gösterge ayrı tutulur, çekilemez
    melds: [{ owner, kind: run|group, tiles, layOffCount }],   // 101 masaya açılan
    scores, activeMultiplier, currentOpeningThreshold,         // varyant
    status, terminal: { reason: win|hand-void, winnerSeat?, winType?, finishingTile? } }
  ```
- `PlayerView = redactFor(seat)`: kendi `hand` + açık `melds` + her iskarta yığınının **üst taşı (açık) + altların sayısı** + rakip el **sayıları** + gösterge/okey + sıra/faz + version. (Deste sırası ve rakip el içerikleri YOK.)

### Event-sourcing
`reduce(state, event)` saf. Olaylar: `CreateGame, AddPlayer, StartGame, DrawFromStock, DrawFromDiscard, Discard, OpenMeld(101), LayOff(101), DeclareWin, Tick/TurnTimeout`. Her olay önce `validate` (sıra+faz+yasallık) sonra uygulanır (Kotlin'deki boş validatörlerin — `:57/61/65/69` — yerine gerçek zorlama).

> **Kural motoru iki katmanlı (kullanıcı sorusu):** (a) **deklaratif `VariantConfig`** = sayı/eşik/bayrak; (b) **`rules/<varyant>` modülleri** = basit bayrağa sığmayan **koşullu akış** (ör. 101 işlek-ceza ataması: taş yerden alındı → açıldı mı → cezayı sol komşuya mı alana mı yaz). Tüm ceza/skor `reduce()` içinde **olay** olarak üretilir, event-log'a yazılır → golden testle doğrulanır + replay/audit. Ayrı bir kullanıcı-düzenlenebilir **kural DSL'i gerekmez** (YAGNI); yapılandırılmış TS rule modülleri yeterli, ileride istenirse DSL eklenir.

### Tur/çekme/iskarta kuralları (sadık Klasik)
- **Tur yönü:** **Saat yönü** — oyuncu **sağındakine** taş atar, **solundakinin** attığını alabilir; sıra sağa ilerler (`next=(seat+1)%n`). (Tüm varyantlarda geçerli.)
- **DrawFromDiscard yalnız sol komşunun iskarta yığınının ÜST taşını** alabilir (Kotlin oracle: `discardTileStack`, `findLeftPlayer`, `removeLast`). `legalMoves` bu durumu üretir; bot "soldan al vs stoktan çek" kararı verir.
- **Stok tükenmesi:** `DrawFromStock` stok 0'ken **yasadışı**; stok 0'a inince el **void/berabere** biter (puan yok — config'le ayarlanır), UI durumu + golden test. (Oracle'ın `Player.draw` → `removeLast()` boş-koruması yok = çökerdi; portta korunur.)

### Evaluator (port + net-new)
Kotlin'in özyinelemeli `RackEvaluator`+`Set(group+run)`+`Pair` mantığı TS'e taşınır. Düzeltmeler:
- **13→1 sarma** Kotlin'de config'siz hardcoded (`DefaultTileRunEvaluator.kt:89-97`, `numberOfOnes` koşullu); portta **`config.runWrap13to1`** bayrağı (Klasik açık, 101/51 kapalı).
- **Wild kapasitesi türetilir:** `wilds = count(falseJoker) + count(tiles == okey)` (≤4). Pairs tablosu `numberOfPairs == 7 - k, k ∈ 0..wilds` (tek artan ele dikkat); Kotlin'in `>2 throw`'u **sadece `isWinningByPairs:39`** dalında — hem pairs sayımı hem run/set joker tüketimi 3-4 wild'ı işlemeli. Property test: bir gerçek-okey taşını sahte joker'le değiştirmek `evaluate`'i değiştirmemeli. >2-wild **Faz 0** çıktısı, elle-yazılan golden'larla (oracle bu bölgede throw eder, doğrulayamaz).
- **WinKind metası (net-new, Faz 0):** `evaluate` "nasıl kazanıldı" döndürür: `perOnly | hasPairs | usedOkeyAsFinisher | finishedByDiscardingOkey`. Klasik puanlamanın tamamı buna bağlı. Birden çok kazanan dizilim varsa hangisinin seçileceği tanımlı (çarpanı etkiler). Differential test bunu doğrulayamaz → ayrı golden.

### Gösterge → Okey & StartGame yaşam döngüsü
StartGame: **tohumlu shuffle → dağıt → stok üstünden 1 taş çevir = `indicator`** (çekilebilir stoktan çıkar, tüm el görünür ve **çekilemez**) → `okey = (indicator.number % 13) + 1`, aynı renk (13→1). Başlangıç +1 taşı dağıtıcının sağındaki oyuncuya. **Gösterge sahte okey çıkarsa = "riziko" modu (kanonik varsayılan):** sahte joker'ler okey gibi çalışır VE riziko çarpanları devreye girer (§6). "Yeniden çek" = etiketli **ev kuralı varyantı**, varsayılan değil. ("2 sahte okey = okey" ifadesi kaldırıldı — sahte joker'ler okey'in kimliğini üstlenen ikamelerdir.) Gösterge §7'deki "gösterge eğik" yuvasında gösterilir. `config.goster geMode` (göstergeli on/off).

### RNG
Tohumlu CSPRNG Fisher-Yates; tohum state'te → adil + replay. Bot'un **kendi** tohumlu akışı: `hash(masterSeed,'bot',seat)` (deal akışından bağımsız → bot kararları desteyi etkilemez). Online faz için commit-reveal opsiyonu.

### Kalıcılık (kaydet/devam et)
LocalAdapter `{ seed, event log, son snapshot, maç durumu }`'nu **IndexedDB**'ye yazar; snapshot el sınırında; yüklemede snapshot + replay-tail. Ana menüde "Devam Et". **Bu log/snapshot sözleşmesi Faz 3 reconnect mekanizmasının aynısıdır.**

---

## 5. Varyant Config Şeması

```ts
interface VariantConfig {
  colors: 4; tilesPerColor: 13; copies: 2; falseJokers: 2;     // = 106 (tek deste; 101 dahil)
  players: 2|3|4; teams: boolean;
  tilesInRack: number; starterExtra: number;
  indicatorMode: boolean;                                       // göstergeli on/off
  runWrap13to1: boolean;                                        // klasik:true 101:false
  allowPairsWin: boolean;
  mustThrowFinishingTile: boolean;
  requiresOpening: boolean; openingThreshold: number|'dynamic'; pairsOpenCount: number;
  layOff: boolean; layOffCapPerRun: number;                     // işleme 2
  scoring: ScoringConfig;                                       // riziko boyutu dahil (§6)
  match: { mode: 'countdown'|'hands'|'target'; length: number; eliminateAt?: number };
  turnSeconds: number; autoMoveSafe: boolean; timerActiveOffline: boolean;  // MVP: false
}
```

| Parametre | Klasik | 101 | Katlamalı | Çanak | 51 |
|---|---|---|---|---|---|
| Deste | 106 | **106 (tek deste)** | 106 | 106 | 106 |
| 13→1 sarma | ✅ | ❌ | ❌ | ✅ | ❌ |
| Açma (≥) | yok | 101 | 101 + ratchet | yok | 51 dinamik |
| İşleme (cap) | — | 2/tur | 2/tur | — | var |
| Puan modeli | düz düşme | birikimli ceza | ceza × kat | pozitif + pot | birikimli ceza |
| Maç sonu | config (varsayılan: el sayısı / hedef) | en düşük (11 el) | 11 el | pot biter | en düşük |

> Maç sonu Klasik için "20→0 sayaç" **kanonik değil** — bir config modu (countdown/hands/target); varsayılan olarak el-sayısı/hedef sunulur, 20→0 isteğe bağlı mod.

---

## 6. Puanlama Modelleri (config-güdümlü, onaylı "yaygın" varsayılanlar)

### Klasik (düz düşme) — doğrulandı ✅
- Normal: her rakip **−2**. Okey ile bitiş **×2 → −4**. Çift (7 çift) **×2 → −4**. Çift+okey **−8** (iki ×2 çarpımı). Renkli çiftleme **kapalı** (config). Gösterge eşi ilanı: her rakip **−1** — **tetik penceresi:** eşi tutan oyuncu **ilk hamlesinde/öncesinde** ilan eder (ilk-çekmeden-önce mi tam koşul birincil kaynaktan teyit edilecek).

### 101 (birikimli ceza — Faz 2, MVP dışı; kanonik model kaydedildi)
**Tek kanonik model + öncelik:** Kaybedenin elinde kalan taşların **yüz değerleri toplamı** alınır; elde kalan okey/sahte okey **sabit ceza** ekler (yaygın **+101**; bazı masalar temsil değeri). Bu toplam, **bitiş tipi çarpanıyla** çarpılır (×2 elden/okey/çift; ×4 kombinasyonlar). **(+101'in çarpan-öncesi mi sonrası mı olduğu net belirtilecek.)**
- Bitiren −101; hiç açmayan taban **+202**. Hiç-açmayan cezası **kilitli değil** — bitiş tipiyle **ölçeklenir** (202/404/808). (Kilitli davranış istenirse = etiketli varyant.)
- **Riziko boyutu (ScoringConfig'te ayrı eksen, bitiş-tipi çarpanından bağımsız):** gösterge sahte okey ise tüm merdiven ikiye katlanır → −202 (normal-okey), −404 (riziko-okey / çiften-normal), −808 (çiften-riziko) temsil edilebilir.
- En düşük kümülatif kazanır (11 el).
- **Açık taş alma (işlek), çift ve ceza modeli — kullanıcı kuralları (Faz 2):**
  - **Normal (çifte gitmeyen) oyuncu** sol komşunun taşını alırsa → **hemen elini açmak (yere sermek) zorunda**. Açarsa → sol komşuya **+101**. Açamazsa → taşı **geri bırakmak zorunda** (taş ıstakaya alınıp hesap yapılabilir; tutmazsa iade).
  - **Çifte giden oyuncu:** önce **"çifte gidiyorum" ilan eder** (buton). Sonrasında sol komşunun taşını **alıp elde tutabilir** (hemen açma zorunlu değil; ör. 4. çifti alıp 5. çift için dener). **Açtığı an** (≥5 çift yere serilince; **el bitmesine gerek yok**) → sol komşuya **+101**.
  - **Çift ilanı riski (açamazsa):** "çifte gidiyorum" deyip oyun sonuna kadar **hiç açamazsa** → hiç-açmayan +202 yerine bunun **2 katı** (≈404). **≥5 çift açıp** yere sermiş ama **el bitmemişse** → elinde kalan taş toplamının **2 katı**.
  - **Ceza birikimi:** her ceza türü **standart el başına 1 kez**, türler toplanır (işlek taş atma +101, yanlış okey atma +101, "yerden alınıp açıldı" +101 …). **Ayar:** her türün kendi içinde tekrarı artırılabilir/yinelenebilir.
  - **UX:** sol komşunun iskarta yığını üstünde **"taşı buraya geri bırak"** bölgesi → alıp açamayınca kolay iade + "hangi taşı almıştım" karmaşasını önler.
  - → `rules/101` modülünde **olay-tabanlı koşullu ceza**; `reduce()` ceza olaylarını üretir; golden testlerle doğrulanır. (Bu kurallar **101 oyunu içindir**; Klasik MVP'yi etkilemez.)
- **Deste:** tek 106'lık set (Klasik ile aynı); dağıtım sonrası ince bir kapalı stok kalır (kesin post-deal stok sayısı Faz 2 öncesi birincil kaynaktan doğrulanacak). 212 çift-deste **varsayılan değil**.

**101 açık sorular (Faz 2) — işlek-ceza cross-check'ten (önerilen varsayılanlar; PO onayı bekliyor):**
- **(Yüksek öncelik) Riziko taban birimi:** Merdiven **−202 birimi**nde ifade edilir (normal-okey bitiş −202; çift-normal veya okey-riziko −404; çift+riziko −808). Çift ×2 ve riziko ×2 çarpımsal. ("−101 taban" değil — spec'in −808 örneğine uyar.)
- **(Yüksek öncelik) Flat ceza çarpan kapsamı:** Flat olay cezaları (işlek +101, yanlış-okey +101, elde-okey +101) **çarpılmaz**; bitiş/riziko çarpanları yalnız bitiren skoru + non-finisher kalan-taş/merdiven skoruna uygulanır.
- **Çift hiç-açmaz:** = 2 × aktif non-opener merdiven değeri (rizikosuz **404**, riziko **808**); "≈" kaldırıldı.
- **Başarılı çift bitiren:** bitiren tabanı × çift(×2) (riziko varsa ×) — yani okey/elden ×2 ile aynı kredi.
- **Ceza + kalan-taş:** additif **toplanır** (ikisini de öder).
- **Normal el açma eşiği:** standart 101 minimum ilk-meld değeri açmayı sayar; yalnız geçerli açma sol komşuya +101 tetikler (önemsiz tek meld'le ucuz tetikleme engellenir).
- **Çift ilanı bağlayıcı:** el sonuna kadar geri alınamaz (çift puanlama + başarısızlık cezalarına kilitli).
- **Çift-ilancının yerden alımı:** stok çekme gibi **commit** (al → sağa at, tur biter); "kaldır-hesapla-iade" sadece çift-gitmeyene özgü.
- **Tekrarlı ceza miktarı (ayar ON):** tekrar başına flat +101 (basit baseline); varsayılan OFF (tür başına 1 kez).
- **Stok tükenmesi (101):** el normal skorlanır (−101 bitiren kredisi yok; herkes uygulanabilir cezasını öder); engine'de çökmesiz void/terminal yine eklenir. (Void-replay tercihi PO'ya.)
- **Çift bitiş tanımı / joker değeri:** çift bitiş = 7 geçerli çift (tam rack); 2× kalan cezasında elde-okey/sahte-joker **çarpmadan önce 101** değerlenir.
- **Açmış oyuncu:** açtıktan sonra sonraki turlarda yerden alma serbest (+101 yalnız açma anında, el başına 1 kez); işlek +101 atan oyuncunun meld durumundan bağımsız.
- **Maç sonu:** 11 elin hepsi oynanır; eşitlikte paylaşımlı kazanç (veya PO tercihi); erken eleme yok.
- **Cross-seat çekişme YOK:** taş yalnız atanın sağ komşusunca, sırasında, üst taş alınır → iki oyuncunun aynı taşa talip olması yapısal olarak imkânsız (Mahjong-tarzı "call/grab" interrupt yok; istenirse ayrı özellik).

### Katlamalı (Faz 2)
Standart 101 cezası × aktif **kat**; ratchet kimin açabileceğini belirler.

### Çanak (Faz 4)
Pozitif: kazanan +4/rakip −2; çift +8/−4; okey +12/−6; + pot (ante + carryover). ✅ yön doğrulandı.

---

## 7. Görsel / UX (görsel eşlikçide onaylandı)

- **Tema seçici:** **Klasik Yeşil** + **Gece**; layout iki temada aynı.
- **Masa (referans-tabanlı):** yan oyuncular dikey ahşap + tur-zamanı çubuğu (**MVP'de kozmetik/pasif**); üst oyuncu yatay plaka; ortada stok + **gösterge eğik**; oyuncu plakası etrafında **varyanta göre adapte** butonlar; sağ altta ⚙; ıstakayı çevreleyen iskarta alanları; çekilen taş + kalan stok sayısı.
- **Istaka:** **basamaklı 2 katlı ahşap**; taşlar arası boşluk + **perler arası belirgin boşluk**.
- **Taş:** fildişi + **gri delik**; büyük net rakam; kırmızı/siyah/mavi/sarı. **Sahte okey: ♣ yonca.** Köşede küçük **"=7" temsil değeri** (varsayılan açık). **Renk-körü modu:** şekil ipucu (●■▲◆), varsayılan kapalı.
- **Ana menü:** logo + cüzdan/skor + tema(🌙)/ayar; OYNA; **varyant büyük kartlar (ikon+açıklama)**; bot zorluğu; "Tek Başına (3 bota karşı)" + "Aynı Ağ (yakında)" + "Nasıl Oynanır?"; **"Devam Et"** (kayıtlı oyun varsa).
- **El-sonu skor tablosu:** kazanan + **nasıl-kazanıldı rozeti**; 4 oyuncu bu-el/toplam; "Sonraki El".
- **Hata/boş/kenar durumları:** `legalMoves` UI'ı kapısı (yasadışı aksiyon gri/pasif, dispatch-then-reject yerine); reddedilen intent için non-blocking toast; **DeclareWin butonu yalnız `isWinning` iken aktif** (yanlış bitiş denemesi engellenir); kayıt-yükleme hatası → bilgilendirip yeni oyun.
- **Ayarlar (Faz 1, localStorage):** tema, renk-körü şekil, "=N" temsil değeri, ses, varsayılan bot zorluğu.
- **"Nasıl Oynanır?"**: Faz 1'de statik kural/yardım ekranı; interaktif rehberli öğretici Faz 4.
- Reklam yok.

---

## 8. Bot AI (@cs-okey/bot)

- **Sözleşme:** `decide(view: PlayerView, legalMoves): GameEvent` — yalnız PlayerView (gizli bilgi sızmaz). Platform-nötr (Node'da da koşar).
- **MVP politikası (somut):** (1) meld-çözücüyle her tur en iyi dizilim + "gereken taşlar"; (2) soldan al **ancak** dizilimi kesin iyileştiriyorsa/near-meld tamamlıyorsa; (3) görünen rakip iskartalarını hesaba katarak en az faydalı taşı at; (4) `evaluator.isWinning` olunca bitir; (5) zorluk = ayrık davranışlar: **Kolay** (açgözlü, rakibi yok sayar, ara sıra rastgele atış), **Orta** (sol komşuyu beslemekten kaçınır + güvenli atış), **Zor** (rakip taş takibi + ileri-bakış); + insansı **jitter** (motorun değil bot'un tohumundan).
- Sonra: MIT `101AI` + **EigenBots/ILP** (optimal meld/≥101/auto-arrange), elit "Zor" için IS-MCTS.
- Golden bot-karar testleri.

---

## 9. Doğrulanan Kod Gerçekleri & Tuzaklar (dosya:satır)

| # | Konu | Doğrulanan gerçek | Çözüm |
|---|---|---|---|
| 1 | Renk | enum `RED/GREEN/BLACK/YELLOW`, kısa `R/G/B/Y`, **B=BLACK** (`Tile.kt:44`) | Yalnız **GREEN→BLUE(mavi)**; TS kısa-kod çakışmasız (R/K/M/S); Kotlin↔TS eşleme katmanı (§10) |
| 2 | 13→1 sarma | **config'siz hardcoded**, koşullu (`DefaultTileRunEvaluator.kt:89-97`) — "koşulsuz" demek yanlıştı | `config.runWrap13to1` bayrağı |
| 3 | Joker kapasitesi | throw **yalnız pairs dalında** (`DefaultRackEvaluator.kt:39`); run/set yolu guard'sız tüketir | `wilds=falseJoker+okey` türet; pairs tablosu + run/set 3-4 wild; property test |
| 4 | TR casing | naif `uppercase()` **`Tiles.getTilesFromString` (`Tiles.kt:28`)**'de; `Tile.fromString` zaten case-insensitive (`Tile.kt:11,18`) | Yalnız batch parser'ı locale-invariant yap; `Tile.fromString` dokunma |
| 5 | Validatörler | start/draw/discard boş `// TODO` (`:57/61/65/69`) | Gerçek sıra+faz+yasallık zorlaması yaz |
| 6 | Gizli bilgi | `GameState` tüm rack+center açık (redaction yok) | `redactFor(seat)`; otorite ayrımı; botlar da view'dan |
| 7 | Stok boş çökme | `Player.draw`→`removeLast()` boş-koruma yok | Stok 0 → void el; DrawFromStock yasadışı |
| 8 | Lisans | enderdincer **MIT**; 101AI/makalin MIT | Yalnız MIT reimplement; UNLICENSED/GPL'den kod kopyalanmaz |
| 9 | Auto-move ceza (Faz 3) | — | timer aktifse okey/işlek atmaz (`autoMoveSafe`); MVP'de timer pasif |

---

## 10. Test Stratejisi
- **Differential mekanizması:** Kotlin'i canlı çalıştırmak yerine **`DefaultRackEvaluatorTest` vakalarını TS fixture'larına transkribe et** (pratik) + Kotlin↔TS taş-string eşleme (oracle 'G'→TS 'M').
- **Golden korpus:** elle eller (per/çift/okey, **3-4 wild** dahil — oracle bu bölgede throw eder), **WinKind** vakaları.
- **Property test:** meld doğrulama + okey↔sahte-joker değişmezliği + puanlama değişmezleri (fuzz).
- **Cross-renderer test:** DOM ve (varsa) canvas aynı GameEvent'i üretir.
- **Bot golden:** karar politikası vakaları.
- Her preset için ayrı skor testi.

---

## 11. Yol Haritası

- **Faz 0 (~2-3 hf):** evaluator port + transkribe-differential + golden + property; bug #1-#7 portta; indicator/okey yaşam döngüsü; tohumlu RNG (motor + ayrı bot akışı); **WinKind** + **wild≤4** çıktıları; kalıcılık sözleşmesi taslağı; 101 kuralları (deste/riziko/non-opener) kayda geçir (MVP dışı).
- **Faz 1 — MVP (~7-10 hf; 1a/1b bölünebilir):**
  - **1a (çekirdek döngü):** DOM-first board (masaüstü drag + mobil tap-seç-yerleştir), basamaklı ıstaka; sıra+faz+sol-komşu çekme+iskarta+bitiş zorlaması; stok-void; config klasik puanlama; çok-el maç; **1 bot zorluğu**; kaydet/devam et; hata durumları.
  - **1b (cila & yardımcılar):** tek-tuş **otomatik dizme** (çözücü) + **ipucu**; **3 zorluk**; juice (tık/ses/animasyon); renk-körü modu; 2. tema; "Nasıl Oynanır?" statik; ayarlar; TR-locale güvenli casing.
- **Faz 2 (~4-6 hf):** 101 masa-meld/açma(≥101)/işleme(cap 2)/işlek/finishing-tile/no-wrap; çarpan + riziko puanlama; hesaplı/sabit; void terminal; 101 botu; Katlamalı (ince katman).
- **Faz 3 (~5-7 hf):** transport'u gerçek sunucuya bağla (Colyseus StateView gizli-el; server-shuffle; reconnect = aynı snapshot+replay; timer auto-move-safe aktif); lobi; LAN mekanizması prototiple seç.
- **Faz 4:** Çanak/Eşli/51; bölgesel preset + illegal-combo doğrulama; interaktif öğretici; temalar/sosyal.

---

## 12. Açık Sorular / Sonraki Kararlar
1. **101 post-deal stok sayısı** (tek 106 kesin; kesin kapalı-stok adedi) — Faz 2 öncesi birincil kaynaktan doğrula.
2. **LAN mekanizması** (yerel host vs WebRTC) — Faz 3'te prototiple seç.
3. **İkinci renderer (canvas) gerekli mi, Konva vs Phaser** — ancak DOM-first MVP sonrası, ihtiyaç olursa.
4. **Paket scope** `@cs-okey/*` onayı.
5. `okey101` ile ileride link/entegrasyon istenir mi?
6. Klasik gösterge-eşi −1 tetik penceresi (ilk-çekmeden-önce mi) — birincil kaynak teyidi.

---

## 13. Yeniden Kullanılacak Varlıklar & Referanslar (lisanslı)
- **Evaluator** (enderdincer, **MIT**) → TS port; testler oracle.
- **Event-sourced reducer deseni** → otoritatif reducer + replay/audit + kaydet/devam + Faz 3 reconnect.
- **Colyseus** kart demosu (MIT) → online faz şablonu (StateView gizli-el).
- **sandemiroren1/101AI** (MIT) + **EigenBots/ILP** → 101 botu / optimal meld / auto-arrange.
- **makalin/Okey101** (MIT) → UI/animasyon ilhamı.
- Pagat + tr.wikipedia Okey/101 + barobirlik Eşli 101 PDF → kanonik kural sayıları.
> UNLICENSED/GPL repolar yalnız mimari fikir; **kod kopyalanmaz.**
