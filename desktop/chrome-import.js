// Finds the Lodestar extension's saved data in Chrome (and other Chromium
// browsers) on this computer and reads it, so the app can import it in one
// click without any change to the extension.
//
// Chrome keeps each extension's storage.local in its profile folder, under
// "Local Extension Settings/<extension id>/", as a LevelDB database: one entry
// per storage key, the value saved as JSON text. This file reads those files
// directly (read-only, so it's safe while Chrome is running). Lodestar's folder
// is recognised by its storage keys, so it works whatever the extension's id is
// (store install or "Load unpacked").

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** [browser name, folder holding "Local State" and the profiles] for this OS. */
function browserRoots() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    const base = path.join(home, 'Library', 'Application Support');
    return [
      ['Chrome', path.join(base, 'Google', 'Chrome')],
      ['Chrome Beta', path.join(base, 'Google', 'Chrome Beta')],
      ['Chrome Canary', path.join(base, 'Google', 'Chrome Canary')],
      ['Chromium', path.join(base, 'Chromium')],
      ['Edge', path.join(base, 'Microsoft Edge')],
      ['Brave', path.join(base, 'BraveSoftware', 'Brave-Browser')],
      ['Vivaldi', path.join(base, 'Vivaldi')],
      ['Arc', path.join(base, 'Arc', 'User Data')],
      ['Opera', path.join(base, 'com.operasoftware.Opera')],
      ['Opera GX', path.join(base, 'com.operasoftware.OperaGX')],
    ];
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [
      ['Chrome', path.join(local, 'Google', 'Chrome', 'User Data')],
      ['Chrome Beta', path.join(local, 'Google', 'Chrome Beta', 'User Data')],
      ['Chrome Canary', path.join(local, 'Google', 'Chrome SxS', 'User Data')],
      ['Chromium', path.join(local, 'Chromium', 'User Data')],
      ['Edge', path.join(local, 'Microsoft', 'Edge', 'User Data')],
      ['Brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
      ['Vivaldi', path.join(local, 'Vivaldi', 'User Data')],
      ['Opera', path.join(roaming, 'Opera Software', 'Opera Stable')],
      ['Opera GX', path.join(roaming, 'Opera Software', 'Opera GX Stable')],
    ];
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return [
    ['Chrome', path.join(config, 'google-chrome')],
    ['Chrome Beta', path.join(config, 'google-chrome-beta')],
    ['Chromium', path.join(config, 'chromium')],
    ['Chromium (Snap)', path.join(home, 'snap', 'chromium', 'common', 'chromium')],
    ['Chromium (Flatpak)', path.join(home, '.var', 'app', 'org.chromium.Chromium', 'config', 'chromium')],
    ['Chrome (Flatpak)', path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome')],
    ['Edge', path.join(config, 'microsoft-edge')],
    ['Brave', path.join(config, 'BraveSoftware', 'Brave-Browser')],
    ['Vivaldi', path.join(config, 'vivaldi')],
    ['Opera', path.join(config, 'opera')],
  ];
}

/** Profile folders in a browser root ("Default", "Profile 1", ... or the root itself for Opera), with display names. */
function profilesIn(root) {
  let names = {};
  try {
    const state = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8'));
    for (const [dir, info] of Object.entries(state?.profile?.info_cache || {})) names[dir] = info?.name;
  } catch {
    names = {};
  }
  let dirs = [];
  try {
    dirs = fs.readdirSync(root).filter((name) => name === 'Default' || /^Profile \d+$/.test(name) || name in names);
  } catch {
    return [];
  }
  const profiles = dirs.map((dir) => ({ dir: path.join(root, dir), name: names[dir] || dir, folder: dir }));
  // Opera keeps its single profile directly in the root.
  if (!profiles.length && fs.existsSync(path.join(root, 'Local Extension Settings'))) {
    profiles.push({ dir: root, name: '', folder: '' });
  }
  return profiles;
}

// Storage keys only Lodestar writes; a folder with any of them is Lodestar's.
const LODESTAR_KEYS = ['lip_saved_items', 'savedInventory', 'saved_theme', 'saved_username', 'inventorySyncedAt', 'tooltipPlacement'];

/**
 * Whether a storage folder is Lodestar's. Besides the keys above, an install
 * that hasn't saved anything yet still has its caches: the item catalog with the
 * boost schedule or Imgur check (1.1), or the boost cache with the 1.0 theme key.
 */
function isLodestar(entries) {
  if (LODESTAR_KEYS.some((key) => entries.has(key))) return true;
  if (entries.has('itemCatalog') && (entries.has('boostSchedule') || entries.has('imgurCheck'))) return true;
  return entries.has('boostCache') && entries.has('savedTheme');
}

// Downloaded again by the app itself; left out (the same list as shared/backup.js).
const SKIPPED_KEYS = ['itemCatalog', 'boostSchedule', 'boostCache', 'resourceCache', 'imgurCheck'];

/**
 * Every copy of Lodestar's data in Chromium browsers on this computer, most
 * recently changed first.
 * @returns {{ id: string, label: string, browser: string, profile: string, modified: number, data: object }[]}
 */
function findLodestarData() {
  const found = [];
  for (const [browser, root] of browserRoots()) {
    if (!fs.existsSync(root)) continue;
    for (const profile of profilesIn(root)) {
      const settings = path.join(profile.dir, 'Local Extension Settings');
      let extensions = [];
      try {
        extensions = fs.readdirSync(settings);
      } catch {
        continue;
      }
      for (const id of extensions) {
        const dbDir = path.join(settings, id);
        let entries;
        try {
          entries = readLevelDb(dbDir);
        } catch {
          continue; // not readable right now; skip it
        }
        if (!isLodestar(entries)) continue;

        const data = {};
        for (const [key, raw] of entries) {
          if (SKIPPED_KEYS.includes(key)) continue;
          try {
            data[key] = JSON.parse(raw.toString('utf8'));
          } catch {
            // not JSON: not something the extension wrote
          }
        }
        // Version 1.0 saved the theme as "savedTheme".
        if (data.savedTheme && !data.saved_theme) data.saved_theme = data.savedTheme;
        delete data.savedTheme;

        const profileLabel = profile.name && profile.name !== profile.folder ? `${profile.name}` : profile.folder;
        found.push({
          id: dbDir,
          browser,
          profile: profileLabel,
          label: profileLabel ? `${browser} (${profileLabel})` : browser,
          modified: lastModified(dbDir),
          data,
        });
      }
    }
  }
  return found.sort((a, b) => b.modified - a.modified);
}

function lastModified(dir) {
  let latest = 0;
  for (const name of fs.readdirSync(dir)) {
    try {
      latest = Math.max(latest, fs.statSync(path.join(dir, name)).mtimeMs);
    } catch {
      // deleted while we looked
    }
  }
  return latest;
}

//
// LevelDB keeps recent writes in *.log files and older ones in sorted tables
// (*.ldb, or *.sst in old versions). Every write has a sequence number, so the
// newest version of each key wins, and a deletion hides older values. Only
// what Chrome's extension storage needs is handled: no MANIFEST (leftover old
// files only hold lower sequence numbers), no comparators other than bytewise.

const TYPE_DELETION = 0;
const TYPE_VALUE = 1;

/** @returns {Map<string, Buffer>} the current value of every key */
function readLevelDb(dir) {
  const newest = new Map(); // key -> { seq, type, value }
  const keep = (key, seq, type, value) => {
    const current = newest.get(key);
    if (!current || seq > current.seq) newest.set(key, { seq, type, value });
  };

  const files = fs.readdirSync(dir);
  if (!files.includes('CURRENT')) throw new Error('not a LevelDB folder');
  for (const name of files) {
    let buffer;
    try {
      if (!/\.(ldb|sst|log)$/.test(name)) continue;
      buffer = fs.readFileSync(path.join(dir, name));
    } catch {
      continue; // compacted away while reading
    }
    try {
      if (name.endsWith('.log')) readLogFile(buffer, keep);
      else readTableFile(buffer, keep);
    } catch {
      // a damaged or half-written file: use what the other files have
    }
  }

  const result = new Map();
  for (const [key, entry] of newest) if (entry.type === TYPE_VALUE) result.set(key, entry.value);
  return result;
}

function readVarint(buffer, offset) {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (offset >= buffer.length) throw new Error('varint past end');
    const byte = buffer[offset++];
    result += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return [result, offset];
    shift += 7;
    if (shift > 63) throw new Error('bad varint');
  }
}

