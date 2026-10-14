// "Try on" buttons: one next to the title on wiki item pages, and a small one
// on each item list card (item-lists.js uses TryOnButtons.create). Clicking
// opens the AQCloset wardrobe wearing your saved character's outfit plus the item.
const TryOnButtons = (() => {
  // Items with these wiki tags can't be worn, so they get no button.
  const NOT_WEARABLE_TAGS = ['item', 'house', 'floor-item', 'wall-item', 'npc', 'quest', 'shop', 'location', 'monster', 'enhancement'];
  const ERROR_RESET_MS = 4000;
  const HANGER_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 7.5a2 2 0 1 1 2-2c0 1-.8 1.5-2 2.4v1.6"/><path d="M12 9.5 3.5 15.6c-.9.7-.4 2.1.7 2.1h15.6c1.1 0 1.6-1.4.7-2.1L12 9.5z"/></svg>';

  const isWearable = (tags) => !(tags || []).some((tag) => NOT_WEARABLE_TAGS.includes(tag));

  function render(button, state, text) {
    const compact = button.classList.contains('is-compact');
    const label = text || 'Try on at AQCloset';
    button.dataset.state = state;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = HANGER_ICON + (compact ? '' : `<span>${label}</span>`);
  }

  /** @param {{name: string, compact?: boolean}} options compact = icon only (cards) */
  function create({ name, compact = false }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'aqwt-try-on-button' + (compact ? ' is-compact' : '');
    let resetTimer = null;

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (button.dataset.state === 'busy') return;

      clearTimeout(resetTimer);
      render(button, 'busy', 'Opening AQCloset…');
      const result = await tryOnItem(name);
      if (result && result.ok) {
        render(button, 'idle');
        return;
      }
      render(button, 'error', result && result.error === 'not on AQCloset' ? 'Not found on AQCloset' : "Couldn't open AQCloset");
      resetTimer = setTimeout(() => render(button, 'idle'), ERROR_RESET_MS);
    });

    render(button, 'idle');
    return button;
  }

  function addPageButton() {
    if (!PAGE.isWiki || location.pathname.startsWith('/search-items-by-tag')) return;
    const title = document.getElementById('page-title');
    if (!title || !WikiParser.isItemPage(document) || WikiParser.isNonItemCategory(document)) return;
    if (!isWearable(WikiParser.parseTags(document))) return;
    title.appendChild(create({ name: WikiParser.getTitle(document) }));
  }

  addPageButton();

  return { create, isWearable };
})();
