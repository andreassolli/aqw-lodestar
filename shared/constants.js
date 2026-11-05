// Firefox has `browser`, Chrome has `chrome` (both do promises now). Use `ext`.
const ext = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEYS = {
  farmItems: 'lip_saved_items',
  username: 'saved_username',
  theme: 'saved_theme',
  inventory: 'savedInventory',
  inventorySyncedAt: 'inventorySyncedAt', // when Sync was last pressed
  tooltipPlacement: 'tooltipPlacement', // 'side' | 'anchored' | 'off'
  boostSchedule: 'boostSchedule',
  boostCache: 'boostCache', // old, not written anymore
  resourceCache: 'resourceCache',
  itemCatalog: 'itemCatalog',
  pageLinks: 'pageLinks', // cached links from pages like staff birthdays
  imgurImages: 'imgurImages', // no longer used: Imgur pictures are always replaced automatically where it's blocked (image-proxy.js)
  imgurCheck: 'imgurCheck',
  collapsedInventorySections: 'collapsedInventorySections',
  itemListFilter: 'itemListFilter',
  itemListSelection: 'itemListSelection',
  syncStamps: 'syncStamps', // when each synced key last changed here
  syncPairing: 'syncPairing', // the desktop app sync's { token, pairedAt, lastSyncAt, lastError } (shared/sync.js)
  disabledFeatures: 'disabledFeatures',
};

const WIKI_ORIGIN = 'http://aqwwiki.wikidot.com';

// The item catalog, rebuilt every day by a GitHub Action in lodestar-updates.
const ITEM_CATALOG_URL = 'https://raw.githubusercontent.com/andreassolli/lodestar-updates/refs/heads/main/items.json';