const readUint64 = (buffer, offset) => buffer.readUInt32LE(offset) + buffer.readUInt32LE(offset + 4) * 2 ** 32;

// Write-ahead log: 32 KiB blocks of records (checksum 4, length 2, type 1, data).
// A write batch can be split over several records (first / middle / last).
function readLogFile(buffer, keep) {
  const BLOCK = 32768;
  let offset = 0;
  let pending = [];
  while (offset + 7 <= buffer.length) {
    const left = BLOCK - (offset % BLOCK);
    if (left < 7) {
      offset += left; // block trailer padding
      continue;
    }
    const length = buffer.readUInt16LE(offset + 4);
    const type = buffer[offset + 6];
    const start = offset + 7;
    if (type === 0 && length === 0) {
      offset += left; // preallocated, unused space
      continue;
    }
    if (start + length > buffer.length) break; // being written right now
    const data = buffer.subarray(start, start + length);
    offset = start + length;

    if (type === 1) readWriteBatch(data, keep);
    else if (type === 2) pending = [data];
    else if (type === 3) pending.push(data);
    else if (type === 4) {
      pending.push(data);
      readWriteBatch(Buffer.concat(pending), keep);
      pending = [];
    } else break;
  }
}

// A batch: sequence number (8), count (4), then per entry a tag and the key (and value).
function readWriteBatch(batch, keep) {
  let seq = readUint64(batch, 0);
  const count = batch.readUInt32LE(8);
  let offset = 12;
  for (let i = 0; i < count && offset < batch.length; i++, seq++) {
    const tag = batch[offset++];
    let keyLength;
    [keyLength, offset] = readVarint(batch, offset);
    const key = batch.subarray(offset, offset + keyLength).toString('utf8');
    offset += keyLength;
    if (tag === TYPE_VALUE) {
      let valueLength;
      [valueLength, offset] = readVarint(batch, offset);
      keep(key, seq, TYPE_VALUE, Buffer.from(batch.subarray(offset, offset + valueLength)));
      offset += valueLength;
    } else {
      keep(key, seq, TYPE_DELETION, null);
    }
  }
}

