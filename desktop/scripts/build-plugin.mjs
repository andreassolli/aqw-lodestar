// Packages a plugin from desktop/plugins/ as a zip to install in the app
// (Settings → Plugins → Install plugin…).
//
//   node scripts/build-plugin.mjs <id> [--arch x64|arm64]   (npm run plugin:build -- <id>)
//   node scripts/build-plugin.mjs --dev                    (npm run plugins:dev)
//
// A plugin with npm dependencies gets them installed, and native ones (like the
// Ultra Assistant's "cap") rebuilt for this app's Electron version. Native code
// only runs on the platform it was built on, so such a plugin is built on each
// platform (the GitHub workflow does this) and the zip's name says which one:
//   dist-plugins/<id>-<version>-<platform>-<arch>.zip
// A plugin without native code runs anywhere: dist-plugins/<id>-<version>.zip
//
// --dev installs and rebuilds the dependencies of every plugin in place, so
// `npm start` can load them straight from desktop/plugins/.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { writeZip } = require('../zip.js');

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS = join(DESKTOP, 'plugins');
const OUT = join(DESKTOP, 'dist-plugins');
const SKIP = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', 'node_modules', 'package-lock.json']);
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const archIndex = args.indexOf('--arch');
const arch = archIndex >= 0 ? args[archIndex + 1] : process.arch;
const ids = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--arch');

/** The Electron version the app runs on, from desktop/node_modules (run npm install in desktop/ first). */
function electronVersion() {
  const file = join(DESKTOP, 'node_modules', 'electron', 'package.json');
  if (!existsSync(file)) throw new Error('Electron is not installed: run npm install in desktop/ first');
  return JSON.parse(readFileSync(file, 'utf8')).version;
}

function hasDependencies(dir) {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return false;
  return Object.keys(JSON.parse(readFileSync(file, 'utf8')).dependencies || {}).length > 0;
}

/** npm install (without dev dependencies), then rebuild native modules for Electron. */
async function installDependencies(dir, version) {
  console.log(`  npm install in ${relative(DESKTOP, dir) || '.'}`);
  execFileSync(NPM, ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
  console.log(`  rebuilding native modules for Electron ${version} (${arch})`);
  const { rebuild } = await import('@electron/rebuild');
  await rebuild({ buildPath: dir, electronVersion: version, arch, force: true });
}

function listFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name) && name !== 'node_modules') return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // Inside node_modules, leave out what's only needed for building.
      if (name === 'node_modules' && dir === base) return listFiles(full, base);
      if (['test', 'tests', '.github', 'obj.target', '.deps'].includes(name) && full.includes(`${sep}node_modules${sep}`)) return [];
      return listFiles(full, base);
    }
    return [relative(base, full)];
  });
}

async function build(id) {
  const source = join(PLUGINS, id);
  const manifestFile = join(source, 'plugin.json');
  if (!existsSync(manifestFile)) throw new Error(`No plugin "${id}" (expected ${relative(DESKTOP, manifestFile)})`);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const version = electronVersion();
  console.log(`${manifest.name} ${manifest.version || ''}`);

  // Work on a copy, so desktop/plugins/<id> keeps whatever node_modules it has for npm start.
  const work = join(OUT, '.work', id);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  cpSync(source, work, { recursive: true, filter: (path) => !SKIP.has(path.split(/[\\/]/).pop()) });

  if (hasDependencies(work)) await installDependencies(work, version);

  const files = listFiles(work);
  const native = files.some((file) => file.endsWith('.node'));
  // Native code is tied to this platform, processor and Electron version; plain JavaScript isn't.
  const builtManifest = native
    ? { ...manifest, build: { platform: process.platform, arch, electron: version, native: true } }
    : manifest;

  const entries = files
    .filter((file) => file !== 'plugin.json')
    .map((file) => [file.split(sep).join('/'), readFileSync(join(work, file)), statSync(join(work, file)).mode & 0o777]);
  entries.unshift(['plugin.json', Buffer.from(JSON.stringify(builtManifest, null, 2) + '\n'), 0o644]);

  const name = native
    ? `${id}-${manifest.version || '0.0.0'}-${process.platform}-${arch}.zip`
    : `${id}-${manifest.version || '0.0.0'}.zip`;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), writeZip(entries));
  rmSync(work, { recursive: true, force: true });
  console.log(`  → dist-plugins/${name} (${entries.length} files${native ? `, built for ${process.platform} ${arch}` : ''})`);
}

async function devInstall() {
  const version = electronVersion();
  for (const id of readdirSync(PLUGINS)) {
    const dir = join(PLUGINS, id);
    if (!existsSync(join(dir, 'plugin.json')) || !hasDependencies(dir)) continue;
    console.log(id);
    await installDependencies(dir, version);
  }
  console.log('Done. npm start loads the plugins in desktop/plugins.');
}

try {
  if (dev) await devInstall();
  else {
    const targets = ids.length ? ids : readdirSync(PLUGINS).filter((id) => existsSync(join(PLUGINS, id, 'plugin.json')));
    for (const id of targets) await build(id);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
