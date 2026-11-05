// Popup/content side of the background fetches. background.js has functions with
// the same names, so aqcloset.js and wiki-parser.js work everywhere.

async function sendToBackground(message) {
  try {
    return (await ext.runtime.sendMessage(message)) ?? null;
  } catch {
    return null; // background not there, or the extension was reloaded
  }
}

function fetchPage(url) {
  return sendToBackground({ type: 'FETCH_PAGE', url });
}

function queryItemCatalog(filter, source = 'catalog') {
  return sendToBackground({ type: 'QUERY_ITEMS', filter, source });
}

function lookupItems(entries) {
  return sendToBackground({ type: 'LOOKUP_ITEMS', entries });
}

function findItemPage(item) {
  return sendToBackground({ type: 'FIND_ITEM_PAGE', ...item });
}

function fetchText(url) {
  return sendToBackground({ type: 'FETCH_TEXT', url });
}

function tryOnItem(name) {
  return sendToBackground({ type: 'TRY_ON', name });
}

// Which wiki links are items, by path. null if we can't check, then nothing gets ruled out.
async function classifyWikiLinks(entries) {
  const result = await sendToBackground({ type: 'CLASSIFY_LINKS', entries });
  return result && Array.isArray(result.items) ? result.items : null;
}

function wikiPathOf(url) {
  try {
    const parsed = new URL(url, WIKI_ORIGIN);
    return parsed.hostname === new URL(WIKI_ORIGIN).hostname ? parsed.pathname.toLowerCase().replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}
