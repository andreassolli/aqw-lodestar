// Copies the extension popup into desktop/app/ so the app runs the same code.
// desktop/app/ is generated, edit the extension folders or desktop/renderer/.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION = join(DESKTOP, '..');
const APP = join(DESKTOP, 'app');

// background.js runs in the app's main process, options/ is the backup page,
// content/ is there so plugin pages can use the item lists.
const FROM_EXTENSION = ['popup', 'shared', 'components', 'options', 'content', 'icons', 'fonts', 'background.js', 'LICENSE'];
const SKIP = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

// Retries because Finder can drop a .DS_Store in while it's deleting.
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

cpSync(join(DESKTOP, 'renderer'), join(APP, 'desktop'), { recursive: true });
// The icon for the Dock in dev and the window icon on Windows/Linux.
cpSync(join(DESKTOP, 'build', 'icon.png'), join(APP, 'desktop', 'icon.png'));

// Inserts after (or before) the anchor. Throws if the anchor isn't there anymore.
function patch(file, anchor, insert, { before = false } = {}) {
  const path = join(APP, file);
  const html = readFileSync(path, 'utf8');
  if (!html.includes(anchor)) throw new Error(`${file} no longer contains ${anchor}; update scripts/copy-extension.mjs`);
  writeFileSync(path, html.replace(anchor, before ? `${insert}\n  ${anchor}` : `${anchor}\n  ${insert}`));
}

patch('popup/popup.html', '<link rel="stylesheet" href="search-bar.css" />', '<link rel="stylesheet" href="../desktop/desktop.css" />');
patch('popup/popup.html', '<script src="popup.js"></script>', '<script src="../desktop/desktop.js"></script>\n  <script src="../desktop/sync.js"></script>\n  <script src="../desktop/updates.js"></script>\n  <script src="../desktop/plugins.js"></script>');
patch('options/options.html', '<script src="backup.js"></script>', '<script src="../desktop/options.js"></script>');

console.log('Copied the extension popup into desktop/app/');
