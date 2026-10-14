// Copies the extension's popup (and what it needs) into desktop/app/, so the
// desktop app runs the very same popup code as the browser extension.
//
//   node scripts/copy-extension.mjs     (npm start / npm run dist run this first)
//
// desktop/app/ is generated: edit the files in the extension folders (popup/,
// shared/, ...) or in desktop/renderer/, never in desktop/app/.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION = join(DESKTOP, '..');
const APP = join(DESKTOP, 'app');

// From the extension. background.js runs in the app's main process (see
// background-host.js); options/ is the backup import page; content/ is the
// extension's page scripts, which plugin pages can load (the Item Lists plugin
// uses the event item lists from there).
const FROM_EXTENSION = ['popup', 'shared', 'options', 'content', 'icons', 'fonts', 'background.js', 'LICENSE'];
const SKIP = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

// Retries: on a Mac, Finder can drop a .DS_Store into the folder while it's being deleted.
rmSync(APP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
mkdirSync(APP, { recursive: true });

for (const entry of FROM_EXTENSION) {
  const from = join(EXTENSION, entry);
  if (!existsSync(from)) throw new Error(`Missing ${entry} in the extension folder (${from})`);
  cpSync(from, join(APP, entry), {
    recursive: true,
    filter: (path) => !SKIP.has(path.split(/[\\/]/).pop()),
  });
}

// The desktop-only additions: the stay-on-top button and a few tweaks.
cpSync(join(DESKTOP, 'renderer'), join(APP, 'desktop'), { recursive: true });
// The compass icon, for the Dock while developing and the window icon on Windows and Linux.
cpSync(join(DESKTOP, 'build', 'icon.png'), join(APP, 'desktop', 'icon.png'));

/** Adds `insert` right after `anchor` (or before it), failing loudly if the anchor moved. */
function patch(file, anchor, insert, { before = false } = {}) {
  const path = join(APP, file);
  const html = readFileSync(path, 'utf8');
  if (!html.includes(anchor)) throw new Error(`${file} no longer contains ${anchor}; update scripts/copy-extension.mjs`);
  writeFileSync(path, html.replace(anchor, before ? `${insert}\n  ${anchor}` : `${anchor}\n  ${insert}`));
}

patch('popup/popup.html', '<link rel="stylesheet" href="search-bar.css" />', '<link rel="stylesheet" href="../desktop/desktop.css" />');
patch('popup/popup.html', '<script src="popup.js"></script>', '<script src="../desktop/desktop.js"></script>\n  <script src="../desktop/plugins.js"></script>');
patch('options/options.html', '<script src="backup.js"></script>', '<script src="../desktop/options.js"></script>');

console.log('Copied the extension popup into desktop/app/');
