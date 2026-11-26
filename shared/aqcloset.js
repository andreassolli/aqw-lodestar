// AQCloset API helpers. Needs a global fetchText (messaging.js or background.js).

const Aqcloset = (() => {
  const API_BASE = 'https://aqcloset.com/api';
  const DEFAULT_OUTFIT = { g: 'F', hair: 'Alina hair|hair/F/Alina3.swf' };
  // AQCloset reads the character live from the game (up to 30s). Chrome stops a
  // service worker whose fetch takes over 30s, so give up before that.
  const CHARACTER_TIMEOUT_MS = 25000;

  async function fetchJson(url, timeoutMs) {
    const text = await fetchText(url, timeoutMs);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // Kept for as long as the page is open so hovering the same name twice, or
  // starting the search early, only costs one request.
  const searches = new Map();

  function searchResults(name) {
    const key = name.toLowerCase();
    if (!searches.has(key)) {
      // Quoted, so words like "or" and a leading "-" are part of the name, not the
      // search syntax. A name with its own quotes can't be quoted, so it goes as it is.
      const query = name.includes('"') ? name : `"${name}"`;
      const pending = fetchJson(`${API_BASE}/items/search?q=${encodeURIComponent(query)}&limit=20`);
      pending.then((data) => {
        if (!data) searches.delete(key);
      });
      searches.set(key, pending.then((data) => (data && data.results) || []));
    }
    return searches.get(key);
  }

  // Starts the search without waiting for it.
  function preload(name) {
    if (name) searchResults(getBaseName(name) || name);
  }

  // An armor and its helm can share a name, so slot (armor, helm, cape...) picks
  // between them. A same-named item in another slot doesn't count.
  // Items with the same art come as one result, the other names are in its variants.
  function exactMatches(results, name, slot) {
    const lower = name.toLowerCase();
    const named = (item, test) => test(String(item.name)) || (item.variants || []).some((v) => test(String(v.name)));
    const same = results.filter((item) => named(item, (n) => n === name));
    const exacts = same.length ? same : results.filter((item) => named(item, (n) => n.toLowerCase() === lower));
    return slot ? exacts.filter((item) => item.slot === slot) : exacts;
  }

  // Exact name match, else the first result. With exact: true, only exact matches.
  // AQCloset has no "(AC)" or "(Merge)" in its names and finds nothing with them
  // in, so we search without them. Names that really have one, like "Shadow Orb
  // (Rare)", still come up and get matched first.
  // With unique: true, two different items with that name count as no match.
  // Ice Katana (1) and (2) are both just "Ice Katana" there and nothing says which is which.
  async function searchItem(name, { exact = false, slot = null, unique = false } = {}) {
    if (!name) return null;
    const base = getBaseName(name) || name;
    const results = await searchResults(base);
    let matches = exactMatches(results, name, slot);
    if (!matches.length) matches = exactMatches(results, base, slot);

    if (matches.length) {
      return unique && new Set(matches.map((item) => item.file)).size > 1 ? null : matches[0];
    }
    return exact ? null : results[0] || null;
  }

  function itemType(item) {
    const raw = item.slot === 'weapon' ? item.wType || item.wtype : item.slot;
    return raw ? String(raw).toLowerCase() : null;
  }

  // Thumbnail URLs for an item (female too for armors). Not checked by default,
  // a broken <img> just removes itself. Use verify: true when saving them.
  async function findItemPreview(name, { verify = false, exact = false, slot = null } = {}) {
    // A picture of the wrong item is worse than the wiki's, so don't guess here.
    const item = await searchItem(name, { exact, slot, unique: true });
    if (!item || !item.file || !item.slot) return { images: [], type: null };

    // Items newer than AQCloset's sheet have no id, "unlisted" is its word for that.
    const base =
      `${API_BASE}/items/thumb/${encodeURIComponent(item.id || 'unlisted')}.png` +
      `?file=${encodeURIComponent(item.file)}&slot=${encodeURIComponent(item.slot)}`;
    const candidates = [`${base}&gender=M`];
    if (item.slot === 'armor') candidates.push(`${base}&gender=F`);

    if (!verify) return { images: candidates, type: itemType(item) };
    const found = await Promise.all(candidates.map((url) => fetchText(url)));
    return { images: candidates.filter((_, i) => found[i]), type: itemType(item) };
  }

  function fromHexColor(value) {
    const hex = String(value || '').trim().replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null;
  }

  // Wardrobe link with the character's current outfit (from AQCloset's
  // /api/character), plus an extra item if given.
  async function buildWardrobeUrl(username, extraItem) {
    const params = new URLSearchParams(DEFAULT_OUTFIT);
    // name|file|link|weapon type, like AQCloset's own share links.
    const setItem = (item) => {
      if (!item || !item.slot || !item.file) return;
      const weaponType = item.slot === 'weapon' ? item.wtype || item.wType || '' : '';
      params.set(item.slot, [item.name, item.file, item.link || '', weaponType].join('|').replace(/\|+$/, ''));
    };

    if (username) {
      const character = await fetchJson(`${API_BASE}/character?name=${encodeURIComponent(username)}`, CHARACTER_TIMEOUT_MS);
      const outfit = character && character.outfit;
      if (outfit) {
        if (outfit.gender) params.set('g', outfit.gender);
        if (outfit.hair && hasFile(outfit.hair.file)) params.set('hair', `${outfit.hair.name || ''}|${outfit.hair.file}`);
        Object.values(outfit.items || {}).forEach(setItem);
        for (const [part, value] of Object.entries(outfit.colors || {})) {
          const hex = fromHexColor(value);
          if (hex) params.set(`c_${part}`, hex);
        }
      }
    }
    setItem(extraItem);

    return `https://aqcloset.com/wardrobe?${params}`;
  }

  // "&strGender=F&..." -> { strGender: 'F' }. Not URL decoded on purpose, names
  // can have "+" in them ("Coolest Invisible Ninja +5").
  function parseFlashVars(text) {
    const vars = {};
    for (const pair of String(text || '').split('&')) {
      const eq = pair.indexOf('=');
      if (eq > 0) vars[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return vars;
  }

  // [slot, name key, file key, cosmetic part]. Cosmetic ("Cust") items are what
  // the character actually shows, so they win. The game's Misc slot is the
  // wardrobe's ground.
  const FLASHVAR_SLOTS = [
    ['armor', 'strArmorName', 'strClassFile', 'Armor'],
    ['helm', 'strHelmName', 'strHelmFile', 'Helm'],
    ['cape', 'strCapeName', 'strCapeFile', 'Cape'],
    ['weapon', 'strWeaponName', 'strWeaponFile', 'Weapon'],
    ['pet', 'strPetName', 'strPetFile', 'Pet'],
    ['ground', 'strMiscName', 'strMiscFile', 'Misc'],
  ];

  // FlashVars colors are decimal (16764057), the wardrobe wants hex (FFCC99).
  const FLASHVAR_COLORS = [
    ['c_hair', 'intColorHair'],
    ['c_skin', 'intColorSkin'],
    ['c_eye', 'intColorEye'],
    ['c_trim', 'intColorTrim'],
    ['c_accessory', 'intColorAccessory'],
    ['c_base', 'intColorBase'],
  ];

  const hasFile = (file) => !!file && file.toLowerCase() !== 'none';

  function toHexColor(value) {
    if (value == null || !/^\d+$/.test(String(value).trim())) return null;
    const number = Number(value);
    return number <= 0xffffff ? number.toString(16).toUpperCase().padStart(6, '0') : null;
  }

  function wardrobeUrlFromFlashVars(flashVars) {
    const vars = parseFlashVars(flashVars);
    const params = new URLSearchParams(DEFAULT_OUTFIT);
    if (vars.strGender) params.set('g', vars.strGender);
    if (hasFile(vars.strHairFile)) params.set('hair', `${vars.strHairName || ''}|${vars.strHairFile}`);

    for (const [slot, nameKey, fileKey, cosmetic] of FLASHVAR_SLOTS) {
      const cosmeticFile = vars[`strCust${cosmetic}File`];
      const [name, file] = hasFile(cosmeticFile)
        ? [vars[`strCust${cosmetic}Name`], cosmeticFile]
        : [vars[nameKey], vars[fileKey]];
      if (hasFile(file)) params.set(slot, `${name || ''}|${file}`);
    }

    for (const [param, key] of FLASHVAR_COLORS) {
      const hex = toHexColor(vars[key]);
      if (hex) params.set(param, hex);
    }
    return `https://aqcloset.com/wardrobe?${params}`;
  }

  return { searchItem, preload, findItemPreview, buildWardrobeUrl, parseFlashVars, wardrobeUrlFromFlashVars };
})();