// Sorted table: a 48-byte footer points to the index block, whose entries point
// to the data blocks. Each block may be Snappy-compressed.
function readTableFile(buffer, keep) {
  const footer = buffer.subarray(buffer.length - 48);
  let offset = 0;
  [, offset] = readVarint(footer, offset); // metaindex offset
  [, offset] = readVarint(footer, offset); // metaindex size
  let indexOffset;
  let indexSize;
  [indexOffset, offset] = readVarint(footer, offset);
  [indexSize, offset] = readVarint(footer, offset);

  for (const [, handle] of blockEntries(readBlock(buffer, indexOffset, indexSize))) {
    let dataOffset;
    let dataSize;
    let at = 0;
    [dataOffset, at] = readVarint(handle, at);
    [dataSize, at] = readVarint(handle, at);
    for (const [internalKey, value] of blockEntries(readBlock(buffer, dataOffset, dataSize))) {
      if (internalKey.length < 8) continue;
      const trailer = readUint64(internalKey, internalKey.length - 8);
      const type = trailer % 256;
      const seq = Math.floor(trailer / 256);
      const key = internalKey.subarray(0, internalKey.length - 8).toString('utf8');
      keep(key, seq, type, type === TYPE_VALUE ? Buffer.from(value) : null);
    }
  }
}

function readBlock(buffer, offset, size) {
  const contents = buffer.subarray(offset, offset + size);
  const compression = buffer[offset + size]; // the 5-byte trailer: type, then a checksum
  if (compression === 0) return contents;
  if (compression === 1) return snappyDecompress(contents);
  throw new Error(`unsupported block compression ${compression}`);
}

