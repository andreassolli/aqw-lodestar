// "Add to farm list" buttons on item pages and list cards. They show if the item
// is already on the list and update when it changes anywhere.
const FarmButtons = (() => {
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
  Features.run('itemButtons', addPageButton);

  return { create };
})();
