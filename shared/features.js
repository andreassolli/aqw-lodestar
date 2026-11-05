// Feature switches in Settings. Everything's on until you turn it off, and the
// ones that are off get saved as a list of ids.
//
// Scripts start with Features.run('<id>', () => { ... }) instead of (() => { ... })()
// and only run if that feature is on. Changes apply next time a page loads.
const Features = (() => {
  const LIST = [
    { id: 'ownedMarks', label: 'Owned items', description: 'Checkmarks on items you own.', desktop: true },
    { id: 'itemButtons', label: 'Add to farm list and Try on buttons', description: 'On item pages and cards.', desktop: true },
    { id: 'mergeCalc', label: 'Merge and quest calculator', description: 'What a merge or quest needs.' },
    { id: 'itemLists', label: 'Event item lists', description: 'On Search Items by Tag.' },
    { id: 'rarityBadges', label: 'Rarity badges', description: 'On account.aq.com.' },
    { id: 'characterDownload', label: 'Character picture download', description: 'On character pages.' },
    { id: 'aqclosetReorder', label: 'AQCloset panel reordering', description: 'Drag the wardrobe panels.' },
  ];
  // Old switches that got merged into one.
  const MERGED = { farmButtons: 'itemButtons', tryOnButtons: 'itemButtons', collectionProgress: 'ownedMarks' };

  let off = new Set();
  const ready = ext.storage.local
    .get(STORAGE_KEYS.disabledFeatures)
    .then((result) => {
      off = new Set((result[STORAGE_KEYS.disabledFeatures] || []).map((id) => MERGED[id] || id));
    })
    .catch(() => {});

  if (ext.storage.onChanged) {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEYS.disabledFeatures]) off = new Set((changes[STORAGE_KEYS.disabledFeatures].newValue || []).map((id) => MERGED[id] || id));
    });
  }

  // true until the saved choice has loaded
  const isOn = (id) => !off.has(id);

  const run = (id, start) =>
    ready.then(() => {
      if (isOn(id)) start();
    });

  async function set(id, on) {
    await ready;
    if (on) off.delete(id);
    else off.add(id);
    // Drop switches that don't exist anymore.
    await ext.storage.local.set({ [STORAGE_KEYS.disabledFeatures]: [...off].filter((offId) => LIST.some((feature) => feature.id === offId)) });
  }

  return { LIST, ready, isOn, run, set };
})();
