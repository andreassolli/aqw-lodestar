// Content-script / popup side of the background fetch API.
// background.js defines functions with the same names that fetch directly,
// so shared modules (aqcloset.js, wiki-parser.js) work in every context.

async function sendToBackground(message) {
  try {
    return (await ext.runtime.sendMessage(message)) ?? null;
  } catch {
    return null; // background unavailable, or the extension was reloaded
  }
}

/**
 * @returns {Promise<{html: string, baseUrl: string}|{error: string}|null>}
 *   null only when the background couldn't be reached at all
 */
function fetchPage(url) {
  return sendToBackground({ type: 'FETCH_PAGE', url });
}

/**
 * Items matching a list filter (see matchesFilter in background.js).
 * @param {{allTags?: string[], anyTags?: string[], noneTags?: string[], rarities?: string[], nameIncludes?: string}} filter
 * @param {'catalog'|'inventory'} [source] - every wiki item, or only the synced inventory
 * @returns {Promise<{items: {url, name, tags, rarity, price, locations, images}[], updatedAt: string|null, noInventory?: boolean}|{error: string}|null>}
 */
function queryItemCatalog(filter, source = 'catalog') {
  return sendToBackground({ type: 'QUERY_ITEMS', filter, source });
}

/**
 * Rarity and tags for items, looked up in the daily item catalog by exact name,
 * then by wiki path. One result per entry, null where the catalog has no match.
 * @param {{name?: string, path?: string|null}[]} entries
 * @returns {Promise<{items: ({rarity: string|null, tags: string[]}|null)[]}|{error: string}|null>}
 */
function lookupItems(entries) {
  return sendToBackground({ type: 'LOOKUP_ITEMS', entries });
}

/** @returns {Promise<string|null>} */
function fetchText(url) {
  return sendToBackground({ type: 'FETCH_TEXT', url });
}

/** Opens the item on AQCloset with the saved character's outfit. Resolves { ok } or { error }. */
function tryOnItem(name) {
  return sendToBackground({ type: 'TRY_ON', name });
}
