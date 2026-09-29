// "Check bag": looks up a character's inventory and ticks off farm-list
// items they already own.
const InventoryCheck = (() => {
  async function fetchInventory(username) {
    const fvars = await fetchText(`https://game.aq.com/game/api/charpage/fvars?id=${encodeURIComponent(username)}`);
    const charId = fvars && new URLSearchParams(fvars).get('CharID');
    if (!charId) return null;

    const json = await fetchText(`https://account.aq.com/CharPage/inventory?ccid=${encodeURIComponent(charId)}`);
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async function run(username) {
    if (!username) return;
    ext.storage.local.set({ [STORAGE_KEYS.username]: username });

    const inventory = await fetchInventory(username);
    if (!Array.isArray(inventory)) {
      console.log('Could not fetch inventory for', username);
      return;
    }

    const owned = new Set(inventory.map((entry) => entry.strName));
    const items = await FarmEntry.loadAll();
    let changed = false;
    for (const item of items) {
      if (!item.checked && owned.has(item.text)) {
        item.checked = true;
        changed = true;
      }
    }

    if (changed) {
      await FarmEntry.saveAll(items);
      FarmList.render(items);
    }
  }

  function init() {
    const input = document.getElementById('aqw_username');
    ext.storage.local.get(STORAGE_KEYS.username).then((result) => {
      input.value = result[STORAGE_KEYS.username] || '';
    });
    document.getElementById('check_progress').addEventListener('click', () => run(input.value.trim()));
  }

  return { init };
})();
