// Checkmarks on items you own: wiki, character pages, tooltips and cards.
// Green border on list cards and AQCloset items.
Features.run('ownedMarks', () => {
  // [selector, how]: checkmark 'after' it, in the 'title', or green border on the 'image'.
  const TARGETS = [
    ['.aqwt-tooltip-title, #page-title', 'title'],
    ...(PAGE.isWiki ? [['#page-content a[href]', 'after']] : []),
    ...(PAGE.isCharPage ? [['a.item', 'after']] : []),
    ...(PAGE.isAqcloset ? [['.object .label .name', 'image']] : []),
  ];
  const SELECTOR = TARGETS.map(([selector]) => selector).join(', ');
  const SKIP_AREAS = '.pager, #breadcrumbs, .page-tags';
  const TITLE_BUTTONS = '.aqwt-farm-button, .aqwt-try-on-button';

  let owned = new Map(); // normalized name -> quantity
  // Whether a wiki link is an item, so maps and monsters don't get a checkmark.
  // Asked once per path.
  const isItemPath = new Map();

  function createMark(quantity) {
    const mark = document.createElement('span');
    mark.className = 'aqwt-owned';
    mark.title = quantity > 1 ? `In your inventory (x${quantity})` : 'In your inventory';
    mark.setAttribute('aria-label', mark.title);
    return mark;
  }

  // Page title: before the farm/try on buttons. Cards: in the badge row.
  function placeInTitle(title, mark) {
    if (title.id === 'page-title') {
      title.insertBefore(mark, title.querySelector(`:scope > :is(${TITLE_BUTTONS})`));
    } else {
      ItemPreview.titleTags(title).appendChild(mark);
    }
  }

  function markElement(el) {
    if (el.dataset.aqwtOwned || el.closest(SKIP_AREAS)) return;
    // The title gets marked as a whole, its link would add a second checkmark.
    if (el.matches('a') && el.closest('.aqwt-tooltip-title')) return;

    el.dataset.aqwtOwned = '1';

    const quantity = owned.get(normalizeItemName(getItemLinkLabel(el)));
    if (!quantity) return;

    // Wiki links wait until we know they're items.
    const path = PAGE.isWiki && el.matches('#page-content a[href]') ? wikiPathOf(el.href) : null;
    if (path) {
      whenItemLink(path, getItemLinkLabel(el)).then((isItem) => {
        // skip if it got removed or already marked by a refresh
        if (isItem && el.isConnected && el.dataset.aqwtOwned && !el.nextElementSibling?.classList.contains('aqwt-owned')) addMark(el, quantity);
      });
      return;
    }
    addMark(el, quantity);
  }

  // Paths to check, sent together once per frame.
  let toClassify = [];
  function whenItemLink(path, name) {
    if (!isItemPath.has(path)) {
      isItemPath.set(path, new Promise((resolve) => toClassify.push({ path, name, resolve })));
      if (toClassify.length === 1) {
        requestAnimationFrame(async () => {
          const batch = toClassify;
          toClassify = [];
          const answers = await classifyWikiLinks(batch.map(({ path: p, name: n }) => ({ path: p, name: n })));
          // No catalog, just mark by name like before.
          batch.forEach((entry, i) => entry.resolve(answers ? answers[i] : true));
        });
      }
    }
    return isItemPath.get(path);
  }

  function addMark(el, quantity) {
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
    document.querySelectorAll('.aqwt-title-tags:empty').forEach((tags) => tags.remove());
    document.querySelectorAll('.aqwt-owned-object').forEach((object) => object.classList.remove('aqwt-owned-object'));
    document.querySelectorAll('.aqwt-owned-card').forEach((card) => card.classList.remove('aqwt-owned-card'));
    document.querySelectorAll('[data-aqwt-owned]').forEach((el) => delete el.dataset.aqwtOwned);
    markWithin(document);
  }

  // Mark new stuff (tooltips, cards, AQCloset items) once per frame.
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
});
