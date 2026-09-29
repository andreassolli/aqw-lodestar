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

  /** Best search hit for a name: an exact name match, else the first result. */
  async function searchItem(name) {
    if (!name) return null;
    const data = await fetchJson(`${API_BASE}/items/search?q=${encodeURIComponent(name)}&limit=20`);
    const results = data && data.results;
    if (!results || !results.length) return null;
    return results.find((item) => item.name === name) || results[0];
  }

  /** Icon type used by the popup: the weapon type for weapons, otherwise the slot. */
  function itemType(item) {
    const raw = item.slot === 'weapon' ? item.wType || item.wtype : item.slot;
    return raw ? String(raw).toLowerCase() : null;
  }

  /**
   * Thumbnail URLs for an item (female variant only for armors), checked to exist.
   * @returns {Promise<{images: string[], type: string|null}>}
   */
  async function findItemPreview(name) {
    const item = await searchItem(name);
    if (!item || !item.id || !item.file || !item.slot) return { images: [], type: null };

    const base =
      `${API_BASE}/items/thumb/${item.id}.png` +
      `?file=${encodeURIComponent(item.file)}&slot=${encodeURIComponent(item.slot)}`;
    const candidates = [`${base}&gender=M`];
    if (item.slot === 'armor') candidates.push(`${base}&gender=F`);

    const found = await Promise.all(candidates.map((url) => fetchText(url)));
    return { images: candidates.filter((_, i) => found[i]), type: itemType(item) };
  }

  /** Wardrobe link wearing the character's current outfit, optionally plus one item. */
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
        Object.values(outfit.items || {}).forEach(setItem);
      }
    }
    setItem(extraItem);

    return `https://aqcloset.com/wardrobe?${params}`;
  }

  return { searchItem, findItemPreview, buildWardrobeUrl };
})();
