// The saved inventory as a lookup. Everything uses normalizeItemName so they all
// agree on what you own.

function buildOwnedMap(inventory) {
  const owned = new Map();
  for (const entry of Array.isArray(inventory) ? inventory : []) {
    const key = normalizeItemName(entry.name);
    if (key) owned.set(key, (owned.get(key) || 0) + (entry.quantity || 1));
  }
  return owned;
}

// Calls onChange with the inventory now and again whenever it's synced.
function watchOwnedItems(onChange) {
  ext.storage.local.get(STORAGE_KEYS.inventory).then((result) => onChange(buildOwnedMap(result[STORAGE_KEYS.inventory])));
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.inventory]) onChange(buildOwnedMap(changes[STORAGE_KEYS.inventory].newValue));
  });
}
