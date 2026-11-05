# Components

Small UI pieces used in more than one place: the popup's Settings, the farm
list, and the desktop app's own Settings groups (`desktop/renderer/`). Each is
a plain script that defines one global, plus its stylesheet. `popup/popup.html`
loads them all (styles before `popup.css`, scripts after `shared/`), so the
popup and the desktop app both have them.

| Component | Files | What it is |
| --- | --- | --- |
| `StatusLine(element)` | `status-line.js`, `status-line.css` | The short line under a group's buttons. Returns `set(message, isError)`; an empty message hides it. |
| `Choice.bind(name, key, fallback)` | `choice.js`, `choice.css` | Radio buttons (`.segmented`) saved to a storage key. |
| `SwitchRow.create(feature, checked, onToggle)` | `switch-row.js`, `switch-row.css` | A name, a line about it and an on/off switch, for a `<ul class="feature-list">`. |
| `TabList.create(list, { rememberAs })` | `tab-list.js`, `tab-list.css` | Tabs that show one panel each (`data-tab-name`, `aria-controls`), with arrow keys and the last tab remembered. |
| `CopyButton.create(text, { className })` | `copy-button.js`, `copy-button.css` | A chip that copies its text when clicked ("/join manaharvest"). |
| `HelpTip.init(root)` | `help-tip.js`, `help-tip.css` | A small "?" (`<button class="help-tip" data-help="…">`) that shows a longer explanation on hover, focus or click, so the text on the page can stay short. |
| `.pill-button` | `pill-button.css` | The outlined round button used for actions. |

Each file's comment at the top shows how to use it.

## Adding one

1. Make `components/<name>.js` defining one global (`const Name = (() => { … return { create }; })();`)
   and, if it has a look of its own, `components/<name>.css`.
2. Load both in `popup/popup.html` with the others.
3. Add it to the table above.

The extension build (`scripts/build.mjs`) and the desktop app's copy step
(`desktop/scripts/copy-extension.mjs`) include this whole folder.

Content scripts on web pages (the wiki, account.aq.com, AQCloset) have their
own pieces in `content/` (the item list's search and filter, item cards), since
they're styled to fit those pages.
