// AQCloset API helpers. Relies on a global fetchText(url) -> Promise<string|null>
// (shared/messaging.js in pages, background.js in the service worker).

const Aqcloset = (() => {
  const API_BASE = 'https://aqcloset.com/api';
  const DEFAULT_OUTFIT = { g: 'F', hair: 'Alina hair|hair/F/Alina3.swf' };

  async function fetchJson(url) {
    const text = await fetchText(url);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Best search hit for a name: an exact name match, else the first result.
   * With { exact: true }, only an exact (any case) name match, else null.
   */
  async function searchItem(name, { exact = false } = {}) {
    if (!name) return null;
    const data = await fetchJson(`${API_BASE}/items/search?q=${encodeURIComponent(name)}&limit=20`);
    const results = data && data.results;
    if (!results || !results.length) return null;
    const lower = name.toLowerCase();
    const match = results.find((item) => item.name === name) || results.find((item) => String(item.name).toLowerCase() === lower);
    return match || (exact ? null : results[0]);
  }

  /** Icon type used by the popup: the weapon type for weapons, otherwise the slot. */
  function itemType(item) {
    const raw = item.slot === 'weapon' ? item.wType || item.wtype : item.slot;
    return raw ? String(raw).toLowerCase() : null;
  }

  /**
   * Thumbnail URLs for an item (female variant only for armors).
   * For display the URLs aren't checked: an <img> that fails just removes itself,
   * which saves downloading every image twice. Pass { verify: true } where the
   * URLs are stored for later (the farm list) to only keep ones that exist.
   * Pass { exact: true } to only accept an item with exactly this name.
   * @returns {Promise<{images: string[], type: string|null}>}
   */
  async function findItemPreview(name, { verify = false, exact = false } = {}) {
    const item = await searchItem(name, { exact });
    if (!item || !item.id || !item.file || !item.slot) return { images: [], type: null };

    const base =
      `${API_BASE}/items/thumb/${item.id}.png` +
      `?file=${encodeURIComponent(item.file)}&slot=${encodeURIComponent(item.slot)}`;
    const candidates = [`${base}&gender=M`];
    if (item.slot === 'armor') candidates.push(`${base}&gender=F`);

    if (!verify) return { images: candidates, type: itemType(item) };
    const found = await Promise.all(candidates.map((url) => fetchText(url)));
    return { images: candidates.filter((_, i) => found[i]), type: itemType(item) };
  }

  /** "#FFCC99" or "ffcc99" > "FFCC99"; null for anything that isn't a 6-digit hex color. */
  function fromHexColor(value) {
    const hex = String(value || '').trim().replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null;
  }

  /**
   * Wardrobe link wearing the character's current outfit (items, hair and
   * colors from AQCloset's /api/character), optionally plus one item.
   * The response looks like:
   *   { ok, outfit: { gender, items: { armor: { name, file, slot }, ... },
   *                   colors: { hair: '#FFCC99', skin, eye, base, trim, accessory },
   *                   hair: { name, file } } }
   */
  async function buildWardrobeUrl(username, extraItem) {
    const params = new URLSearchParams(DEFAULT_OUTFIT);
    const setItem = (item) => {
      if (item && item.slot && item.file) params.set(item.slot, `${item.name}|${item.file}`);
    };

    if (username) {
      const character = await fetchJson(`${API_BASE}/character?name=${encodeURIComponent(username)}`);
      const outfit = character && character.outfit;
      if (outfit) {
        if (outfit.gender) params.set('g', outfit.gender);
        if (outfit.hair && hasFile(outfit.hair.file)) params.set('hair', `${outfit.hair.name || ''}|${outfit.hair.file}`);
        Object.values(outfit.items || {}).forEach(setItem);
        // Same parameters as the FlashVars colors: c_hair, c_skin, c_eye, c_base, c_trim, c_accessory.
        for (const [part, value] of Object.entries(outfit.colors || {})) {
          const hex = fromHexColor(value);
          if (hex) params.set(`c_${part}`, hex);
        }
      }
    }
    setItem(extraItem);

    return `https://aqcloset.com/wardrobe?${params}`;
  }

  /**
   * "&strGender=F&strHelmName=Skull Hood&..." -> { strGender: 'F', ... }.
   * Not URL-decoded on purpose: the values are plain text, and item names can
   * contain "+" (e.g. "Coolest Invisible Ninja +5").
   */
  function parseFlashVars(text) {
    const vars = {};
    for (const pair of String(text || '').split('&')) {
      const eq = pair.indexOf('=');
      if (eq > 0) vars[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return vars;
  }

  // [wardrobe slot, FlashVars name key, FlashVars file key, cosmetic key part].
  // The armor's file is under strClassFile; cosmetic ("Cust") items are what the
  // character actually shows, so they win over the equipped item.
  const FLASHVAR_SLOTS = [
    ['armor', 'strArmorName', 'strClassFile', 'Armor'],
    ['helm', 'strHelmName', 'strHelmFile', 'Helm'],
    ['cape', 'strCapeName', 'strCapeFile', 'Cape'],
    ['weapon', 'strWeaponName', 'strWeaponFile', 'Weapon'],
    ['pet', 'strPetName', 'strPetFile', 'Pet'],
    ['misc', 'strMiscName', 'strMiscFile', 'Misc'],
  ];

  // [wardrobe parameter, FlashVars key]. FlashVars colors are decimal numbers
  // (intColorHair=16764057); the wardrobe wants 6-digit hex (c_hair=FFCC99).
  const FLASHVAR_COLORS = [
    ['c_hair', 'intColorHair'],
    ['c_skin', 'intColorSkin'],
    ['c_eye', 'intColorEye'],
    ['c_trim', 'intColorTrim'],
    ['c_accessory', 'intColorAccessory'],
    ['c_base', 'intColorBase'],
  ];

  const hasFile = (file) => !!file && file.toLowerCase() !== 'none';

  /** "16764057" > "FFCC99"; null for anything that isn't a 24-bit color number. */
  function toHexColor(value) {
    if (value == null || !/^\d+$/.test(String(value).trim())) return null;
    const number = Number(value);
    return number <= 0xffffff ? number.toString(16).toUpperCase().padStart(6, '0') : null;
  }

  /** The AQCloset wardrobe link for the outfit in a character page's FlashVars. */
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

  return { searchItem, findItemPreview, buildWardrobeUrl, parseFlashVars, wardrobeUrlFromFlashVars };
})();
