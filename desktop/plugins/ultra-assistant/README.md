# Attack Patterns (Lodestar desktop plugin)

*Comes with the app* (a built-in plugin): turn it on or off in Settings →
Options → Features.

Its **Ultra** tab shows each ultra boss's attack pattern: the opening, then
the loop it repeats, with each attack marked (Taunt, Zone…). Pick the boss
from the dropdown. The button at the top right opens it in a window of its own.

It's plain JavaScript (a page, no `main.js`), so it runs on every platform.
(Its id is still `ultra-assistant`, from when it also watched the game's
traffic; that part was taken out and is in the git history.)

## Files

| File | What it does |
| --- | --- |
| `plugin.json` | Name, version, and the page (with `"popout"`). |
| `page/page.html` | The heading, boss dropdown and the place the pattern goes. |
| `page/page.js` | The patterns (`AttackPatterns`) and drawing the chosen one. |
| `page/page.css` | Styles, in the app's theme colours. |
| `page/icon.svg` | The tab icon. |
