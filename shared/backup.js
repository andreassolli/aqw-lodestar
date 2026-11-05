// Export/import of everything the extension saves.
const Backup = (() => {
  const FORMAT = 'aqw-lodestar-backup';
  const FORMAT_VERSION = 1;
  // Caches get downloaded again anyway. Sync pairing belongs to this install only.
  const SKIPPED_KEYS = [STORAGE_KEYS.itemCatalog, STORAGE_KEYS.pageLinks, STORAGE_KEYS.syncPairing, STORAGE_KEYS.syncStamps, STORAGE_KEYS.boostSchedule, STORAGE_KEYS.boostCache, STORAGE_KEYS.resourceCache, STORAGE_KEYS.imgurCheck];
  const LAYOUT_PREFIX = 'moduleOrder:';

  async function currentData() {
    const all = await ext.storage.local.get(null);
    for (const key of SKIPPED_KEYS) delete all[key];
    return all;
  }

  // One line per kind of data, for the summary.
  function describe(data) {
    const count = (value) => (Array.isArray(value) ? value.length : 0);
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const layouts = Object.keys(data).filter((key) => key.startsWith(LAYOUT_PREFIX)).length;
    const syncedAt = data[STORAGE_KEYS.inventorySyncedAt];
    const placement = { anchored: 'above the item', off: 'off' }[data[STORAGE_KEYS.tooltipPlacement]] || 'at the side';

    return [
      plural(count(data[STORAGE_KEYS.farmItems]), 'item') + ' on the farm list',
      plural(count(data[STORAGE_KEYS.inventory]), 'inventory item') +
        (syncedAt ? ` (synced ${new Date(syncedAt).toLocaleDateString()})` : ''),
      plural(layouts, 'AQCloset layout'),
      plural(count(data[STORAGE_KEYS.collapsedInventorySections]), 'collapsed inventory section'),
      `Settings: ${data[STORAGE_KEYS.theme] || 'dark'} theme, tooltip ${placement}` +
        (data[STORAGE_KEYS.username] ? `, username ${data[STORAGE_KEYS.username]}` : ''),
    ];
  }

  async function download() {
    const backup = {
      format: FORMAT,
      version: FORMAT_VERSION,
      extensionVersion: ext.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      data: await currentData(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lodestar-backup-${backup.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Parses a backup file. Throws a readable error if it's not one.
  function parse(text) {
    let backup;
    try {
      backup = JSON.parse(text);
    } catch {
      throw new Error("that file isn't valid JSON");
    }
    if (!backup || backup.format !== FORMAT || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
      throw new Error("that file isn't a Lodestar backup");
    }
    if (backup.version > FORMAT_VERSION) {
      throw new Error('that backup was made by a newer version of Lodestar; update the extension first');
    }
    const data = { ...backup.data };
    for (const key of SKIPPED_KEYS) delete data[key];
    return { data, exportedAt: backup.exportedAt };
  }

  function restore(data) {
    return ext.storage.local.set(data);
  }

  return { currentData, describe, download, parse, restore };
})();
