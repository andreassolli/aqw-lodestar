// "Search Items by Tag" page: buttons for the lists in item-lists.config.js.
// Each list shows its items as cards that look exactly like the hover tooltip.
//
// Cards appear at once, drawn from the daily item catalog (name, rarity,
// images, location, price). As they scroll into view, each is then filled in
// with the full tooltip details, a few at a time. Skeleton placeholders stand
// in for whatever is still loading: the list, a card's details, its images.
(() => {
  if (!location.pathname.startsWith('/search-items-by-tag')) return;

  const MAX_PARALLEL_CARDS = 6;
  const PRELOAD_MARGIN = '800px 0px'; // start filling cards this far before they're visible
  const MAX_LOCATIONS = 3;
  const SKELETON_CARDS = 6; // shown while the list itself loads
  const BATCH_SIZE = 60; // cards added at a time; more as you scroll (inventories can be large)

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function wikiLink(path, text) {
    const link = el('a', null, text);
    link.href = new URL(path || '/', WIKI_ORIGIN).href;
    return link;
  }

  /** "Location: <links>" for one location, or "Locations:" and a short list. */
  function locationSection(locations) {
    const linksFor = (location) => {
      const names = location.name.split(' - ');
      const parts = [];
      names.forEach((name, i) => {
        if (i) parts.push(document.createTextNode(' - '));
        parts.push(location.paths && location.paths[i] ? wikiLink(location.paths[i], name) : document.createTextNode(name));
      });
      return parts;
    };

    if (locations.length === 1) {
      const p = el('p');
      p.append(el('strong', null, 'Location:'), ' ', ...linksFor(locations[0]));
      return [p];
    }
    const label = el('p');
    label.appendChild(el('strong', null, 'Locations:'));
    const list = el('ul');
    locations.slice(0, MAX_LOCATIONS).forEach((location) => {
      const li = el('li');
      li.append(...linksFor(location));
      list.appendChild(li);
    });
    if (locations.length > MAX_LOCATIONS) list.appendChild(el('li', null, '...'));
    return [label, list];
  }

  /** Same structure ItemPreview.fill produces, from what the catalog already knows. */
  function catalogPreview(item) {
    const details = el('div', 'aqwt-hover-details');

    const title = el('p', 'aqwt-tooltip-title', item.name);
    if (item.rarity && typeof RARITY_LABELS !== 'undefined' && RARITY_LABELS[item.rarity]) {
      ItemPreview.titleTags(title).appendChild(createRarityBadge(item.rarity));
    }
    details.appendChild(title);

    if (item.locations && item.locations.length) details.append(...locationSection(item.locations));
    if (item.price) {
      const p = el('p');
      p.append(el('strong', null, 'Price:'), ` ${item.price}`);
      details.appendChild(p);
    }
    return { images: item.images || [], fallbackImages: [], details };
  }

  function skeletonLines(widths) {
    const lines = el('div', 'aqwt-skeleton-lines');
    lines.setAttribute('aria-hidden', 'true');
    widths.forEach((width) => {
      const line = el('span', 'aqwt-skeleton aqwt-skeleton-line');
      line.style.width = width;
      lines.appendChild(line);
    });
    return lines;
  }

  /** Placeholder card shown while the list loads. */
  function skeletonCard() {
    const card = el('div', 'aqwt-card aqwt-list-card aqwt-skeleton-card');
    card.setAttribute('aria-hidden', 'true');
    const details = el('div', 'aqwt-hover-details');
    details.append(skeletonLines(['65%']), skeletonLines(['90%', '80%', '55%']), skeletonLines(['70%', '40%']));
    card.append(el('div', 'aqwt-skeleton aqwt-skeleton-image'), details);
    return card;
  }

  /** Shimmer over the image row until an image has loaded (or all have failed). */
  function watchImages(card) {
    const row = card.querySelector('.aqwt-tooltip-images');
    if (!row) return;
    const loaded = () => row.classList.remove('is-loading');
    if ([...row.querySelectorAll('img')].some((img) => img.complete && img.naturalWidth > 0)) return;

    row.classList.add('is-loading');
    row.addEventListener('load', loaded, { capture: true, once: true });
    row.addEventListener(
      'error',
      // ItemPreview.fill removes the failed image (and may add stand-ins) after this runs.
      () => setTimeout(() => {
        if (!row.querySelector('img')) loaded();
      }),
      true
    );
  }

  function fillCard(card, preview, item) {
    ItemPreview.fill(card, preview, { titleUrl: item.url });
    watchImages(card);
    const actions = el('div', 'aqwt-card-actions');
    const tags = preview.tags && preview.tags.length ? preview.tags : item.tags;
    if (TryOnButtons.isWearable(tags)) actions.appendChild(TryOnButtons.create({ name: item.name, compact: true }));
    actions.appendChild(
      FarmButtons.create({ url: item.url, compact: true, buildEntry: () => FarmEntry.build(item.url, item.name) })
    );
    card.appendChild(actions);
  }

  function createCard(item) {
    const card = el('div', 'aqwt-card aqwt-list-card');
    fillCard(card, catalogPreview(item), item);
    // Stands in for the full tooltip details until they've loaded.
    card.querySelector('.aqwt-hover-details')?.appendChild(skeletonLines(['85%', '70%', '50%']));
    return card;
  }

  function createQueue(limit) {
    let active = 0;
    const pending = [];
    const next = () => {
      while (active < limit && pending.length) {
        const job = pending.shift();
        active++;
        job().finally(() => {
          active--;
          next();
        });
      }
    };
    return {
      add(job) {
        pending.push(job);
        next();
      },
      clear() {
        pending.length = 0;
      },
    };
  }

  const queue = createQueue(MAX_PARALLEL_CARDS);

  async function upgradeCard(card, item) {
    const preview = await ItemPreview.load({ url: item.url, name: item.name });
    if (!card.isConnected) return;
    if (preview) {
      fillCard(card, preview, item);
    } else {
      // Keep the catalog version if the page couldn't be read.
      card.querySelector('.aqwt-hover-details > .aqwt-skeleton-lines')?.remove();
    }
  }

  const cardObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        cardObserver.unobserve(entry.target);
        const { card, item } = entry.target.aqwtItem;
        queue.add(() => upgradeCard(card, item));
      }
    },
    { rootMargin: PRELOAD_MARGIN }
  );

  function mount() {
    const wrapper = el('div', 'aqwt-lists');
    wrapper.innerHTML = `
      <div class="aqwt-list-buttons"></div>
      <section class="aqwt-list-results" hidden>
        <p class="aqwt-list-status" role="status"></p>
        <div class="aqwt-list-grid"></div>
      </section>`;

    const buttons = wrapper.querySelector('.aqwt-list-buttons');
    for (const list of ITEM_LISTS) {
      const button = el('button', 'aqwt-list-button', list.label);
      button.type = 'button';
      button.dataset.list = list.id;
      if (list.title) button.title = list.title;
      if (list.color) button.style.setProperty('--aqwt-list-color', list.color);
      button.setAttribute('aria-expanded', 'false');
      buttons.appendChild(button);
    }

    // Third child of the page content: after the "Google Search - Search Items
    // by Tag" links and the "For any questions" note, above the tag search iframe.
    const content = document.querySelector('#page-content');
    if (content) content.insertBefore(wrapper, content.children[2] || null);

    return {
      buttons,
      results: wrapper.querySelector('.aqwt-list-results'),
      status: wrapper.querySelector('.aqwt-list-status'),
      grid: wrapper.querySelector('.aqwt-list-grid'),
    };
  }

  const ui = mount();
  let openList = null;
  let requestId = 0;
  let pendingItems = []; // matching items not turned into cards yet

  // A marker after the last card; when it nears the screen, the next batch is added.
  const sentinel = el('div', 'aqwt-list-sentinel');
  const batchObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) renderNextBatch();
    },
    { rootMargin: '1200px 0px' }
  );
  batchObserver.observe(sentinel);

  function renderNextBatch() {
    if (!pendingItems.length) return;
    const cards = pendingItems.splice(0, BATCH_SIZE).map((item) => {
      const card = createCard(item);
      card.aqwtItem = { card, item };
      return card;
    });
    sentinel.before(...cards);
    cards.forEach((card) => cardObserver.observe(card));
    if (!pendingItems.length) sentinel.remove();
  }

  function setOpen(listId) {
    openList = listId;
    ui.results.hidden = !listId;
    ui.buttons.querySelectorAll('.aqwt-list-button').forEach((button) => {
      button.setAttribute('aria-expanded', String(button.dataset.list === listId));
    });
  }

  function formatDate(iso) {
    return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  }

  async function showList(list) {
    const myRequest = ++requestId; // ignore answers for a list that's no longer selected
    setOpen(list.id);
    queue.clear();
    cardObserver.disconnect();
    pendingItems = [];
    ui.grid.replaceChildren(...Array.from({ length: SKELETON_CARDS }, skeletonCard));
    ui.grid.setAttribute('aria-busy', 'true');
    ui.status.textContent = 'Loading list…';

    const response = await queryItemCatalog(list.filter || {}, list.source || 'catalog');
    if (myRequest !== requestId) return;
    ui.grid.removeAttribute('aria-busy');

    if (!response || response.error) {
      ui.grid.replaceChildren();
      const reason = response ? response.error : 'the extension background did not respond';
      ui.status.textContent = `Couldn't load the ${list.label} list (${reason}).`;
      return;
    }

    const { items, updatedAt } = response;
    const emptyMessage = response.noInventory
      ? 'No synced inventory yet. Use the Sync button on your account.aq.com Inventory page first.'
      : response.noFarmItems
        ? 'Your farm list is empty. Use "Add to farm list" on an item page or card, or right-click an item link.'
        : null;
    if (emptyMessage) {
      ui.grid.replaceChildren();
      ui.status.textContent = emptyMessage;
      return;
    }

    const updated = formatDate(updatedAt);
    const count = items.length.toLocaleString();
    const noun = { inventory: 'owned item', farm: 'item on your farm list' }[list.source] || `${list.label} item`;
    const plural = items.length === 1 ? noun : noun.replace(/item/, 'items');
    ui.status.textContent = `${count} ${plural}` + (updated ? ` · catalog updated ${updated}` : '');

    pendingItems = items.slice();
    ui.grid.replaceChildren(sentinel);
    renderNextBatch();
  }

  ui.buttons.addEventListener('click', (e) => {
    const button = e.target.closest('.aqwt-list-button');
    if (!button) return;
    const list = ITEM_LISTS.find((l) => l.id === button.dataset.list);
    if (!list) return;
    if (openList === list.id) {
      requestId++;
      queue.clear();
      setOpen(null); // clicking the open list closes it
    } else {
      showList(list);
    }
  });
})();
