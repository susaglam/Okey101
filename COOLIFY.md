# Coolify Deployment

CS Okey'i Coolify üzerinde sıfır manuel işlemle ayağa kaldırmak için adımlar.

Oyun **tamamen istemci taraflı**: motor saf/deterministik, botlar tarayıcıda
`LocalAdapter` ile çalışır. **Backend, veritabanı, environment değişkeni yok.**
Dağıtım = Vite ile statik build → nginx ile sunum.

## 1. Repository

Coolify'ın Git ile bu repo'yu pull etmesi en kolayı:

- **Repo:** `https://github.com/susaglam/Okey101`
- **Branch:** `master`

Repo gizliyse önce Coolify → **Sources** → **GitHub App** bağlantısını kurun.

## 2. Coolify Resource Oluştur

1. Coolify Dashboard → **+ New Resource**
2. Git Repository seçin (yukarıdaki repo + `master` branch)
3. **Build Pack** = **Docker Compose**
4. **Compose Path** = `docker-compose.coolify.yml`

> Alternatif: tek container yeterli derseniz Build Pack = **Dockerfile** seçip
> kök `Dockerfile`'ı kullanabilir, **Ports Exposes** = `80` verebilirsiniz.
> Compose yolu, Başak Bahçe ile aynı konvansiyonu korur (önerilen).

## 3. Environment Variables

**Hiçbiri zorunlu değil.** Statik oyun; admin/DB/JWT yok.

| Değişken | Açıklama |
|----------|----------|
| `SERVICE_FQDN_OKEY_80` | Coolify magic — public domain'i (port 80 → HTTPS terminate) otomatik atar. Dokunmazsanız Coolify üretir. |

## 4. Deploy

Coolify'da **Deploy** butonuna basın. İlk açılışta:

1. `node:22-alpine` build stage: `npm ci` + `vite build` (statik dist üretilir)
2. `nginx:1.27-alpine` runtime: dist `/usr/share/nginx/html`'e kopyalanır, `:80`
3. Healthcheck: `GET /` → 200 (busybox `wget`)

Build bitince domain'i açınca oyun gelir.

## 5. Custom Domain

Coolify **Domain** sekmesinden FQDN'i değiştirin. `SERVICE_FQDN_OKEY_80` otomatik
güncellenir. nginx `base: './'` (göreli) ile derlendiği için kök veya alt-yolda
sorunsuz çalışır.

## 6. Update / Redeploy

- **Git source:** `master`'a yeni commit push'la → Coolify auto-deploy (webhook
  açıksa) ya da **Redeploy** ile manuel.
- `index.html` `no-cache` header'lı sunulur → yeni sürüm anında görünür; hash'li
  `/assets/*` ise `immutable` cache'lenir.

## Lokal Test (opsiyonel)

```bash
docker compose up -d --build   # docker-compose.yml (port 8080)
# → http://localhost:8080
docker compose down
```

## Troubleshooting

- **Build hatası (rollup/rolldown native binding):** lockfile linux musl+gnu
  binding'lerini içerir; `npm ci` alpine'da doğru olanı kurar. Yine de takılırsa
  build log'unu paylaşın.
- **404 (sayfa yenilenince):** nginx SPA fallback (`try_files … /index.html`)
  zaten ayarlı; Compose Path'in doğru dosyayı gösterdiğinden emin olun.
- **Healthcheck failed:** `:80`'de nginx ayakta mı — container log'una bakın.
