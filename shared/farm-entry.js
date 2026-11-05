// Farm list entries: building them from a wiki page and saving them.

const FarmEntry = (() => {
  // crypto.randomUUID only works on https and the wiki is often http.
  const newId = () =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // The same page can be http/https, different case, trailing slash... so compare paths.
  function pageKey(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      return String(url);
    }
  }

  async function build(url, displayName) {
    const page = await WikiParser.loadItemPage(url);
    return page ? fromPage(page, url, displayName) : null;
  }

  // Entry for the page that's open, no need to fetch it again.
  function buildFromCurrentPage() {
    const url = `${WIKI_ORIGIN}${location.pathname}`;
    return fromPage(WikiParser.fromDocument(document, location.href), url, null);
  }

  async function fromPage(page, url, displayName) {
    const { doc, images } = page;
    const content = doc.querySelector('#page-content');
    const name = displayName || WikiParser.getTitle(doc) || url;
    const locations = WikiParser.parseLocations(content);
    const [preview, map] = await Promise.all([
      Aqcloset.findItemPreview(name, { verify: true }), // saved, so only keep images that exist
      WikiParser.findJoinMap(locations).catch(() => undefined),
    ]);

    return {
      id: newId(),
      url,
      text: name,
      type: preview.type,
      // AQCloset images look cleaner.
      image: preview.images.length ? preview.images : images,
      locations,
      // null = the wiki doesn't say. Left out if we couldn't reach the wiki, so
      // completeEntries tries again later.
      ...(map === undefined ? {} : { map }),
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

  // ok is false if the page is already saved.
  async function add(entry) {
    const items = await loadAll();
    const key = pageKey(entry.url);
    if (items.some((item) => pageKey(item.url) === key)) return { ok: false, items };
    const next = [...items, entry];
    await saveAll(next);
    return { ok: true, items: next };
  }

  const MAX_COMPLETE_TRIES = 3; // a page that can't be read is given up on after this many popup openings
  const PARALLEL_LOOKUPS = 4;

  // Entry from a transfer code. completeEntries fills in the rest from the wiki.
  function placeholder({ url, checked, map }, savedAt) {
    return {
      id: newId(),
      url,
      text: nameFromUrl(url),
      image: [],
      locations: [],
      price: null,
      mergeList: null,
      checked: Boolean(checked),
      savedAt,
      ...(map ? { map } : {}),
      incomplete: 1, // how many times it's been looked for; see completeEntries
    };
  }

  // A name to show until we have the real one.
  function nameFromUrl(url) {
    const slug = decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  async function completed(item) {
    if (item.incomplete) {
      const built = await build(item.url, null); // get the real title
      if (!built) {
        return item.incomplete >= MAX_COMPLETE_TRIES ? { ...item, incomplete: undefined } : { ...item, incomplete: item.incomplete + 1 };
      }
      // Keep the checkbox and position, take everything else from the wiki.
      return { ...built, id: item.id, checked: item.checked, savedAt: item.savedAt, map: item.map ?? built.map };
    }
    try {
      return { ...item, map: await WikiParser.findJoinMap(item.locations) };
    } catch {
      return item; // the wiki couldn't be reached: left without a map, to try again next time
    }
  }

  // Fills in entries missing something: ones from a transfer code, and older ones
  // without a /join map. Saves into the current list so changes made meanwhile
  // aren't lost.
  async function completeEntries() {
    const needs = (item) => item.incomplete || (item.map === undefined && item.locations && item.locations.length);
    const missing = (await loadAll()).filter(needs);
    if (!missing.length) return false;

    const found = new Map();
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const item = missing[next++];
        found.set(item.id, await completed(item).catch(() => item));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_LOOKUPS, missing.length) }, worker));

    const latest = await loadAll();
    const strip = (item) => (item.incomplete === undefined ? (({ incomplete, ...rest }) => rest)(item) : item);
    await saveAll(latest.map((item) => (found.has(item.id) && needs(item) ? strip(found.get(item.id)) : item)));
    return true;
  }

  return { build, buildFromCurrentPage, pageKey, loadAll, saveAll, contains, add, placeholder, completeEntries };
})();