/** The [key, value] entries of a block (keys are prefix-compressed). */
function blockEntries(block) {
  const restarts = block.readUInt32LE(block.length - 4);
  const end = block.length - 4 - restarts * 4;
  const entries = [];
  let offset = 0;
  let previous = Buffer.alloc(0);
  while (offset < end) {
    let shared;
    let unshared;
    let valueLength;
    [shared, offset] = readVarint(block, offset);
    [unshared, offset] = readVarint(block, offset);
    [valueLength, offset] = readVarint(block, offset);
    const key = Buffer.concat([previous.subarray(0, shared), block.subarray(offset, offset + unshared)]);
    offset += unshared;
    entries.push([key, block.subarray(offset, offset + valueLength)]);
    offset += valueLength;
    previous = key;
  }
  return entries;
}

/** Snappy (raw format), as LevelDB uses it. */
function snappyDecompress(input) {
  let [length, offset] = readVarint(input, 0);
  const out = Buffer.alloc(length);
  let pos = 0;
  while (offset < input.length) {
    const tag = input[offset++];
    const kind = tag & 3;
    if (kind === 0) {
      let len = tag >> 2;
      if (len >= 60) {
        const bytes = len - 59;
        len = 0;
        for (let i = 0; i < bytes; i++) len += input[offset + i] * 2 ** (8 * i);
        offset += bytes;
      }
      len += 1;
      input.copy(out, pos, offset, offset + len);
      offset += len;
      pos += len;
      continue;
    }
    let len;
    let back;
    if (kind === 1) {
      len = ((tag >> 2) & 7) + 4;
      back = ((tag >> 5) << 8) | input[offset++];
    } else if (kind === 2) {
      len = (tag >> 2) + 1;
      back = input.readUInt16LE(offset);
      offset += 2;
    } else {
      len = (tag >> 2) + 1;
      back = input.readUInt32LE(offset);
      offset += 4;
    }
    if (!back || back > pos) throw new Error('bad snappy copy');
    for (let i = 0; i < len; i++, pos++) out[pos] = out[pos - back]; // may overlap, so byte by byte
  }
  if (pos !== length) throw new Error('snappy length mismatch');
  return out;
}

/**
 * Copies Lodestar's data from a browser into the app's storage, replacing what
 * the app has under the same keys (like importing a backup file). The app's
 * current data is saved first as a backup file in `backupsDir`, so nothing is
 * lost by importing over it.
 * @param {object} options
 * @param {object} options.storage     from storage.js
 * @param {string} options.backupsDir  where to keep the safety copy
 * @param {string} options.version     the app's version, for the backup file
 * @param {string} [options.id]        a source from an earlier result's `others`; the newest by default
 */
async function importFromChrome({ storage, backupsDir, version, id }) {
  const found = findLodestarData();
  if (!found.length) return { error: 'not-found' };
  // Copies with nothing saved yet (only caches) can't be imported; say where Lodestar was found, though.
  const usable = found.filter((entry) => Object.keys(entry.data).length);
  if (!usable.length) return { error: 'empty', label: found[0].label };
  const source = (id && usable.find((entry) => entry.id === id)) || usable[0];

  const current = await storage.local.get(null);
  for (const key of SKIPPED_KEYS) delete current[key];
  let backupFile = null;
  if (Object.keys(current).length) {
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString();
    backupFile = path.join(backupsDir, `before-import-${stamp.replace(/[:.]/g, '-')}.json`);
    const backup = { format: 'aqw-lodestar-backup', version: 1, extensionVersion: version, exportedAt: stamp, data: current };
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  }

  await storage.local.set(source.data);
  return {
    ok: true,
    id: source.id,
    label: source.label,
    modified: source.modified,
    data: source.data,
    backupFile,
    others: usable.filter((entry) => entry !== source).map(({ id: otherId, label, modified }) => ({ id: otherId, label, modified })),
  };
}

module.exports = { findLodestarData, importFromChrome, readLevelDb, browserRoots };
