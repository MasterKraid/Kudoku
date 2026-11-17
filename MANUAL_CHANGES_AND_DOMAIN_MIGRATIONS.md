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

### G. Comix (`source: 7537715367149829912`)
- **Issue**:
  - Comix extension strips `/title` prefix from URLs during search/browse (storing `/<hid>-<slug>` in `manga.url`).
  - WebUI fallback `originUrl` simply concatenated `baseUrl + url` (`https://comix.to/<hid>-<slug>`), which is an invalid URL structure on Comix (causing 404s when clicking "Open in browser" or "Open in WebView").
  - Uninitialized manga records inserted during search/browse left `real_url` as NULL.
- **Database Fix**:
  - Normalized all 220 Comix titles in `suwayomi.manga` to ensure `real_url` contains the canonical `https://comix.to/title/<hid>-<slug>`.
- **Runtime & Backend Defense**:
  - `MangaDetails.tsx`: Added normalization rule to automatically prefix `/title` to Comix paths and rewrite any legacy `comix.to/<slug>` or `comix.net/<slug>` to `comix.to/title/<slug>`.
  - `MangaList.kt`: Updated batch insert and update logic to immediately compute and store `realUrl` via `httpSource.getMangaUrl(sManga)` for all search and browse results across all extensions.

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

---

## 5. Android Compatibility Layer & Headless WebView (`AndroidCompat`)
Modern Keiyoushi extensions (including Comix) now employ headless browser automation and realistic human input simulation to bypass bot-detection algorithms on web reader frontends.

### A. Touch Event Pipeline (`MotionEvent` & `InputEvent`)
- **Problem**:
  - `libs/android-jar-1.0.0.jar` contains stub classes where constructors and methods throw `RuntimeException("Stub!")`.
  - When Comix executes its chapter harvesting scraper (`assets/harvest_chapters.js`), it completes `insertVisualStateCallback`, fetches `View.getResources().getDisplayMetrics()`, and then instantiates `MotionEvent.PointerProperties` and `MotionEvent.PointerCoords` to simulate realistic touchscreen taps on the WebView.
  - In addition, ShadowJar unpacks `android-jar-1.0.0.jar` with `DuplicatesStrategy.INCLUDE`, causing stub classes in the jar to take precedence over compiled sources if duplicate class names exist.
- **Implementation**:
  - `AndroidCompat/src/main/java/android/view/InputEvent.java`: Implemented the abstract base class and default constructors.
  - `AndroidCompat/src/main/java/android/view/MotionEvent.java`: Full concrete implementation supporting `PointerProperties`, `PointerCoords`, `obtain(...)`, `recycle()`, and property getters.
  - `libs/android-jar-1.0.0.jar`: Stripped `MotionEvent*.class` and `InputEvent.class` out of the stub archive so our compiled classes are the sole versions packaged into `tsundoku.jar`.
  - `AndroidCompat/src/main/java/android/view/View.java` & `ViewGroup.java`:
    - `View.getResources()`: returns `mContext != null ? mContext.getResources() : null;`.
    - `View.dispatchTouchEvent(MotionEvent)` & `ViewGroup.dispatchTouchEvent(MotionEvent)`: Implemented as safe no-ops returning `false` rather than throwing `Stub!`.
  - `AndroidCompat/src/main/java/xyz/nulldev/androidcompat/androidimpl/CustomContext.java`:
    - Configured `FakeResources.displayMetrics` with realistic mobile display metrics (`widthPixels: 1080`, `heightPixels: 1920`, `xdpi: 400.0f`, `ydpi: 400.0f`, `density: 2.0f`) to prevent division by zero in extension calculation routines.
  - `AndroidCompat/src/main/java/xyz/nulldev/androidcompat/webkit/KcefWebViewProvider.kt`:
    - Implemented `insertVisualStateCallback(requestId, callback)` to asynchronously invoke `callback.onComplete(requestId)` via the main Handler looper.

---

## 6. Cloudflare & FlareSolverr Interceptor Resilience
- **Location**: `server/src/main/kotlin/eu/kanade/tachiyomi/network/interceptor/CloudflareInterceptor.kt` & `NetworkHelper.kt`
- **Fixes**:
  - **Chrome `<pre>` Tag Unwrapping**: When FlareSolverr runs headless Chrome to bypass Cloudflare on JSON API endpoints (e.g. Comick, Vortex Scans), Chrome wraps raw JSON payloads inside `<pre style="...">...</pre>` tags and HTML-escapes quotes. The interceptor now unescapes HTML entities with `org.jsoup.parser.Parser.unescapeEntities` and unwraps `<pre>` tags, setting `Content-Type: application/json; charset=utf-8`.
  - **Extended Challenge Timeouts**: FlareSolverr interactive challenges take 20–45 seconds. OkHttp's `readTimeout` was extended to 90 seconds and `callTimeout` to 3 minutes to prevent `SocketTimeoutException` aborts during active challenge solving.
  - **Blank Session Fallback**: Handled empty session names with `.ifBlank { null }` to prevent invalid flare session identifiers.

---

## 7. Comick API Mirror Configuration
- **Location**: `/data/settings/source_4972933717624256217.xml`
- **Configuration**:
  ```xml
  <map>
      <string name="preferred_mirror">https://comick.art</string>
  </map>
  ```
- **Context**:
  - `comick.live` has Cloudflare Under Attack / Turnstile active on its API endpoints, returning 403 to non-browser requests.
  - `comick.art` is Comick's unblocked high-speed API mirror, responding with HTTP 200 in ~100ms.
- **Slug Normalization**:
  - 115 legacy titles stored with hash identifiers (`/comic/<hash>#`) were migrated to canonical text slugs via automated API resolution against the mirror.

---

## 8. Extension Update Invariant
- **Why Extension Updates Cannot Overwrite These Fixes**:
  - Tachiyomi extensions (`/data/extensions/*.jar`) are loaded as modular plugins into Tsundoku's runtime.
  - All modifications made here reside in **Tsundoku's host application layer** (`server/`, `AndroidCompat/`, `webui/`) and **server-side configuration files** (`/data/settings/*.xml`).
  - Updating an extension from Keiyoushi replaces only the individual `/data/extensions/tachiyomi-*.jar` file; it does not touch the core server, Android compatibility layer, or `/data/settings/` preferences.
  - Any future extension that invokes Android WebView visual state callbacks, touch events, or `DisplayMetrics` will transparently benefit from the `AndroidCompat` implementations.

