// Marks items in the saved inventory (see inventory-sync.js): a checkmark on
// the wiki, character pages and our own tooltip and list cards, a green border
// around item list cards, and a green border around the item image on AQCloset.
(() => {
  // [selector, how to mark]: a checkmark 'after' the element, in the 'title'
  // (see placeInTitle), or 'image': a green border on the item image of the
  // enclosing .object.
  const TARGETS = [
    ['.aqwt-tooltip-title, #page-title', 'title'],
    ...(PAGE.isWiki ? [['#page-content a[href]', 'after']] : []),
    ...(PAGE.isCharPage ? [['a.item', 'after']] : []),
    ...(PAGE.isAqcloset ? [['.object .label .name', 'image']] : []),
  ];
  const SELECTOR = TARGETS.map(([selector]) => selector).join(', ');
  const SKIP_AREAS = '.aqwt-list-buttons, .pager, #breadcrumbs, .page-tags';
  // The buttons farm-buttons.js and try-on-buttons.js add to a wiki page title.
  const TITLE_BUTTONS = '.aqwt-farm-button, .aqwt-try-on-button';

  let owned = new Map(); // normalized name > total quantity

  function createMark(quantity) {
    const mark = document.createElement('span');
    mark.className = 'aqwt-owned';
    mark.title = quantity > 1 ? `In your inventory (x${quantity})` : 'In your inventory';
    mark.setAttribute('aria-label', mark.title);
    return mark;
  }

  /**
   * Wiki page title: just before the "Add to farm list" / "Try on" buttons
   * (they're appended at the end, so if they come later they still land after it).
   * Tooltip and list card titles: in the same badge row as the rarity badge,
   * so it wraps along with the badges instead of sitting apart.
   */
  function placeInTitle(title, mark) {
    if (title.id === 'page-title') {
      title.insertBefore(mark, title.querySelector(`:scope > :is(${TITLE_BUTTONS})`));
    } else {
      ItemPreview.titleTags(title).appendChild(mark);
    }
  }

  function markElement(el) {
    if (el.dataset.aqwtOwned || el.closest(SKIP_AREAS)) return;
    // A tooltip/card title is marked as a whole; its link would add a second checkmark.
    if (el.matches('a') && el.closest('.aqwt-tooltip-title')) return;

    el.dataset.aqwtOwned = '1'; // checked, owned or not

    const quantity = owned.get(normalizeItemName(getItemLinkLabel(el)));
    if (!quantity) return;

    // Item list cards also get a green border.
    if (el.matches('.aqwt-tooltip-title')) el.closest('.aqwt-list-card')?.classList.add('aqwt-owned-card');

    const placement = TARGETS.find(([selector]) => el.matches(selector))[1];
    if (placement === 'image') {
      el.closest('.object')?.classList.add('aqwt-owned-object');
    } else if (placement === 'title') {
      placeInTitle(el, createMark(quantity));
    } else {
      el.after(createMark(quantity));
    }
  }

  function markWithin(root) {
    if (!owned.size) return;
    if (root.matches?.(SELECTOR)) markElement(root);
    root.querySelectorAll?.(SELECTOR).forEach(markElement);
  }

  function refresh(ownedMap) {
    owned = ownedMap;
    document.querySelectorAll('.aqwt-owned').forEach((mark) => mark.remove());
    // A badge row that only held the checkmark is now empty.
    document.querySelectorAll('.aqwt-title-tags:empty').forEach((tags) => tags.remove());
    document.querySelectorAll('.aqwt-owned-object').forEach((object) => object.classList.remove('aqwt-owned-object'));
    document.querySelectorAll('.aqwt-owned-card').forEach((card) => card.classList.remove('aqwt-owned-card'));
    document.querySelectorAll('[data-aqwt-owned]').forEach((el) => delete el.dataset.aqwtOwned);
    markWithin(document);
  }

  // New content (tooltips, list cards, AQCloset items) is marked in one pass per frame.
  let pending = [];
  let scheduled = false;
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('aqwt-owned')) pending.push(node);
      }
    }
    if (scheduled || !pending.length) return;
    scheduled = true;
    requestAnimationFrame(() => {
      const nodes = pending;
      pending = [];
      scheduled = false;
      nodes.forEach((node) => node.isConnected && markWithin(node));
    });
  }).observe(document.body, { childList: true, subtree: true });

  watchOwnedItems(refresh);
})();
