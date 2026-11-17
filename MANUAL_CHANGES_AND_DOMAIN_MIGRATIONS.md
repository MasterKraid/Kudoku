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

---

## 3. Why Updating APKs Will NOT Break This
1. **Separation of Concerns**:
   - APK updates in Tsundoku / Suwayomi only update the extension JAR/APK in `/data/extensions/` and the `suwayomi.extension` metadata table.
   - APK updates do **not** mutate existing `suwayomi.manga.real_url` or `thumbnail_url` records in PostgreSQL.
2. **Defensive Runtime Normalization**:
   - The WebUI contains runtime guards in `MangaDetails.tsx` and `Mangas.ts`. Even if an old APK or cached state outputs a legacy domain or missing slash, the frontend catches and rewrites it before rendering or opening in an external tab.
3. **Database Snapshot Safe**:
   - A full dump snapshot is taken and saved at `db_snapshots/` prior to any major operation.

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
