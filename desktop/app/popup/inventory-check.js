// "Check bag": looks up a character's inventory, ticks off farm-list items
// they already own, and adds items not yet in the saved inventory to it.
const InventoryCheck = (() => {
  async function fetchCharacterInventory(username) {
    const fvars = await fetchText(`https://game.aq.com/game/api/charpage/fvars?id=${encodeURIComponent(username)}`);
    const charId = fvars && new URLSearchParams(fvars).get('CharID');
    if (!charId) return null;

    const json = await fetchText(`https://account.aq.com/CharPage/inventory?ccid=${encodeURIComponent(charId)}`);
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  // Character page entries ({ strName, intCount, strType, ... }) in the saved-inventory format.
  function toInventoryEntries(characterItems) {
    return characterItems
      .filter((entry) => entry && entry.strName)
      .map((entry) => ({
        name: String(entry.strName).trim(),
        quantity: Number(entry.intCount) || 1,
        type: entry.strType || null,
        location: 'Inventory',
      }));
  }

  // Adds entries whose item isn't saved yet; existing entries are left as they are.
  async function addToSavedInventory(entries) {
    const result = await ext.storage.local.get(STORAGE_KEYS.inventory);
    const saved = Array.isArray(result[STORAGE_KEYS.inventory]) ? result[STORAGE_KEYS.inventory] : [];
    const known = new Set(saved.map((entry) => normalizeItemName(entry.name)));

    const additions = [];
    for (const entry of entries) {
      const key = normalizeItemName(entry.name);
      if (!key || known.has(key)) continue;
      known.add(key);
      additions.push(entry);
    }
    if (additions.length) await ext.storage.local.set({ [STORAGE_KEYS.inventory]: [...saved, ...additions] });
    return additions.length;
  }

  async function tickFarmItems(entries) {
    const owned = new Set(entries.map((entry) => normalizeItemName(entry.name)));
    const items = await FarmEntry.loadAll();
    let ticked = 0;
    for (const item of items) {
      if (!item.checked && owned.has(normalizeItemName(item.text))) {
        item.checked = true;
        ticked++;
      }
    }
    if (ticked) {
      await FarmEntry.saveAll(items);
      FarmList.render(items);
    }
    return ticked;
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById('check-status');
    status.hidden = !message;
    status.textContent = message || '';
    status.classList.toggle('is-error', isError);
  }

  async function run(username) {
    if (!username) return;
    ext.storage.local.set({ [STORAGE_KEYS.username]: username });
    setStatus(`Checking ${username}'s bag…`);

    const characterItems = await fetchCharacterInventory(username);
    if (!characterItems) {
      setStatus(`Couldn't load ${username}'s inventory. Is the character page public?`, true);
      return;
    }

    const entries = toInventoryEntries(characterItems);
    const [added, ticked] = await Promise.all([addToSavedInventory(entries), tickFarmItems(entries)]);
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    setStatus(`Added ${plural(added, 'new item')} to your inventory · ticked ${plural(ticked, 'farm item')}`);
  }

  function init() {
    const input = document.getElementById('aqw_username');
    ext.storage.local.get(STORAGE_KEYS.username).then((result) => {
      input.value = result[STORAGE_KEYS.username] || '';
    });
    document.getElementById('check_progress').addEventListener('click', () => run(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') run(input.value.trim());
    });
  }

  return { init };
})();
