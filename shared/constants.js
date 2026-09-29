// Extension API: Firefox's promise-based `browser` namespace, or `chrome` in
// Chromium (which also returns promises since Chrome 121). Use `ext.` everywhere.
const ext = globalThis.browser ?? globalThis.chrome;

// Shared by the background worker, content scripts and the popup.
const STORAGE_KEYS = {
  farmItems: 'lip_saved_items',
  username: 'saved_username',
  theme: 'saved_theme', // 'dark' | 'light'
  inventory: 'savedInventory',
  boostCache: 'boostCache',
  resourceCache: 'resourceCache',
};

const WIKI_ORIGIN = 'http://aqwwiki.wikidot.com';
