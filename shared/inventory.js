// The saved inventory (written by content/inventory-sync.js), as a lookup of
// what the player owns. Names are matched with normalizeItemName (shared/text.js),
// so every feature agrees on what counts as owned.

/** @returns {Map<string, number>} normalized item name -> total quantity */
function buildOwnedMap(inventory) {
  const owned = new Map();
  for (const entry of Array.isArray(inventory) ? inventory : []) {
    const key = normalizeItemName(entry.name);
    if (key) owned.set(key, (owned.get(key) || 0) + (entry.quantity || 1));
  }
  return owned;
}

/**
 * Calls onChange(ownedMap) with the current inventory, and again whenever it's re-synced.
 * An empty map means no inventory has been saved yet.
 */
function watchOwnedItems(onChange) {
  ext.storage.local.get(STORAGE_KEYS.inventory).then((result) => onChange(buildOwnedMap(result[STORAGE_KEYS.inventory])));
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.inventory]) onChange(buildOwnedMap(changes[STORAGE_KEYS.inventory].newValue));
  });
}
