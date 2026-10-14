// "Add to farm list" buttons: one next to the title on wiki item pages, and
// a small one on each item list card (item-lists.js uses FarmButtons.create).
// Every button shows whether its item is already on the list, and updates
// when the list changes anywhere (the popup, the right-click menu, ...).
const FarmButtons = (() => {
  // Pages carrying these tags aren't items.
  const NON_ITEM_TAGS = ['npc', 'quest', 'shop', 'location', 'monster', 'war', 'cutscene', 'minigame', 'disambiguation', 'enhancement'];
  const PLUS_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
  const CHECK_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  let savedKeys = new Set();

  async function refreshSaved(items) {
    const list = items || (await FarmEntry.loadAll());
    savedKeys = new Set(list.map((item) => FarmEntry.pageKey(item.url)));
    document.querySelectorAll('.aqwt-farm-button').forEach(render);
  }

  function render(button) {
    if (button.dataset.state === 'busy') return;
    const saved = savedKeys.has(FarmEntry.pageKey(button.dataset.url));
    const compact = button.classList.contains('is-compact');
    button.dataset.state = saved ? 'saved' : button.dataset.state === 'error' ? 'error' : 'idle';
    button.disabled = saved;

    const label = saved ? 'On your farm list' : button.dataset.state === 'error' ? "Couldn't add, try again" : 'Add to farm list';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = (saved ? CHECK_ICON : PLUS_ICON) + (compact ? '' : `<span>${label}</span>`);
  }

  /**
   * @param {{url: string, buildEntry: () => Promise<object|null>, compact?: boolean}} options
   *   buildEntry makes the farm entry when clicked; compact = icon only (cards)
   */
  function create({ url, buildEntry, compact = false }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'aqwt-farm-button' + (compact ? ' is-compact' : '');
    button.dataset.url = url;

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (button.dataset.state === 'busy' || button.dataset.state === 'saved') return;

      button.dataset.state = 'busy';
      button.title = 'Adding…';
      button.setAttribute('aria-label', 'Adding…');
      if (!compact) button.querySelector('span').textContent = 'Adding…';
      try {
        const entry = await buildEntry();
        if (!entry) throw new Error('page could not be read');
        const { items } = await FarmEntry.add(entry);
        button.dataset.state = 'idle';
        await refreshSaved(items);
      } catch (err) {
        console.error('AQW Lodestar: could not add to farm list:', err);
        button.dataset.state = 'error';
        render(button);
      }
    });

    render(button);
    return button;
  }

  function isItemPageHere() {
    if (!PAGE.isWiki || location.pathname.startsWith('/search-items-by-tag')) return false;
    if (!WikiParser.isItemPage(document) || WikiParser.isNonItemCategory(document)) return false;
    const tags = WikiParser.parseTags(document);
    return !tags.some((tag) => NON_ITEM_TAGS.includes(tag));
  }

  function addPageButton() {
    const title = document.getElementById('page-title');
    if (!title || !isItemPageHere()) return;
    title.appendChild(
      create({
        url: `${WIKI_ORIGIN}${location.pathname}`,
        buildEntry: () => FarmEntry.buildFromCurrentPage(),
      })
    );
  }

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.farmItems]) refreshSaved(changes[STORAGE_KEYS.farmItems].newValue || []);
  });
  refreshSaved();
  addPageButton();

  return { create };
})();
