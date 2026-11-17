# Manual Database & Domain Migration Records

## 1. Context & Purpose
When importing backups (e.g. `.tachibk`) or migrating across manga providers, some manga sources migrate to new domains, change their URL path structures, or decommission legacy CDN hostnames. 

This document records all manual fixes, database updates, and runtime defenses implemented so future APK (extension) updates or database synchronizations remain fully aware of these configurations and do not regress them.

---

## 2. Manga Source & Domain Migrations

### A. Kagane (`source: 4024736764982024684`)
- **Issue**:
  - Legacy URLs stored without a path separator (e.g., `https://kagane.org019c29b9-d2d5-7d34-888c-67b95f0480af`) due to string concatenation without a slash.
  - Kagane decommissioned `kagane.org` and its thumbnail CDN `yuzuki.kagane.org` (DNS NXDOMAIN).
  - Kagane's active domain is `kagane.moe`.
- **Database Fix**:
  - `real_url`: Updated from `https://kagane.org<UUID>` to `https://kagane.moe/series/<UUID>`.
  - `thumbnail_url`: Updated from `https://yuzuki.kagane.org/api/v2/image/<UUID>` to `https://kagane.moe/api/v2/image/<UUID>`.
- **Runtime Defense**:
  - `MangaDetails.tsx`: Regex-rewrites any incoming URL matching `^https?:\/\/kagane\.org\/?([0-9a-fA-F-]+)` to `https://kagane.moe/series/$1`.
  - `Mangas.ts`: Rewrites `yuzuki.kagane.org` to `kagane.moe` when generating thumbnail proxy URLs.

### B. Manganato (`source: 1024627298672457456`)
- **Issue**:
  - `manganato.com` was sold/hijacked and redirects to a spam/wheel site (`spinzywheel.com`).
  - `chapmanganato.to` is dead/timing out.
  - `natomanga.com` and `manganami.com` were intermediate redirects.
  - The live active Manganato platform is `https://www.manganato.gg/manga/<slug>`.
- **Database Fix**:
  - Backfilled and updated all 134 Manganato manga `real_url`s to point to `https://www.manganato.gg/manga/<slug>`.
- **Runtime Defense**:
  - `MangaDetails.tsx`: Dynamically intercepts any legacy domains (`manganato.com`, `natomanga.com`, `manganami.com`, `chapmanganato.to`) and redirects to `https://www.manganato.gg`.

### C. MangaK / Mangabuddy (`source: 5020395055978987501`)
- **Issue**:
  - `mangak.org` has no DNS resolution.
  - `res.mbbcdn.com` cover CDN is offline.
  - MangaK's official domain is `https://mangak.io` and its active cover CDN is `https://rx.resmk.org/covers/<slug>.webp`.
- **Database Fix**:
  - `real_url`: `https://mangak.org/...` -> `https://mangak.io/...`.
  - `thumbnail_url`: `https://res.mbbcdn.com/thumb/<name>.png` -> `https://rx.resmk.org/covers/<name>.webp`.
- **Runtime Defense**:
  - `MangaDetails.tsx`: Rewrites `mangak.org` to `mangak.io`.
  - `Mangas.ts`: Automatically maps `res.mbbcdn.com` to `rx.resmk.org/covers/*.webp`.

### D. Comick (`source: 4972933717624256217`)
- **Issue**:
  - Legacy manga records had hash paths (e.g. Manga 241: `/comic/4gd9_8d9#`) and dead cover URLs (`https://meo.comick.pictures/rBZwB-s.jpg#`).
  - Comick retired old numeric IDs and redirected them to full text slugs (`maoyuu-maou-yuusha-kono-watashi-no-mono-tonare-yuusha-yo-kotowaru`).
- **Database Fix**:
  - `url`: Updated to the canonical slug (`maoyuu-maou-yuusha-kono-watashi-no-mono-tonare-yuusha-yo-kotowaru`).
  - `thumbnail_url`: Updated to live image CDN (`https://meo.comick.pictures/Z8pM23.png`).

### E. Kappa Beast (`source: 2598579144085032375`)
- **Issue**:
  - Kappa Beast migrated from legacy WordPress (`/manga/...` with dead `wp-content/uploads/` thumbnails) to Strapi/Payload CMS (`/series/<slug>#<documentId>` and `https://strapi.kappabeast.com/uploads/...`).
  - Affected titles: 525, 526, 550, 569.
- **Database Fix**:
  - `url` and `thumbnail_url` updated to the Strapi API document IDs and live cover uploads (e.g. Manga 526: `ano-toki-tasukete-itadaita-monster-musume-desu-isekai-ossan-kyoushi-totsuzen-no-moteki-ni-konwaku-suru#gq9zi3f1ll1xbc04y7hlctyz`, cover: `https://strapi.kappabeast.com/uploads/monster_v4_1931251411.jpg`).

### F. MangaNato / Mangakakalot CDN (`avt.mgicdn.com`)
- **Issue**:
  - `avt.mgicdn.com` was decommissioned and redirected to spam domain `spinzywheel.com`, causing Tsundoku's backend thumbnail proxy to return HTTP 500 (`spinzywheel.com: Name or service not known`).
  - Affected titles: 24, 155, 25, 43, 186, 23, 229, 81, 128, 183, 216, 226.
- **Database Fix**:
  - Migrated all 12 titles to permanent, high-resolution MangaDex cover art.

---

## 3. How Extensions & Relative URLs Protect Against Future Domain Migrations
1. **Relative Paths vs Hardcoded Absolute Domains**:
   - In Tachiyomi/Mihon architecture, extension APKs declare an internal `baseUrl` (e.g., `override val baseUrl = "https://kagane.moe"`).
   - When an extension updates upstream, it updates this `baseUrl` constant inside the APK.
   - If the database stores a **relative path** (e.g., `/series/<UUID>` for Kagane or `/manga/<slug>` for Mangakakalot):
     - The extension automatically prepends its *current* `baseUrl` when fetching chapters and details.
     - When an APK updates its domain (e.g., from `.com` to `.xyz`), it immediately points to `.xyz` without any manual database edit!
   - Storing hardcoded absolute URLs (`https://old-domain.com/...`) is what caused issues when domains expired. Cleaning them to relative paths ensures future APK updates adapt automatically.
2. **WebUI Runtime Fallbacks**:
   - In `webui`, `originUrl` dynamically resolves relative paths against the extension's live `source.baseUrl`.
3. **WebUI Serve Directory Invariant**:
   - Tsundoku serves WebUI from `/tmp/Tachidesk/webUI-serve` at runtime (copied from `/data/webUI` or built bundle). When updating frontend assets without a full container rebuild, assets must be placed into both `/tmp/Tachidesk/webUI-serve` and `/data/webUI`.

---

## 4. Platform-Agnostic Top Bar Customization
- **Settings Path**: **Settings > Appearance > Top Bar**
- **Independent Configurations**:
  - **Desktop**:
    - `libraryBarHeight`: default 56px (range 32–72px).
    - `categoryBarHeight`: default 48px (range 24–56px).
    - `autoHide`: auto-hides on scroll down, reveals on scroll up.
    - `showOnHover`: reveals when mouse hovers over top screen edge.
  - **Mobile / Smartphone**:
    - `libraryBarHeight`: default 48px (range 32–72px).
    - `categoryBarHeight`: default 40px (range 24–56px).
    - `autoHide`: auto-hides on scroll down, reveals on scroll up.
    - `showOnHover`: disabled on touch devices to prevent sticky hover states.
- **Persistence**: Stored in `suwayomi.globalmeta` under key `topBarSettings` as JSON.
