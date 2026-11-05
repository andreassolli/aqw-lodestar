// Builds the Chrome and Firefox versions for the stores.
//
//   node scripts/build.mjs
//
// Output goes to dist/ (unpacked folders + zips). manifest.json is the Chrome one,
// so the project folder also loads unpacked while developing. The Firefox
// manifest is generated from it. No npm install needed.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// What goes into the extension. Everything else stays out.
const INCLUDE = ['manifest.json', 'background.js', 'content', 'shared', 'components', 'popup', 'options', 'render', 'icons', 'fonts'];
// The last three are old render tests, account-page.js only uses TestRender1.swf.
const SKIP_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', 'CharacterRender.swf', 'TestRender2.swf', 'TestRenderer.swf']);

// Never change the add-on id once it's on AMO, that's how Firefox matches updates.
const GECKO = {
  id: 'aqw-lodestar@lodestar.addon',
  // 140 is the first Firefox that knows data_collection_permissions.
  strict_min_version: '140.0',
  // we don't collect anything
  data_collection_permissions: { required: ['none'] },
};

const chromeManifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

function backgroundImports() {
  const source = readFileSync(join(ROOT, 'background.js'), 'utf8');
  const call = source.match(/importScripts\(\s*(['"][^)]*)\)/);
  if (!call) throw new Error('background.js has no importScripts(...) call');
  return [...call[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

// Firefox uses an event page, not a service worker, so it gets background.scripts
// with the same files. Chrome-only keys are removed.
function firefoxManifest(chrome) {
  const { minimum_chrome_version, background, ...rest } = chrome;
  return {
    ...rest,
    background: { scripts: [...backgroundImports(), background.service_worker] },
    browser_specific_settings: { gecko: GECKO },
  };
}

// So a typo fails the build instead of the browser.
function manifestFiles(manifest) {
  const files = new Set();
  const add = (file) => file && files.add(file);
  Object.values(manifest.icons || {}).forEach(add);
  Object.values(manifest.action?.default_icon || {}).forEach(add);
  add(manifest.action?.default_popup);
  add(manifest.options_ui?.page);
  add(manifest.background?.service_worker);
  (manifest.background?.scripts || []).forEach(add);
  for (const script of manifest.content_scripts || []) {
    (script.js || []).forEach(add);
    (script.css || []).forEach(add);
  }
  return [...files];
}

function check(manifest, label) {
  const missing = manifestFiles(manifest).filter((file) => !existsSync(join(ROOT, file)));
  if (missing.length) throw new Error(`${label} manifest points at missing files:\n  ${missing.join('\n  ')}`);
}

function listFiles(path) {
  const full = join(ROOT, path);
  if (!existsSync(full)) throw new Error(`Missing ${path}`);
  if (statSync(full).isFile()) return [path];
  return readdirSync(full)
    .filter((name) => !SKIP_NAMES.has(name) && !name.startsWith('.'))
    .flatMap((name) => listFiles(join(path, name)));
}

function build(name, manifest) {
  const out = join(DIST, name);
  rmSync(out, { recursive: true, force: true });

  const files = INCLUDE.flatMap(listFiles).filter((file) => file !== 'manifest.json');
  for (const file of files) {
    mkdirSync(dirname(join(out, file)), { recursive: true });
    copyFileSync(join(ROOT, file), join(out, file));
  }
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  writeFileSync(join(out, 'manifest.json'), manifestText);

  const zipPath = join(DIST, `aqw-lodestar-${name}-${manifest.version}.zip`);
  writeZip(zipPath, [
    ['manifest.json', Buffer.from(manifestText)],
    ...files.map((file) => [file.split(sep).join('/'), readFileSync(join(ROOT, file))]),
  ]);
  const size = (statSync(zipPath).size / 1024).toFixed(0);
  console.log(`${name.padEnd(8)} ${relative(ROOT, out)}/  ·  ${relative(ROOT, zipPath)} (${size} KB, ${files.length + 1} files)`);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZip(path, entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  // Fixed date so the same files give the same zip.
  const dosTime = 0;
  const dosDate = ((2024 - 1980) << 9) | (1 << 5) | 1;

  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const useDeflate = compressed.length < data.length;
    const body = useDeflate ? compressed : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(path, Buffer.concat([...locals, ...centrals, end]));
}

const firefox = firefoxManifest(chromeManifest);
check(chromeManifest, 'Chrome');
check(firefox, 'Firefox');
mkdirSync(DIST, { recursive: true });
build('chrome', chromeManifest);
build('firefox', firefox);
