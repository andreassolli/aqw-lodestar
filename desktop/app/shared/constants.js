// Extension API: Firefox's promise-based `browser` namespace, or `chrome` in
// Chromium (which also returns promises since Chrome 121). Use `ext.` everywhere.
const ext = globalThis.browser ?? globalThis.chrome;

// Shared by the background worker, content scripts and the popup.
const STORAGE_KEYS = {
  farmItems: 'lip_saved_items',
  username: 'saved_username',
  theme: 'saved_theme', // 'dark' | 'light'
  inventory: 'savedInventory',
  inventorySyncedAt: 'inventorySyncedAt', // ms timestamp of the last sync button press
  tooltipPlacement: 'tooltipPlacement', // 'side' (fixed at the right edge) | 'anchored' (on the hovered item)
  boostSchedule: 'boostSchedule', // boost events parsed from the Artix calendar
  boostCache: 'boostCache', // older boost caches, no longer written
  resourceCache: 'resourceCache',
  itemCatalog: 'itemCatalog', // daily copy of the wiki item catalog
  imgurImages: 'imgurImages', // 'auto' (replace when Imgur is blocked here) | 'replace' (always) | 'direct' (never)
  imgurCheck: 'imgurCheck', // last "is Imgur blocked here?" result: { at, blocked }
  collapsedInventorySections: 'collapsedInventorySections', // section names hidden on char pages
  itemListFilter: 'itemListFilter', // item lists: { ac, member, neither, showOwned } (content/item-list-view.js)
};

const WIKI_ORIGIN = 'http://aqwwiki.wikidot.com';

// Daily wiki item catalog (every wiki item's name, tags, rarity, price,
// locations and images), committed to the lodestar-updates repository's main
// branch by its "Update item catalog" GitHub Actions workflow.
const ITEM_CATALOG_URL = 'https://raw.githubusercontent.com/andreassolli/lodestar-updates/refs/heads/main/items.json';
