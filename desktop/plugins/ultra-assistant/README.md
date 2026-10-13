# Ultra Assistant (Lodestar desktop plugin)

Helps during ultra boss fights. It watches the game's network traffic for the
boss's lines and shows who should do what next, such as **LOO — Taunt** or
**DPS — Zone**, in a small notification at the top of the screen, above the
game. Its **Ultra** tab in Lodestar shows each boss's attack pattern, and
whether the plugin is listening to the game.

It only reads the traffic between your computer and the game's servers (TCP
ports 5588 and 5594). It sends nothing and changes nothing.

## Installing

Download the zip for your computer from the release and choose it in Lodestar
under *Settings → Plugins → Install plugin…*, then restart Lodestar:

| Zip | For |
| --- | --- |
| `ultra-assistant-<version>-darwin-arm64.zip` | Mac with Apple silicon (M1 and newer) |
| `ultra-assistant-<version>-darwin-x64.zip` | Intel Mac |
| `ultra-assistant-<version>-win32-x64.zip` | Windows |
| `ultra-assistant-<version>-linux-x64.zip` | Linux |

### Allowing it to watch network traffic

Reading network traffic needs a permission that apps don't have by default. If
the Ultra tab says *Couldn't start watching the game's traffic*, set it up once:

- **Mac:** packet capture reads `/dev/bpf*`, which only the system can read
  by default. The simplest way is to install [Wireshark](https://www.wireshark.org/download.html)
  and its *ChmodBPF* package (offered in the installer), which allows it
  permanently. For a quick test instead, run `sudo chmod o+r /dev/bpf*`
  (this is undone when the Mac restarts).
- **Windows:** install [Npcap](https://npcap.com/#download) with *Install Npcap in
  WinPcap API-compatible Mode* ticked.
- **Linux:** install libpcap (`sudo apt install libpcap0.8` on Ubuntu/Debian),
  and give Lodestar permission to capture, for example
  `sudo setcap cap_net_raw,cap_net_admin=eip /opt/AQW\ Lodestar/aqw-lodestar` for
  the `.deb` install.

Then restart Lodestar.

The plugin watches Wi-Fi (`en0`) on a Mac, as before, or otherwise the network
interface that has your computer's address. To pick another one, set `device`
in `plugin-data/ultra-assistant/settings.json` in Lodestar's data folder, for
example `{ "device": "en1" }`.

## How it works

| File | What it does |
| --- | --- |
| `plugin.json` | Name, version and what Lodestar loads (see the desktop README's *Writing a plugin*). |
| `main.js` | Runs in Lodestar's main process: the packet capture (`cap`), the fight pattern (`OPENING`, `CYCLE`, `RESET_MESSAGE`) and the notification window. |
| `notification/` | The notification window: `notification.html/.css/.js`, and `preload.js`, which passes it what to show. |
| `page/` | The Ultra tab: `page.html`, `page.css`, `page.js` (each boss's attack pattern) and `icon.svg`. |
| `package.json` | Its one dependency, `cap`, which is native code built for each platform. |

The tab and `main.js` talk through the plugin api: the tab asks for
`status` when it opens and listens for `status` and `step` messages.

**To add or change a fight pattern:** the notifications come from `OPENING`
and `CYCLE` in `main.js` (each step is the boss line that triggers it, and the
role and action to show). The chart on the Ultra tab is `patterns` in
`page/page.js`, with one `<option>` per boss in `page/page.html`.

## Developing

From `desktop/`:

```sh
npm run plugins:dev     # installs cap and builds it for Lodestar's Electron
npm start               # loads the plugin from desktop/plugins/ultra-assistant
npm run plugin:build -- ultra-assistant   # the zip for this computer, in desktop/dist-plugins/
```

`cap` needs the native build tools: Xcode Command Line Tools on a Mac
(`xcode-select --install`), Visual Studio Build Tools on Windows, and
`libpcap-dev` on Linux.
