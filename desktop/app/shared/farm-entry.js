// "Items to farm" entries: building them from a wiki page and storing them.
// Used by the right-click menu (content/farm-context.js), the add-to-farm
// buttons (content/farm-buttons.js) and the popup's "add from link".

const FarmEntry = (() => {
  // crypto.randomUUID only exists on https pages; the wiki is often opened over http.
  const newId = () =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  /**
   * The same wiki page can be reached as http/https, with different letter case
   * or a trailing slash; compare entries by their page path instead of the raw URL.
   */
  function pageKey(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      return String(url);
    }
  }

  /**
   * @param {string} url - wiki page URL
   * @param {string|null} displayName - link text if known; falls back to the page title
   */
  async function build(url, displayName) {
    const page = await WikiParser.loadItemPage(url);
    return page ? fromPage(page, url, displayName) : null;
  }

  /** An entry for the wiki page that's open in this tab, without fetching it again. */
  function buildFromCurrentPage() {
    const url = `${WIKI_ORIGIN}${location.pathname}`;
    return fromPage(WikiParser.fromDocument(document, location.href), url, null);
  }

  /** @param {{doc: Document, images: string[]}} page - from WikiParser */
  async function fromPage(page, url, displayName) {
    const { doc, images } = page;
    const content = doc.querySelector('#page-content');
    const name = displayName || WikiParser.getTitle(doc) || url;
    const preview = await Aqcloset.findItemPreview(name, { verify: true }); // saved, so only keep images that exist

    return {
      id: newId(),
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
    const key = pageKey(url);
    return (await loadAll()).some((item) => pageKey(item.url) === key);
  }

  /** @returns {Promise<{ok: boolean, items: object[]}>} ok=false when the page is already saved */
  async function add(entry) {
    const items = await loadAll();
    const key = pageKey(entry.url);
    if (items.some((item) => pageKey(item.url) === key)) return { ok: false, items };
    const next = [...items, entry];
    await saveAll(next);
    return { ok: true, items: next };
  }

  return { build, buildFromCurrentPage, pageKey, loadAll, saveAll, contains, add };
})();
