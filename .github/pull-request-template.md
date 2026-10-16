## What this changes

<!-- A few sentences: what's new or fixed, and why. Link an issue with "Closes #123". -->

## Where it applies

<!-- Tick everything this touches. Shared code (shared/, content/item-list-view.js, popup/) reaches several of these at once. -->

- [ ] Extension: AQW Wiki
- [ ] Extension: account.aq.com
- [ ] Extension: AQCloset
- [ ] Toolbar popup (also in the desktop app)
- [ ] Desktop app (`desktop/`)
- [ ] Desktop plugin: <!-- item-lists / class-enhancements / ultra-assistant -->
- [ ] Build, workflow or docs only

## Screenshots

<!-- Before / after for anything visible. Dark and light theme if colours changed. -->

## Tested

<!-- Delete the lines that don't apply. -->

- [ ] `node scripts/build.mjs` runs without errors
- [ ] Chrome: loaded `dist/chrome/` and tried the change
- [ ] Firefox: loaded `dist/firefox/manifest.json` in `about:debugging` and tried the change
- [ ] Desktop: quit Lodestar (⌘Q), ran `npm start` in `desktop/` and tried the change
- [ ] Dark and light theme both look right
- [ ] Nothing new in the browser console / app DevTools console
- [ ] Older saved data still works (farm list, inventory, settings from before this change)

## Before merging

- [ ] READMEs updated if behaviour, files or settings changed (`README.md`, `desktop/README.md`, plugin READMEs)
- [ ] A new storage key is in `STORAGE_KEYS` (and in `SKIPPED_KEYS` in `shared/backup.js` if it's a cache)
- [ ] A new site or permission is added to the privacy policy and the permission notes in `README.md`
- [ ] No generated files committed (`desktop/app/`, `dist/`, `desktop/dist-plugins/`)

## Release

<!-- What needs to go out after merging. -->

- [ ] Extension: raise `"version"` in `manifest.json`, then upload to the Chrome Web Store and Firefox Add-ons
- [ ] Desktop: raise `"version"` in `desktop/package.json` and push a `desktop-v<version>` tag
- [ ] Plugin: raise `"version"` in its `plugin.json`
- [ ] Website: deploy (e.g. changes to `classes.json` on aqw.app)
- [ ] Nothing to release
