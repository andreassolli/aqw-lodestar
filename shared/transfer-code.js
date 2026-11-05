// Transfer codes: farm list, settings and AQCloset layouts in one line
// ("LODESTAR1....") to paste on another device or the other app.
//
// The farm list is stored as just wiki paths, ticks and /join maps, and the rest
// gets rebuilt from the wiki when pasted. About 20 characters per item. No
// inventory, it would make the code huge and you can just sync it again.
//
// Not encrypted, there's nothing secret in it. It's compressed JSON in base64
// with a checksum so we can tell a cut off code from a wrong one.
const TransferCode = (() => {
  const PREFIX = 'LODESTAR';
  const VERSION = 1;
  const LAYOUT_PREFIX = 'moduleOrder:';

  // [storage key, one letter name, check]. Never reuse a letter.
  const isString = (value) => typeof value === 'string' && value.length < 200;
  const isStringList = (value) => Array.isArray(value) && value.length < 500 && value.every(isString);
  const SETTINGS = [
    [STORAGE_KEYS.theme, 't', (value) => value === 'dark' || value === 'light'],
    [STORAGE_KEYS.username, 'u', isString],
    [STORAGE_KEYS.tooltipPlacement, 'p', (value) => ['side', 'anchored', 'off'].includes(value)],
    // 'i' was the Imgur setting, don't reuse it
    [STORAGE_KEYS.disabledFeatures, 'd', isStringList],
    [STORAGE_KEYS.collapsedInventorySections, 'c', isStringList],
    [STORAGE_KEYS.itemListFilter, 'f', (value) => value !== null && typeof value === 'object' && !Array.isArray(value)],
    [STORAGE_KEYS.itemListSelection, 'l', isStringList],
  ];

  async function deflate(text) {
    const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  }

  function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function checksum(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36).padStart(6, '0').slice(-6);
  }

  function wikiPath(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === new URL(WIKI_ORIGIN).hostname ? parsed.pathname : null;
    } catch {
      return null;
    }
  }

  async function create() {
    const data = await ext.storage.local.get(null);
    // Newest first like the farm list.
    const farm = [...(data[STORAGE_KEYS.farmItems] || [])].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const payload = {
      f: farm.map((item) => [wikiPath(item.url), item.checked ? 1 : 0, item.map || 0]).filter(([path]) => path),
      s: Object.fromEntries(SETTINGS.filter(([key]) => data[key] !== undefined).map(([key, short]) => [short, data[key]])),
      l: Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith(LAYOUT_PREFIX))),
    };
    const body = toBase64Url(await deflate(JSON.stringify(payload)));
    return `${PREFIX}${VERSION}.${body}.${checksum(body)}`;
  }

  // Reads a pasted code. Whitespace from chat apps is fine.
  async function read(pasted) {
    const text = String(pasted || '').replace(/\s+/g, '');
    const match = text.match(/^LODESTAR(\d+)\.([A-Za-z0-9_-]+)\.([a-z0-9]{6})$/);
    if (!match) {
      if (!text) throw new Error('nothing was pasted');
      throw new Error(text.startsWith(PREFIX) ? 'that code is incomplete; copy it again, all of it' : "that isn't a Lodestar transfer code");
    }
    const [, version, body, sum] = match;
    if (Number(version) > VERSION) throw new Error('that code was made by a newer version of Lodestar; update first');
    if (checksum(body) !== sum) throw new Error('that code is incomplete or changed; copy it again, all of it');

    let payload;
    try {
      payload = JSON.parse(await inflate(fromBase64Url(body)));
    } catch {
      throw new Error("that code couldn't be read; copy it again, all of it");
    }

    const farm = (Array.isArray(payload.f) ? payload.f : [])
      .filter((row) => Array.isArray(row) && typeof row[0] === 'string' && row[0].startsWith('/'))
      .map(([path, checked, map]) => ({
        url: new URL(path, WIKI_ORIGIN).href,
        checked: checked === 1,
        // 0 means the map wasn't known, look it up again.
        map: isString(map) && /^[a-z0-9_-]+$/i.test(map) ? map : undefined,
      }));
    const given = payload.s && typeof payload.s === 'object' ? payload.s : {};
    const settings = Object.fromEntries(
      SETTINGS.filter(([, short, valid]) => Object.hasOwn(given, short) && valid(given[short])).map(([key, short]) => [key, given[short]])
    );
    const layouts = Object.fromEntries(
      Object.entries(payload.l && typeof payload.l === 'object' ? payload.l : {}).filter(
        ([key, value]) => key.startsWith(LAYOUT_PREFIX) && key.length < 300 && isStringList(value)
      )
    );
    return { farm, settings, layouts };
  }

  function describe({ farm, settings, layouts }) {
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const lines = [`${plural(farm.length, 'item')} on the farm list`];
    const settingCount = Object.keys(settings).length;
    if (settingCount) lines.push(`${plural(settingCount, 'setting')}${settings[STORAGE_KEYS.username] ? `, username ${settings[STORAGE_KEYS.username]}` : ''}`);
    const layoutCount = Object.keys(layouts).length;
    if (layoutCount) lines.push(plural(layoutCount, 'AQCloset layout'));
    return lines;
  }

  // Replaces the farm list (items already on it keep their details) and sets
  // the settings. New items get filled in from the wiki later.
  async function apply({ farm, settings, layouts }) {
    const current = await FarmEntry.loadAll();
    const byPage = new Map(current.map((item) => [FarmEntry.pageKey(item.url), item]));
    const now = Date.now();
    const entries = farm.map((row, i) => {
      const savedAt = now - i;
      const existing = byPage.get(FarmEntry.pageKey(row.url));
      if (existing) return { ...existing, checked: row.checked, savedAt, ...(row.map ? { map: row.map } : {}) };
      return FarmEntry.placeholder(row, savedAt);
    });
    await ext.storage.local.set({ ...settings, ...layouts, [STORAGE_KEYS.farmItems]: entries });
  }

  return { create, read, describe, apply };
})();
