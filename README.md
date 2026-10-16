# AQW Lodestar

**Browser extension**

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ebaiceinineljleohmdapccokleconkk?label=Chrome&logo=googlechrome&logoColor=white&color=4285F4)](https://chromewebstore.google.com/detail/aqw-lodestar/ebaiceinineljleohmdapccokleconkk)
[![Firefox Add-ons](https://img.shields.io/amo/v/aqw-lodestar?label=Firefox&logo=firefoxbrowser&logoColor=white&color=FF7139)](https://addons.mozilla.org/en-US/firefox/addon/aqw-lodestar/)
[![Extension release](https://img.shields.io/github/v/release/andreassolli/aqw-lodestar?filter=v%2A&label=extension)](https://github.com/andreassolli/aqw-lodestar/releases?q=v1&expanded=true)

**Desktop app**

[![Desktop release](https://img.shields.io/github/v/release/andreassolli/aqw-lodestar?filter=desktop-v%2A&label=desktop&color=c0392b)](https://github.com/andreassolli/aqw-lodestar/releases?q=desktop&expanded=true)
[![macOS](https://img.shields.io/badge/macOS-Apple%20silicon%20%26%20Intel-000000?logo=apple&logoColor=white)](https://github.com/andreassolli/aqw-lodestar/releases?q=desktop&expanded=true)
[![Windows](https://img.shields.io/badge/Windows-x64%20%26%20ARM-0078D6?logo=windows&logoColor=white)](https://github.com/andreassolli/aqw-lodestar/releases?q=desktop&expanded=true)
[![Linux](https://img.shields.io/badge/Linux-AppImage%20%26%20.deb-FCC624?logo=linux&logoColor=black)](https://github.com/andreassolli/aqw-lodestar/releases?q=desktop&expanded=true)

**Project**

[![Downloads](https://img.shields.io/github/downloads/andreassolli/aqw-lodestar/total?label=downloads)](https://github.com/andreassolli/aqw-lodestar/releases)
[![License: MIT](https://img.shields.io/github/license/andreassolli/aqw-lodestar?v=2)](LICENSE)
[![Stars](https://img.shields.io/github/stars/andreassolli/aqw-lodestar?style=flat)](https://github.com/andreassolli/aqw-lodestar/stargazers)

A browser extension for AdventureQuest Worlds players. It adds item previews,
owned-item checkmarks, a farm list, server boosts, merge and quest calculators,
try-on links and more to three sites:

| Site                               | What Lodestar adds                                           |
| ---------------------------------- | ------------------------------------------------------------ |
| **AQW Wiki** (aqwwiki.wikidot.com) | Hover tooltips on item links, owned checkmarks, "Add to farm list" and "Try on" buttons on item pages, a Calculator tab on merge shops, a turn-in calculator on quests, event item lists on *Search Items by Tag*, collection progress, a dark theme, Imgur picture fixes |
| **account.aq.com**                 | Inventory sync (inventory + bank), rarity badges, owned checkmarks, tooltips, foldable inventory categories, "open outfit in AQCloset", character image download (including an HD render with a transparent background), a dark theme |
| **AQCloset** (aqcloset.com)        | Drag-to-reorder wardrobe panels, tooltips (with an on/off switch), owned borders, right-click menus, filling AQCloset's inventory import from the synced inventory |

Plus the **toolbar popup**: active server boosts and when they're next, *Check bag*,
the *Items to Farm* list, a dark/light switch and settings.

The popup also comes as a **desktop app** for Mac, Windows and Linux that can
stay on top of every other window, the game included. See
[Desktop app](#desktop-app).

It runs in **Chrome** (and other Chromium browsers: Edge, Brave, Opera) **121+**
and **Firefox 140+**, from one code base. Install it from the
[Chrome Web Store](https://chromewebstore.google.com/detail/aqw-lodestar/ebaiceinineljleohmdapccokleconkk)
or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/aqw-lodestar/).

There's no bundler, no framework and no `npm install`: every file is plain
JavaScript/CSS that the browser loads as it is. The only tool is a small Node
script that packages the two store versions. (The desktop app in `desktop/` is
the exception: it's built with Electron, so it has its own `npm install`.)

---

## Contents

- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [How it fits together](#how-it-fits-together)
- [Where the data comes from](#where-the-data-comes-from)
- [Storage](#storage)
- [Messages to the background](#messages-to-the-background)
- [Chrome and Firefox differences](#chrome-and-firefox-differences)
- [Building and releasing](#building-and-releasing)
- [Desktop app](#desktop-app)
- [Common changes](#common-changes)
- [Debugging](#debugging)
- [Code style](#code-style)

---

## Quick start

**Chrome (while developing):** open `chrome://extensions`, turn on *Developer mode*,
press *Load unpacked* and pick **this folder** (the one with `manifest.json`).
After editing a file, press the reload button on the extension's card, then
reload the page you're testing on.

**Firefox (while developing):** Firefox needs its own manifest, so build first:

```sh
node scripts/build.mjs
```

Then open `about:debugging#/runtime/this-firefox`, press *Load Temporary
Add-on…* and pick `dist/firefox/manifest.json`. Run the build again (and press
*Reload*) after each change. Temporary add-ons are removed when Firefox closes.

**Store packages:** `node scripts/build.mjs` also writes
`dist/aqw-lodestar-chrome-<version>.zip` and
`dist/aqw-lodestar-firefox-<version>.zip`. See
[Building and releasing](#building-and-releasing).

Node 18 or newer is all the build needs.

---

## Project layout

```
manifest.json          The Chrome manifest (the Firefox one is generated from it)
background.js          Background: cross-origin fetches, item catalog, context menus, tabs
scripts/build.mjs      Builds dist/chrome, dist/firefox and the store zips

shared/                Used in more than one context (pages, popup, background)
  constants.js         `ext` (browser/chrome API), STORAGE_KEYS, WIKI_ORIGIN, ITEM_CATALOG_URL
  text.js              Name helpers: normalizeItemName, getBaseName, getItemLinkLabel, ...
  messaging.js         Page/popup side of the background API: fetchPage, fetchText,
                       queryItemCatalog, lookupItems, tryOnItem
  wiki-parser.js       Fetching and parsing wiki item pages
  aqcloset.js          AQCloset API: item search, thumbnails, wardrobe links
  inventory.js         The synced inventory as an "owned" lookup (watchOwnedItems)
  inventory-import.js  Reads account.aq.com's inventory data (Sync button, desktop paste import)
  farm-entry.js        Building and saving farm list entries
  image-proxy.js       Replacing Imgur pictures where Imgur is blocked
  rarity.js / .css     Rarity badges (Rare, Seasonal, ...)
  backup.js            Export / import of everything saved

content/               Content scripts, injected into the three sites
  page.js              PAGE (which site/page this is) + icon URLs as CSS variables
  base.css             Shared colours for everything injected
  item-preview.js/.css Builds the item card used by tooltips and item lists
  hover-tooltip.js     The hover tooltip
  owned-marks.js/.css  Green checkmarks and borders for owned items
  farm-context.js/.css Right-click menu support
  theme.js/.css        Dark theme for the wiki and character pages
  ── wiki only ──
  farm-buttons.js/.css   "Add to farm list" buttons
  try-on-buttons.js/.css "Try on" buttons
  merge-calc.js/.css     Merge shop and quest calculators
  item-lists.config.js   The event item lists (edit this to add lists)
  item-list-view.js      The item list buttons, filter and cards (also used by the desktop app's Item Lists plugin)
  item-lists.js/.css     Places the item lists on the Search Items by Tag page; their styles
  collection-progress.js/.css  Owned counter on collection lists
  wiki-images.js         Item picture swap where Imgur is blocked
  ── account.aq.com only ──
  inventory-sync.js/.css     "Sync inventory" button
  account-page.js/.css       Rarity badges, outfit button, image download menu
  inventory-sections.js/.css Foldable inventory categories
  ── aqcloset.com only ──
  aqcloset-page.js/.css   Tooltip switch, wiki links on item names
  reorder.js/.css         Drag-to-reorder panels
  aqcloset-import.js/.css Filling AQCloset's inventory import

render/                Character image download (account.aq.com)
  capture.js           Canvas → image file (content script)
  main-world.js        HD render with the page's Flash player (runs in the page's own world)
  CharacterRender.swf  The Flash file used for the HD render

popup/                 The toolbar popup
  popup.html / popup.js  Page and entry point
  tabs.js              The tab row: Farm and other pages, Settings, theme switch
  boosts.js            Active server boosts and the boost schedule
  inventory-check.js   "Check bag"
  farm-list.js         Items to Farm
  add-item-modal.js    "Add item from link"
  settings.js          Settings view
  theme-toggle.js      Dark/light switch
  popup.css / search-bar.css

options/               The backup page (opened from Settings)
icons/                 Toolbar icons (lodestar16/48/128) and pictures used in pages and the popup
fonts/                 Poppins (popup, backup page, AQCloset additions)

desktop/               The desktop app (Electron), running the popup above; see desktop/README.md
  plugins/             Desktop plugins: item-lists and class-enhancements come with the app; ultra-assistant (boss callouts) is a separate download
.github/workflows/     desktop.yml builds the desktop app's installers and plugin zips on GitHub
```

Every file starts with a comment saying what it does; read that first.

---

## How it fits together

### The contexts

An extension runs in several separate places that can't see each other's
variables:

| Context                 | Files                                         | Can do                                                       |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| **Background**          | `background.js` + the shared files it imports | Cross-origin requests to any site in `host_permissions`, context menus, opening tabs. No DOM (`document`, `window`): in Chrome it's a service worker. |
| **Content scripts**     | `content/*`, `render/capture.js`, `shared/*`  | Read and change the page. Requests to other sites go through the background. |
| **Page world**          | `render/main-world.js`                        | Runs inside the page's own JavaScript (`"world": "MAIN"`), only to use the page's Ruffle Flash player. Talks to content scripts with `window.postMessage`. |
| **Popup / backup page** | `popup/*`, `options/*`, `shared/*`            | Extension pages.                                             |

### Plain scripts, shared globals

There are no imports. Each context loads a list of plain scripts in order, and
everything a script defines at the top level (`const ext`, `STORAGE_KEYS`,
`normalizeItemName`, `ItemPreview`, ...) is visible to the scripts loaded after
it. Scripts that only need private code wrap themselves in `(() => { ... })()`.

That makes **load order matter**:

- Content scripts: the `"js"` arrays in `manifest.json`. Each site has **one**
  entry listing everything it needs, shared files first (see
  [why](#chrome-and-firefox-differences)).
- Popup: the `<script>` tags at the bottom of `popup/popup.html`.
- Backup page: the `<script>` tags in `options/options.html`.
- Background: the `importScripts(...)` call at the top of `background.js`.

### Talking to the background

Content scripts and the popup call functions from `shared/messaging.js`
(`fetchPage`, `fetchText`, `queryItemCatalog`, `lookupItems`, `tryOnItem`).
Each sends a message to the background and resolves with its answer, or with
`null` if the background couldn't be reached. `background.js` defines functions
with the **same names** that do the work directly, so shared files such as
`shared/aqcloset.js` call `fetchText()` without caring where they run.

### Features and their files

- **Hover tooltip:** `hover-tooltip.js` notices hovered item links and asks
  `ItemPreview.load()` (item-preview.js) for the item. That fetches the wiki page
  through the background (`wiki-parser.js`) and AQCloset thumbnails
  (`aqcloset.js`), and `ItemPreview.fill()` draws the card.
- **Owned items:** `inventory-sync.js` saves the inventory when the button is
  pressed, reading the response with `shared/inventory-import.js` (the desktop
  app uses the same file for an inventory pasted in). `shared/inventory.js` turns it into a name → count lookup and tells
  subscribers when it changes (`watchOwnedItems`). `owned-marks.js`,
  `merge-calc.js`, `collection-progress.js` and the item lists read it. Names
  are always compared with `normalizeItemName()` so every feature agrees.
- **Farm list:** entries are built by `shared/farm-entry.js` from the right-click
  menu (`background.js` → `farm-context.js`), the buttons (`farm-buttons.js`)
  or the popup (`add-item-modal.js`), and shown by `popup/farm-list.js`. Every
  view updates through `storage.onChanged`.
- **Item lists:** `item-list-view.js` (placed on the page by `item-lists.js`) asks the background for the items matching a
  list's filter (`queryItemCatalog`), draws cards straight from the catalog, then
  fills in full tooltip details as cards scroll into view. The *Filter* button
  above the cards narrows a list to AC items, Member items (the wiki's `legend`
  tag) and/or neither, and can leave out owned items; the choice is saved for
  every list. "Event Hub" is left out of the card locations (it's on nearly every
  seasonal item).
- **Server boosts:** `popup/boosts.js` reads the Artix calendar page, finds boost
  events by keywords in their titles, and caches them for 12 hours.
- **Character image:** `account-page.js` either captures the Flash canvas already
  on the page (`render/capture.js`), or asks `render/main-world.js` to render the
  character again with `render/CharacterRender.swf` at 3× size.

---

## Where the data comes from

| Source                                                       | Used for                                                     | Fetched by                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **Item catalog**: `ITEM_CATALOG_URL` in `shared/constants.js` (raw.githubusercontent.com/andreassolli/lodestar-updates) | Item lists, rarity badges on character pages, "Owned items" cards, Imgur test pictures | `background.js`, at most once a day, kept in storage. It's rebuilt daily from the wiki by a GitHub Actions workflow in the **lodestar-updates** repository. |
| **Wiki item pages** (aqwwiki.wikidot.com)                    | Tooltip details, farm entries, card details                  | `background.js` (`fetchPage`), cached 5 minutes              |
| **AQCloset API** (aqcloset.com/api)                          | Item thumbnails, try-on links, character outfits             | `shared/aqcloset.js` through `fetchText`                     |
| **Artix calendar** (www.artix.com/calendar)                  | Server boosts                                                | `popup/boosts.js` through `fetchText`, cached 12 hours       |
| **account.aq.com**                                           | The logged-in player's inventory (Sync), a character's public inventory (Check bag) | `inventory-sync.js` (with the page's own login) and `popup/inventory-check.js` |
| **game.aq.com**                                              | A character's id for Check bag, game files for the HD render | `popup/inventory-check.js`, the Flash player                 |
| **i.imgur.com**                                              | Checking whether Imgur is blocked here                       | `background.js`, every 15 minutes at most                    |

Nothing is ever sent to a server of ours: there isn't one. Everything the
extension saves stays in the browser's extension storage.

---

## Storage

Everything is in `storage.local` (`ext.storage.local`). The key names live in
`STORAGE_KEYS` in `shared/constants.js`; use those, never the strings.

| Key                              | Holds                                                        | In backups            |
| -------------------------------- | ------------------------------------------------------------ | --------------------- |
| `farmItems`                      | The farm list                                                | yes                   |
| `username`                       | The character name from *Check bag* (used for try-on)        | yes                   |
| `theme`                          | `'dark'` / `'light'`                                         | yes                   |
| `inventory`, `inventorySyncedAt` | The synced inventory and when it was synced                  | yes                   |
| `tooltipPlacement`               | `'side'` / `'anchored'`                                      | yes                   |
| `imgurImages`                    | `'auto'` / `'replace'` / `'direct'`                          | yes                   |
| `collapsedInventorySections`     | Folded character page categories                             | yes                   |
| `itemListFilter`                 | The item lists' filter (AC / Member / neither, owned items)  | yes                   |
| `moduleOrder:<path>`             | AQCloset panel layouts (not in STORAGE_KEYS; see reorder.js) | yes                   |
| `itemCatalog`                    | The daily item catalog                                       | no (downloaded again) |
| `boostSchedule`                  | Parsed boost calendar                                        | no                    |
| `imgurCheck`                     | Last "is Imgur blocked here?" result                         | no                    |
| `imgurProxyPreferred`            | The image proxy that last worked (in image-proxy.js)         | yes                   |
| `boostCache`, `resourceCache`    | Old caches, only removed on start                            | no                    |

Which keys are left out of backups is decided by `SKIPPED_KEYS` in
`shared/backup.js`. A new setting is backed up automatically; a new cache should
be added to `SKIPPED_KEYS`.

`unlimitedStorage` is requested because the item catalog is larger than the
default storage quota.

---

## Messages to the background

Handled in `MESSAGE_HANDLERS` in `background.js`:

| `type`          | Sent by              | Does                                                         |
| --------------- | -------------------- | ------------------------------------------------------------ |
| `FETCH_PAGE`    | `fetchPage()`        | Fetches an HTML page → `{ html, baseUrl }` or `{ error }`    |
| `FETCH_TEXT`    | `fetchText()`        | Fetches any text → string or `null`                          |
| `QUERY_ITEMS`   | `queryItemCatalog()` | Items matching a list filter, from the catalog, inventory or farm list |
| `LOOKUP_ITEMS`  | `lookupItems()`      | Rarity and tags for items by name / wiki path (character page badges) |
| `TRY_ON`        | `tryOnItem()`        | Opens AQCloset wearing the saved character's outfit plus an item |
| `OPEN_WARDROBE` | account-page.js      | Opens a character's outfit in AQCloset                       |
| `CHECK_IMGUR`   | image-proxy.js       | Whether Imgur is blocked here                                |

And from the background to a tab: `GET_LINK_TEXT` and `SAVE_TO_FARM` (right-click
menu, handled in `farm-context.js`); from the popup to an AQCloset tab:
`FILL_AQCLOSET_INVENTORY` (`aqcloset-import.js`).

---

## Chrome and Firefox differences

The code is the same; the differences are handled in a few places:

- **`ext` instead of `chrome`/`browser`.** `shared/constants.js` sets
  `const ext = globalThis.browser ?? globalThis.chrome`. Both return promises
  (Chrome since version 121), so always use `ext.` and `await`.
- **Background.** Chrome runs `background.js` as a service worker and loads the
  shared files with `importScripts()`. Firefox runs it as an event page and loads
  the same files from `"background": { "scripts": [...] }` in its manifest. The
  build script reads the `importScripts()` list to write that, so the list only
  lives in one place. Either way the background is stopped when idle, so don't
  keep state in variables that must survive: put it in storage.
- **Manifest.** `manifest.json` is Chrome's. The build makes Firefox's by
  replacing `background`, removing `minimum_chrome_version` and adding
  `browser_specific_settings` (the add-on id, minimum version 140 and
  `data_collection_permissions: none`). The add-on id
  (`aqw-lodestar@lodestar.addon`) must never change once it's published.
- **Extension URLs in CSS.** `chrome-extension://` vs `moz-extension://` can't be
  written in a stylesheet, so `content/page.js` puts the URLs CSS needs in
  variables (`--aqwt-icon-circle`, ...) and `aqcloset-page.js` registers the font
  from JavaScript. Pages can only load files listed in `web_accessible_resources`.
- **Requests with the page's login.** In Firefox, `fetch` in a content script
  doesn't send the site's cookies; `inventory-sync.js` uses `content.fetch` there.
- **One content script entry per site.** Chrome doesn't always inject separate
  `content_scripts` entries in the order they're listed. (The AQCloset entry used
  to run before the shared files, so `ext` didn't exist yet and the panel handles
  never appeared.) So each site has a single entry with the shared files first,
  and nothing relies on the order *between* entries.

---

## Building and releasing

```sh
node scripts/build.mjs
```

It checks that every file the manifests mention exists, then writes:

| Output                                    | Use                                                 |
| ----------------------------------------- | --------------------------------------------------- |
| `dist/chrome/`                            | Load unpacked in Chrome to test the exact package   |
| `dist/firefox/`                           | Load in `about:debugging` to test the exact package |
| `dist/aqw-lodestar-chrome-<version>.zip`  | Upload to the Chrome Web Store                      |
| `dist/aqw-lodestar-firefox-<version>.zip` | Upload to addons.mozilla.org                        |

Only the extension's own folders go in (`INCLUDE` in the script): not this
README, `scripts/`, `dist/` or dotfiles like `.DS_Store`.

### Releasing a new version

1. Raise `"version"` in `manifest.json` (both stores refuse a version they've
   already seen). Use `1.0.1` for fixes, `1.1.0` for features.
2. `node scripts/build.mjs`
3. Test `dist/chrome/` and `dist/firefox/` once each.
4. Upload the zips:
   - [Chrome Web Store](https://chromewebstore.google.com/detail/aqw-lodestar/ebaiceinineljleohmdapccokleconkk):
     Developer Dashboard → the item → *Package* → *Upload new package*.
   - [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/aqw-lodestar/):
     Developer Hub → the add-on → *Upload New Version*.

### Store listing notes

Both stores ask why each permission is needed:

| Permission                                        | Why                                                          |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `storage`                                         | Saves the farm list, synced inventory, settings and caches   |
| `unlimitedStorage`                                | The daily item catalog is larger than the default quota      |
| `contextMenus`                                    | "Add to Items to farm" and "Try on item" on right-click      |
| aqwwiki.wikidot.com, account.aq.com, aqcloset.com | The sites the extension adds features to; also reads wiki item pages for tooltips |
| game.aq.com                                       | Looks up a character for Check bag; game files for the HD render |
| www.artix.com                                     | Reads the event calendar for server boosts                   |
| raw.githubusercontent.com                         | Downloads the daily item catalog                             |
| i.imgur.com                                       | Checks whether Imgur pictures are blocked in the user's country |

- **Data collection:** none. Firefox's manifest says so
  (`data_collection_permissions`). In the Chrome Web Store's *Privacy* tab, state
  that no user data is collected. The website's privacy policy explains it in full.
- **Remote code:** none. All code is in the package; the item catalog is data.
- **Source code for Firefox review:** not needed, as nothing is minified or
  generated.

---

## Desktop app

`desktop/` turns the toolbar popup into an app for **Mac, Windows and Linux**,
with the same server boosts, *Check bag*, *Items to Farm* list, *Add item from
link*, dark/light switch and backups. What it adds:

- **Stay on top:** keeps the window above every other window, including the
  game. Use the pin button in the header, *Settings → Window*, *View → Stay on
  Top*, or ⌘⇧T / Ctrl+Shift+T. It's remembered along with the window's size and
  position.
- **Menu bar / tray icon:** a compass in the Mac menu bar (system tray on
  Windows and Linux) that shows or hides the window. Right-click it for
  *Stay on Top* and *Quit*.
- **Import from Chrome:** *Settings → Browser extension* copies the farm list,
  synced inventory and settings from the extension in Chrome, Edge, Brave,
  Vivaldi, Opera or Arc in one click. It reads the extension's storage straight
  from the browser profile, so the extension needs no changes. It only copies
  from the browser to the app. Firefox users move data with a backup file
  (*Export* in the extension, *Import…* in the app).

- **Plugins:** extra features with a tab of their own next to *Farm*, managed
  in *Settings → Plugins*. Two come with the app:
  - [Item Lists](desktop/plugins/item-lists/README.md): the wiki's event item
    lists, with the same filter, in their own tab or window. The *Owned items*
    list takes an inventory pasted from account.aq.com, since the app has no
    Sync button.
  - [Class Enhancements](desktop/plugins/class-enhancements/README.md): the
    class guide from aqw.app (turned off until you turn it on).

  Others are a zip from the release, installed with *Install plugin…*: the
  [Ultra Assistant](desktop/plugins/ultra-assistant/README.md) watches the
  game's traffic during ultra boss fights and shows who should Taunt or Zone
  next. How to write and build plugins:
  [desktop/README.md → Plugins](desktop/README.md#plugins).

The app runs **this repository's own popup code**: `desktop/scripts/copy-extension.mjs`
copies `popup/`, `shared/`, `options/`, `icons/`, `fonts/` and `background.js`
into the app at build time, and the extension's `background.js` runs in the
app's main process. So a change to the popup reaches the app the next time it's
built. Web-page features (tooltips, right-click menus and so on) aren't part of
the app.

### Running and building it

Needs Node 22 (Electron's installer has trouble with Node 24).

```sh
cd desktop
npm install
npm start          # copies the popup files in and opens the app
npm run dist:mac   # or dist:win / dist:linux: installers in desktop/dist/
```

To release, raise `"version"` in `desktop/package.json` and push a tag starting
with `desktop-v` (for example `git tag desktop-v1.0.0 && git push origin desktop-v1.0.0`).
The *Desktop app* workflow (`.github/workflows/desktop.yml`) builds on GitHub's
Mac, Windows and Linux machines and attaches the installers to a release:

| File                                                        | For                           |
| ----------------------------------------------------------- | ----------------------------- |
| `AQW-Lodestar-<version>-mac-universal.dmg`                  | Mac (Apple Silicon and Intel) |
| `AQW-Lodestar-<version>-setup-x64.exe` / `-setup-arm64.exe` | Windows installer             |
| `AQW-Lodestar-<version>-portable.exe`                       | Windows, without installing   |
| `aqw-lodestar_<version>_<arch>.deb`                         | Ubuntu, Debian, Mint          |
| `AQW-Lodestar-<version>-x86_64.AppImage`                    | Other Linux distributions     |

The builds aren't signed with a paid certificate, so the first launch asks for
confirmation: on a Mac, right-click → *Open* (or *System Settings → Privacy &
Security → Open Anyway*); on Windows, *More info → Run anyway*.

[`desktop/README.md`](desktop/README.md) has the details: how each file works,
where the app keeps its data, the install screens and icons, and signing.

---

## Common changes

**Add an event list** to *Search Items by Tag*: add an entry to `ITEM_LISTS` in
`content/item-lists.config.js`. The comment at the top explains every field; tag
names are the wiki's own (listed at the bottom of every item page).

**Add a page to the popup:** add a tab button to `.tabs` in
`popup/popup.html` (`role="tab"`, `data-tab="<name>"`, `aria-controls="<panel id>"`)
and a `<section id="<panel id>" class="tab-panel" role="tabpanel" hidden>` for its
content; `popup/tabs.js` does the rest. The page then shows in the extension
and the desktop app. (With only *Farm*, the tab row is hidden.) For a page only
in the desktop app, make it a plugin instead
([desktop/README.md → Plugins](desktop/README.md#plugins)).

**Add or adjust a boost type:** `GROUPS` at the top of `popup/boosts.js`. An
event counts for a type when one of its `keywords` is in the calendar title
(lowercased, `#` removed).

**Add a content script:** put the file in `content/` and add it to the site's
entry in `manifest.json` (both `"js"` and, if it has one, `"css"`), after the
shared files. If it's needed on several sites, add it to each of their entries.

**Use a shared file in the background:** add it to the `importScripts(...)` call
in `background.js`. Firefox picks it up from there at build time. It must not
touch `document` or `window` when it loads.

**Add a setting:** add its key to `STORAGE_KEYS`, read it with
`ext.storage.local.get`, and listen to `ext.storage.onChanged` if pages should
react without a reload. It's included in backups automatically.

**Point to a different item catalog:** change `ITEM_CATALOG_URL` in
`shared/constants.js` (and its host in `host_permissions` if it moves off
raw.githubusercontent.com). It must be JSON shaped like
`{ "generatedAt": "...", "items": { "/wiki-path": { "name", "tags", "rarity", "price", "locations", "images" } } }`.

**Add a picture or icon:** put it in `icons/` (keep it small: 128 px is plenty
for anything shown at icon size) and use `ext.runtime.getURL('icons/…')`.

---

## Debugging

- **Background errors and logs:** Chrome → `chrome://extensions` → *Inspect views:
  service worker*. Firefox → `about:debugging` → *Inspect*.
- **Content script logs:** the page's own DevTools console. In Chrome, pick the
  extension in the console's context dropdown to run code in its world.
- **Popup:** right-click the popup → *Inspect*.
- **Errors Chrome caught:** the *Errors* button on the extension's card.
- **Stored data:** in the background console, `await ext.storage.local.get(null)`.
  To force a fresh item catalog: `await ext.storage.local.remove('itemCatalog')`.
- **A site changed its HTML:** most features find elements by the site's own
  classes and ids (`#page-content`, `a.item`, `.object .label .name`, ...). The
  selectors are near the top of each content script.

---

## Code style

- Plain modern JavaScript, no build step. Two-space indents, single quotes,
  semicolons.
- Every file starts with a comment saying what it does and where it runs.
- Injected CSS classes and ids start with `aqwt-` (`lip-` in the popup and a few
  older places) so they never clash with the sites' own.
- Never send user data anywhere. Anything new that contacts a site must be added
  to the privacy policy and to the permission notes above.

## License

The code is under the [MIT License](LICENSE): anyone may use, copy, change and
share it, as long as they keep the copyright notice. AdventureQuest Worlds
artwork and names belong to Artix Entertainment, and the Poppins font has its
own license (`fonts/OFL.txt`); neither is covered by the MIT License.
