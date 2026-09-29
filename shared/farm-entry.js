// "Items to farm" entries: building them from a wiki link and storing them.
// Used by the right-click menu (content/farm-context.js) and the popup's "add from link".

const FarmEntry = (() => {
  /**
   * @param {string} url - wiki page URL
   * @param {string|null} displayName - link text if known; falls back to the page title
   */
  async function build(url, displayName) {
    const page = await WikiParser.loadItemPage(url);
    if (!page) return null;

    const { doc, images } = page;
    const content = doc.querySelector('#page-content');
    const name = displayName || WikiParser.getTitle(doc) || url;
    const preview = await Aqcloset.findItemPreview(name);

    return {
      id: crypto.randomUUID(),
      url,
      text: name,
      type: preview.type,
      // AQCloset thumbnails are cleaner than scraped wiki images, so prefer them.
      image: preview.images.length ? preview.images : images,
      locations: WikiParser.parseLocations(content),
      price: WikiParser.extractField(content, 'Price'),
      mergeList: WikiParser.extractMergeList(doc),
      checked: false,
      savedAt: Date.now(),
    };
  }

  async function loadAll() {
    const result = await ext.storage.local.get(STORAGE_KEYS.farmItems);
    return result[STORAGE_KEYS.farmItems] || [];
  }

  function saveAll(items) {
    return ext.storage.local.set({ [STORAGE_KEYS.farmItems]: items });
  }

  async function contains(url) {
    return (await loadAll()).some((item) => item.url === url);
  }

  /** @returns {Promise<{ok: boolean, items: object[]}>} ok=false when the URL is already saved */
  async function add(entry) {
    const items = await loadAll();
    if (items.some((item) => item.url === entry.url)) return { ok: false, items };
    const next = [...items, entry];
    await saveAll(next);
    return { ok: true, items: next };
  }

  return { build, loadAll, saveAll, contains, add };
})();
