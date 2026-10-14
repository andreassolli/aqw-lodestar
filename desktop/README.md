# AQW Lodestar Desktop

The extension's popup as its own app for Mac, Windows and Linux: active server boosts
and when they're next, *Check bag*, the *Items to Farm* list, *Add item from
link*, the dark/light switch and backups. It can **stay on top of every other
window**, so the boosts and your farm list stay in view while you play.

Turn "stay on top" on or off with:
- the pin button at the top of the window,
- *Settings → Window → Stay on top*,
- *View → Stay on Top* in the menu, or **⌘⇧T** (Mac) / **Ctrl+Shift+T** (Windows and Linux).

The app remembers it, along with the window's size and position.

A compass in the menu bar (Mac) or system tray (Windows, Linux) shows or hides
the window with a click; right-click it for *Stay on Top* and *Quit*. (On Linux
it opens that menu on any click, as most Linux desktops only allow a menu
there.) The icons are in `renderer/tray/`: `trayTemplate.png` is the black Mac
version, which macOS recolours for light and dark menu bars.

Extra features come as **plugins** (see [Plugins](#plugins)):
- [Item Lists](plugins/item-lists/README.md): the wiki's event item lists in their own tab or window. Comes with the app.
- [Class Enhancements](plugins/class-enhancements/README.md): aqw.app's class guide (enhancements and consumables per class and boss). Comes with the app, turned off.
- [Ultra Assistant](plugins/ultra-assistant/README.md): boss callouts during ultra fights. Installed separately from *Settings → Plugins*.

## How it works

The app runs **the extension's own code**. There's no second copy to keep up
to date:

| File | What it does |
| --- | --- |
| `scripts/copy-extension.mjs` | Copies `popup/`, `shared/`, `options/`, `content/`, `icons/`, `fonts/` and `background.js` from the extension into `desktop/app/`, and adds the desktop extras to the popup and backup pages. Runs before every `npm start` and build. |
| `main.js` | The window, the stay-on-top setting, the menu, and serving `app/` at `app://lodestar/`. Links open in the default browser. |
| `preload.js` | Gives the pages the extension API they expect (`browser.storage`, `browser.runtime.sendMessage`, `browser.tabs.create`) and passes each call to `main.js`. |
| `background-host.js` | Runs the extension's `background.js` (plus the shared files it imports) in the main process, so wiki pages, the boost calendar, Check bag and try-on work exactly as in the extension. |
| `storage.js` | Stands in for `storage.local`: one JSON file per key in the app's data folder. |
| `chrome-import.js` | *Import from Chrome*: finds and reads the extension's data in Chromium browsers' profiles. |
| `plugin-host.js` | Plugins: finds, installs, starts, turns off and removes them (see [Plugins](#plugins)). |
| `zip.js` | Reads plugin zips when installing, and writes them when building. |
| `renderer/` | Desktop-only additions: the pin button, the Window setting, wording without browser tabs, and `plugins.js` (plugin tabs and *Settings → Plugins*). |
| `plugins/` | Plugins, each in its own folder. Separate downloads, except the built-in ones listed under `build.extraResources` in `package.json`. |

So a change to the popup in the extension is picked up by the app the next time
it's built. Don't edit `desktop/app/`: it's generated and git ignores it.

**What's different from the extension:**
- **Not in the app:** the right-click menu, tooltips and everything else that
  runs on web pages, so the *Tooltip* and *AQCloset* settings are hidden.
- **Own data:** the app keeps its own farm list and inventory, separate from the
  browser. *Settings → Import from Chrome* copies them over from the extension
  in one click (see below). From Firefox, use *Export* in the extension and
  *Import…* in the app; both use the same backup file.
- **Links and try-on** open in your default browser.

### Import from Chrome

*Settings → Browser extension → Import from Chrome* copies the farm list,
synced inventory and settings from the extension in Chrome, Edge, Brave,
Vivaldi, Opera, Arc or Chromium, with no change to the extension.

Chrome keeps each extension's `storage.local` in the browser profile, in
`Local Extension Settings/<extension id>/`, as a LevelDB database.
`chrome-import.js` looks through every profile of every Chromium browser it
knows, recognises Lodestar's folder by its storage keys (so the extension's id
doesn't matter), and reads it with a small built-in LevelDB reader. It only
reads, so it's safe while the browser is open.

- The newest copy is used. If several profiles or browsers have Lodestar, a
  list appears under the button to import another one instead.
- Like importing a backup, the extension's values replace the app's. The app's
  data is saved first to `backups/before-import-<date>.json` in the data folder,
  which *Import…* can load back.
- It's one way, browser to app: other programs can't write into Chrome's
  storage while it's running.
- Firefox keeps extension data in a different format, so it isn't covered.

Data folder (plugins are in `plugins/` and `plugin-data/` inside it):
- Mac: `~/Library/Application Support/AQW Lodestar/`
- Windows: `%APPDATA%\AQW Lodestar\`
- Linux: `~/.config/AQW Lodestar/`

## Plugins

Plugins add features that not everyone wants in the standard app, such as
features that need extra permissions or native code. They're separate
downloads, and the app works the same without them.

**Built-in plugins** come with the app instead: *Item Lists* (on) and *Class
Enhancements* (off until turned on). They're
listed under `build.extraResources` in `desktop/package.json`, which copies
them into the app's `resources/plugins/` folder. In *Settings → Plugins* they
say "comes with Lodestar", and can be turned off but not removed. To build
another one in, add its folder there the same way (only plugins without npm
dependencies; one with native code has to stay a separate download per platform).
A plugin whose `plugin.json` has `"defaultEnabled": false` starts turned off;
once someone turns any plugin on or off, that choice is kept.

A built-in plugin can still be updated without a new app: installing a newer
zip of it replaces it (*Use built-in version* goes back). When a later app
brings a newer version than the installed zip, the app's version is used.

### Using them

*Settings → Plugins* lists what's installed:

- **Install plugin…** picks a plugin's `.zip` file. It starts the next time
  Lodestar starts (**Restart now** appears).
- **Turn off / Turn on** and **Remove** also apply on the next start. A running
  plugin can't be unloaded safely, and on Windows its files can't even be
  deleted while it's running.
- **Open folder** shows where installed plugins live: `plugins/` in the app's
  data folder (see below). Each plugin's own files and settings are in
  `plugin-data/<id>/` next to it.

A plugin with a page gets a tab next to *Farm*, and the tabs, Settings and the
theme switch get a row of their own under the logo, which then grows to fill
its row up to the pin. With no plugin pages (Item Lists turned off and nothing
installed), the tab row is hidden and Settings and the theme switch sit next to
the logo, as before.

A plugin built for another platform, another processor or an older Lodestar is
refused when installing, with the reason (for example "built for Windows;
download the Mac version").

**Plugins run with the same access as the app itself** (files, network,
windows), so only install plugins you trust.

### Writing a plugin

A plugin is a folder in `desktop/plugins/<id>/` with a `plugin.json`:

```json
{
  "id": "ultra-assistant",
  "name": "Ultra Assistant",
  "version": "1.0.0",
  "description": "One or two sentences for Settings → Plugins.",
  "apiVersion": 1,
  "main": "main.js",
  "page": {
    "title": "Ultra",
    "icon": "page/icon.svg",
    "html": "page/page.html",
    "css": "page/page.css",
    "script": "page/page.js"
  }
}
```

- `id`: lowercase letters, digits and dashes. It names the plugin's folders and
  must never change.
- `main` (optional): runs in the app's main process, with full Node and
  Electron access.
- `page` (optional): a tab in the popup. `html` is a fragment, placed inside
  the tab's `<section>`. `css` and `script` are loaded after it, so the script
  can use the elements right away (no `DOMContentLoaded`). `icon` is an SVG,
  shown in the tab's text colour. Without one, the tab gets a puzzle piece.
  The page can use the popup's colour variables (`--ink`, `--muted`, `--card`,
  `--line`, `--acc`, `--green`) to follow the dark/light theme.
- `page.popout` (optional): `true`, or `{ "width": 760, "height": 860 }` for
  the window's first size. Adds an *Open in its own window* button to the top
  right of the page, which opens it in a separate window: the same page without
  the logo and tabs. The window remembers its size and position, stays on top
  when the main window does, and closes with the app.
- The page runs inside the popup, so the popup's scripts are there to use:
  `browser`/`ext` (storage, `runtime.sendMessage` to the background),
  `fetchPage`, `fetchText`, `queryItemCatalog`, `Aqcloset`, `FarmEntry` and the
  rest of `popup/popup.html`. The extension's page scripts are in the app too,
  at `/content/...` and `/shared/...`, for a page to load (the Item Lists plugin
  loads the item lists from there). Load each file only once: loading a script
  the popup already has would declare its names twice.
- npm dependencies go in the plugin's own `package.json`.

`main` exports `activate(api)`, called when Lodestar starts, and optionally
`deactivate()`, called when it quits:

```js
exports.activate = (api) => {
  api.log('started');                                      // console, prefixed with the plugin id
  api.page.handle('status', () => ({ ok: true }));         // answers the page's invoke()
  api.page.send('step', { role: 'LOO', action: 'Taunt' }); // to the page's on()
};
exports.deactivate = () => { /* stop timers, close windows */ };
```

| `api.` | What it is |
| --- | --- |
| `id`, `version`, `dir` | The plugin's id, version and folder (for files next to `main.js`). |
| `appVersion`, `apiVersion` | Lodestar's version, and the plugin api's version (1). |
| `electron` | The `electron` module (`BrowserWindow`, `screen`, `ipcMain`, …). |
| `storage` | The app's shared storage (`storage.local.get/set`, `storage.onChanged`): the farm list, inventory and settings, under the keys in `shared/constants.js`. |
| `settings` | `get(key, fallback)`, `set(key, value)`, `all()`: the plugin's own settings, kept in `plugin-data/<id>/settings.json`. |
| `dataDir` | `plugin-data/<id>/`, for any other files the plugin keeps. |
| `page.handle(channel, fn)` | Answers `lodestarPlugins.invoke(id, channel, data)` from the page. `fn(data)` may return a value or a promise. |
| `page.send(channel, data)` | Sends to `lodestarPlugins.on(id, channel, fn)` in the page. |
| `openUrl(url)` | Opens a link in the default browser. |
| `onQuit(fn)` | Runs `fn` when Lodestar quits. |
| `log(...)` | `console.log` with the plugin's name in front. |

In the page, `window.lodestarPlugins` has `invoke(id, channel, data)`, which
returns a promise of the answer, and `on(id, channel, fn)`. Name any
`ipcMain` channels a plugin adds itself `<id>:...`, so plugins can't clash.

### Trying a plugin while developing

`npm start` also loads every plugin in `desktop/plugins/` (marked "from
desktop/plugins" in Settings). A plugin with npm dependencies needs them
installed first, with native ones built for Electron rather than Node:

```sh
npm run plugins:dev   # npm install + rebuild for Electron, in each plugin folder
npm start
```

Run `plugins:dev` again after changing a plugin's dependencies. Changes to its
files show after restarting the app.

To run the base app with no plugins at all (neither installed ones nor those in
`desktop/plugins/`), use `npm run start:no-plugins`.

### Building plugin zips

```sh
npm run plugin:build                         # every plugin in desktop/plugins
npm run plugin:build -- ultra-assistant      # one plugin
npm run plugin:build -- ultra-assistant --arch x64   # for Intel Macs, from an Apple silicon Mac
```

The zips go to `desktop/dist-plugins/`. Dependencies are installed and native
modules rebuilt for this app's Electron version, from `desktop/node_modules`
(run `npm install` in `desktop/` first). The build steps also need the usual
native build tools: Xcode Command Line Tools on a Mac, Visual Studio Build
Tools on Windows.

- **Plain JavaScript plugins** give one zip, `<id>-<version>.zip`, for every
  platform.
- **Plugins with native code** only run where they were built, so the zip is
  `<id>-<version>-<platform>-<arch>.zip`. `plugin.json` gets a `build` entry
  saying so, which the app checks when installing. The *Desktop app* workflow
  builds every plugin on the Mac (Apple silicon and Intel), Windows and Linux
  machines and attaches the zips to the release.

Native modules are tied to Electron's major version. When `electron` in
`package.json` moves to a new major version, rebuild and re-release the plugins
with native code. Their old zips are refused by the new app, with that reason.

## Developing

Needs Node 18 or newer.

```sh
cd desktop
npm install
npm start
```

`npm start` copies the extension files and opens the app. After changing a
file, quit the app and run `npm start` again. Changes in `renderer/` or the
popup also show with *View → Reload*, but only after the copy step has run. For
the popup's DevTools, use *View → Toggle Developer Tools*.

## Building the installers

**On GitHub (recommended):** push a tag starting with `desktop-v`:

```sh
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

The *Desktop app* workflow (`.github/workflows/desktop.yml`) builds on GitHub's
Mac, Windows and Linux machines and attaches the installers to a release for that tag.
It takes about 10 minutes. To try a build without making a release, run the
workflow from the *Actions* tab; the files appear under the run's *Artifacts*.

**On your own computer:** `npm run dist:mac` on a Mac, `npm run dist:win` on
Windows, `npm run dist:linux` on Linux. The files go to `desktop/dist/`.

| File | For |
| --- | --- |
| `AQW-Lodestar-<version>-mac-universal.dmg` | Mac (Apple Silicon and Intel), drag to Applications |
| `AQW-Lodestar-<version>-mac-universal.zip` | The same app, zipped |
| `AQW-Lodestar-<version>-setup-x64.exe` | Windows installer (most PCs) |
| `AQW-Lodestar-<version>-setup-arm64.exe` | Windows installer for ARM PCs |
| `AQW-Lodestar-<version>-portable.exe` | Windows, runs without installing |
| `aqw-lodestar_<version>_<arch>.deb` | Ubuntu, Debian, Mint: `sudo apt install ./aqw-lodestar_*.deb` |
| `AQW-Lodestar-<version>-x86_64.AppImage` | Any other Linux: `chmod +x`, then open it |

Raise `"version"` in `desktop/package.json` for each release. The app's version
is separate from the extension's.

### Unsigned apps

The builds aren't signed with a paid certificate (an Apple Developer account
costs $99 a year; Windows code signing certificates cost a similar amount
yearly). The apps work, but the first launch asks for confirmation:

- **Mac:** right-click the app → *Open* → *Open*. On macOS 15 and newer, open it
  once, then go to *System Settings → Privacy & Security* and choose *Open Anyway*.
- **Windows:** SmartScreen says "Windows protected your PC": choose *More info* →
  *Run anyway*.
- **Linux:** no prompt. The AppImage needs `libfuse2` (`sudo apt install libfuse2t64`
  on Ubuntu 24.04, `libfuse2` on older versions). If it closes straight away on
  Ubuntu 24.04 or newer, start it with `--no-sandbox` or use the `.deb`, which
  sets up Electron's sandbox properly.

To sign later, add the certificates as repository secrets and pass them to the
build step: `CSC_LINK` / `CSC_KEY_PASSWORD` (plus `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarizing on the Mac).
Remove `CSC_IDENTITY_AUTO_DISCOVERY: false` from the workflow when you do.

### App icon and install screens

- `build/icon.png` (1024×1024): the app icon, a vector redraw of the Lodestar
  compass on a parchment tile. electron-builder makes the Mac, Windows and
  Linux icons from it.
- `build/background.png` (660×400) and `build/background@2x.png` (1320×800,
  for Retina screens): the window you see when opening the `.dmg`. The app icon
  sits at (180, 205) and the Applications folder at (480, 205), set under
  `"dmg"` in `package.json`. If you change the picture, keep those spots clear
  (or move them), and save both sizes.
- `build/installerSidebar.bmp` (164×314) and `build/installerHeader.bmp`
  (150×57): the Windows installer's side panel (welcome and finish pages) and
  the banner at the top of its other pages. They must stay 24-bit BMPs at
  exactly these sizes. The welcome page text is in `build/installer.nsh`.
- Linux has no installer window: the `.deb` installs through the terminal or
  the Software app, and the AppImage just runs. Both show the app icon and the
  description from `package.json`.

## Stay on top: the details

- On the Mac the pinned window also follows you into other Spaces and over
  full-screen apps (a full-screen browser or the AQW launcher).
- On Windows it stays above normal and borderless windowed apps. Games running
  in *exclusive* fullscreen draw over everything, so play in windowed or
  borderless mode to see Lodestar on top.
- On Linux the app runs through X11 (XWayland on Wayland desktops such as GNOME
  and KDE Plasma), because Wayland doesn't let apps keep their own window on top.
  If the window manager has its own "always on top" option, that works too.
