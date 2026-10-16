// The event item lists: a button for each list in item-lists.config.js, and
// the chosen list's items as cards that look exactly like the hover tooltip.
// Used by item-lists.js on the wiki's "Search Items by Tag" page, and by the
// desktop app's Item Lists plugin, so both show the same results.
//
// Cards appear at once, drawn from the daily item catalog (name, rarity,
// images, location, price). As they scroll into view, each is then filled in
// with the full tooltip details, a few at a time. Skeleton placeholders stand
// in for whatever is still loading: the list, a card's details, its images.
const ItemListView = (() => {

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

  // "Event Hub" is the game's menu of every event, listed as a location on most
  // seasonal items ("August Seasonal Gear - Event Hub (August)"). It tells you
  // nothing in a list of one event's items, so it's left out of the locations.
  const HIDDEN_LOCATION = /^Event Hub\b(\s*\([^)]*\))?$/i;
  const HIDDEN_LOCATION_PATH = /\/event-hub\/?$/i;

  /** The catalog's locations without Event Hub (and without any left empty). */
  function visibleLocations(locations) {
    const result = [];
    for (const location of locations || []) {
      const names = String(location.name || '').split(' - ');
      const keep = names.map((name) => !HIDDEN_LOCATION.test(name.trim()));
      if (!keep.includes(false)) {
        result.push(location);
        continue;
      }
      if (!keep.includes(true)) continue;
      result.push({
        ...location,
        name: names.filter((_, i) => keep[i]).join(' - '),
        paths: location.paths ? location.paths.filter((_, i) => keep[i]) : location.paths,
      });
    }
    return result;
  }

  /**
   * The same for the full tooltip details read from the item's page: removes the
   * Event Hub links with their " - " separator (and a "(Month)" after them), then
   * any location line or list left empty.
   */
  function removeHiddenLocations(details) {
    if (!details) return;
    const isText = (node) => node && node.nodeType === Node.TEXT_NODE;
    for (const link of details.querySelectorAll('a')) {
      const text = link.textContent.trim();
      const href = link.getAttribute('href') || '';
      if (!HIDDEN_LOCATION.test(text) && !(HIDDEN_LOCATION_PATH.test(href) && /^Event Hub/i.test(text))) continue;
      let next = link.nextSibling;
      if (isText(next)) next.textContent = next.textContent.replace(/^\s*\([^)]*\)/, '');
      const prev = link.previousSibling;
      if (isText(prev) && /\s-\s*$/.test(prev.textContent)) {
        prev.textContent = prev.textContent.replace(/\s-\s*$/, '');
      } else if (isText(next) && /^\s*-\s/.test(next.textContent)) {
        next.textContent = next.textContent.replace(/^\s*-\s/, '');
      }
      const parent = link.parentElement;
      link.remove();
      // A list entry with nothing else in it goes too.
      if (parent && parent.tagName === 'LI' && !parent.textContent.trim()) parent.remove();
      // "Location:" with no location after it.
      if (parent && parent.tagName === 'P') {
        const label = parent.querySelector('strong');
        if (label && /^Locations?:$/.test(label.textContent.trim()) && parent.textContent.trim() === label.textContent.trim()) {
          parent.remove();
        }
      }
    }
    // "Locations:" whose list is now empty (or only "...").
    for (const list of details.querySelectorAll('ul')) {
      const entries = [...list.children].filter((li) => li.textContent.trim() && li.textContent.trim() !== '...');
      if (entries.length) continue;
      const label = list.previousElementSibling;
      if (label && /^Locations?:$/.test(label.textContent.trim())) label.remove();
      list.remove();
    }
  }

  // ---------- filter: AC / Member / neither, and owned items ----------

  // Every list starts with everything shown (every box ticked). The choice is
  // kept (one for all lists) in storage, so the wiki and the desktop app each
  // remember theirs.
  const DEFAULT_FILTER = { ac: true, member: true, neither: true, showOwned: true };
  const FILTER_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>';

  /** A saved filter, with the defaults for anything missing (and the old "hideOwned" switch turned around). */
  function readFilter(saved) {
    const filter = { ...DEFAULT_FILTER, ...(saved || {}) };
    if (saved && saved.showOwned === undefined && saved.hideOwned !== undefined) filter.showOwned = !saved.hideOwned;
    delete filter.hideOwned;
    return filter;
  }

  /** Which of the filter's groups an item is in, from its wiki tags ("legend" is the wiki's Member tag). */
  function itemGroups(item) {
    const tags = item.tags || [];
    const ac = tags.includes('ac');
    const member = tags.includes('legend');
    return { ac, member, neither: !ac && !member };
  }

  /**
   * Whether the filter shows an item: it's in a ticked group (an item tagged both
   * AC and Member shows when either is ticked), and, with "Show owned items"
   * unticked, it isn't owned (matched like the owned checkmarks).
   */
  function passesFilter(item, filter, owned, { ownedApplies = true } = {}) {
    const groups = itemGroups(item);
    if (!((groups.ac && filter.ac) || (groups.member && filter.member) || (groups.neither && filter.neither))) return false;
    if (!filter.showOwned && ownedApplies && owned.size && owned.has(normalizeItemName(item.name))) return false;
    return true;
  }

  /**
   * The filter button and its menu of checkboxes. The button's badge is the
   * number of ticked boxes.
   * @param {(filter) => void} onChange
   * @returns {{element: HTMLElement, set(filter, info): void}}
   */
  function createFilterControl(onChange, { needsInventory } = {}) {
    const root = el('div', 'aqwt-filter');
    const button = el('button', 'aqwt-filter-button');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `${FILTER_ICON}<span class="aqwt-filter-label">Filter</span><span class="aqwt-filter-count"></span>`;

    const menu = el('div', 'aqwt-filter-menu');
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Filter the list');
    menu.innerHTML = `
      <p class="aqwt-filter-heading">Show</p>
      <label class="aqwt-filter-option"><input type="checkbox" name="ac"> <span>AC items</span></label>
      <label class="aqwt-filter-option"><input type="checkbox" name="member"> <span>Member items</span></label>
      <label class="aqwt-filter-option"><input type="checkbox" name="neither"> <span>Neither (free for everyone)</span></label>
      <div class="aqwt-filter-owned">
        <hr class="aqwt-filter-sep">
        <label class="aqwt-filter-option"><input type="checkbox" name="showOwned"> <span>Show owned items</span></label>
        <p class="aqwt-filter-note" hidden></p>
      </div>
      <button type="button" class="aqwt-filter-reset">Show everything</button>`;
    root.append(button, menu);

    let filter = { ...DEFAULT_FILTER };
    const boxes = Object.fromEntries([...menu.querySelectorAll('input')].map((input) => [input.name, input]));
    const ownedSection = menu.querySelector('.aqwt-filter-owned');
    const note = menu.querySelector('.aqwt-filter-note');
    const count = button.querySelector('.aqwt-filter-count');

    function setOpen(open) {
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      root.classList.toggle('is-open', open);
    }

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !root.contains(e.target)) setOpen(false);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        setOpen(false);
        button.focus();
      }
    });
    menu.addEventListener('change', (e) => {
      if (!e.target.name) return;
      onChange({ ...filter, [e.target.name]: e.target.checked });
    });
    menu.querySelector('.aqwt-filter-reset').addEventListener('click', () => onChange({ ...DEFAULT_FILTER }));

    return {
      element: root,
      /** @param {{hasInventory: boolean, ownedList: boolean}} info */
      set(next, { hasInventory, ownedList }) {
        filter = next;
        for (const [name, box] of Object.entries(boxes)) box.checked = Boolean(filter[name]);
        // "Show owned items" isn't offered on the Owned list (they're all owned), and
        // needs a synced inventory to tell owned items apart.
        ownedSection.hidden = ownedList;
        boxes.showOwned.disabled = !hasInventory;
        note.hidden = hasInventory;
        note.textContent = needsInventory || 'Sync your inventory on account.aq.com to use this.';

        const offered = Object.keys(boxes).filter((name) => !(name === 'showOwned' && ownedList));
        const ticked = offered.filter((name) => filter[name]).length;
        count.textContent = ticked;
        root.classList.toggle('is-active', ticked < offered.length);
        button.title = `Filter: ${ticked} of ${offered.length} ticked`;
        button.setAttribute('aria-label', button.title);
      },
    };
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

    const locations = visibleLocations(item.locations);
    if (locations.length) details.append(...locationSection(locations));
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
    removeHiddenLocations(card.querySelector('.aqwt-hover-details'));
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

  /**
   * The list buttons and the results area, ready to be placed on a page.
   * Each call is independent (its own loading queue and observers).
   * @param {{lists?: object[], messages?: {noInventory?: string, needsInventory?: string}}} [options]
   *   the lists to offer (default: ITEM_LISTS), and wording to use instead of the
   *   extension's (the desktop app has no Sync button, for one)
   * @returns {HTMLElement} the .aqwt-lists element
   */
  function create({ lists = ITEM_LISTS, messages = {} } = {}) {
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

    function mount(lists) {
      const wrapper = el('div', 'aqwt-lists');
      wrapper.innerHTML = `
        <div class="aqwt-list-buttons"></div>
        <section class="aqwt-list-results" hidden>
          <div class="aqwt-list-head">
            <p class="aqwt-list-status" role="status"></p>
          </div>
          <div class="aqwt-list-grid"></div>
        </section>`;

      const buttons = wrapper.querySelector('.aqwt-list-buttons');
      for (const list of lists) {
        const button = el('button', 'aqwt-list-button', list.label);
        button.type = 'button';
        button.dataset.list = list.id;
        if (list.title) button.title = list.title;
        if (list.color) button.style.setProperty('--aqwt-list-color', list.color);
        button.setAttribute('aria-expanded', 'false');
        buttons.appendChild(button);
      }

      return {
        wrapper,
        buttons,
        results: wrapper.querySelector('.aqwt-list-results'),
        status: wrapper.querySelector('.aqwt-list-status'),
        grid: wrapper.querySelector('.aqwt-list-grid'),
      };
    }

    const ui = mount(lists);
    let openList = null;
    let requestId = 0;
    let pendingItems = []; // matching items not turned into cards yet
    let shownList = null; // { list, items, updatedAt }: the open list, before filtering
    let filter = { ...DEFAULT_FILTER };
    let owned = new Map();

    const filterControl = createFilterControl((next) => {
      filter = next;
      ext.storage.local.set({ [STORAGE_KEYS.itemListFilter]: filter }).catch(() => {});
      refreshFilter();
    }, { needsInventory: messages.needsInventory });
    // In the results' heading by default; the desktop app moves it beside its list picker.
    ui.wrapper.querySelector('.aqwt-list-head').append(filterControl.element);
    ui.wrapper.filterControl = filterControl.element;

    function refreshFilter() {
      filterControl.set(filter, { hasInventory: owned.size > 0, ownedList: shownList?.list.source === 'inventory' });
      if (shownList) renderList();
    }

    ext.storage.local.get(STORAGE_KEYS.itemListFilter).then((result) => {
      filter = readFilter(result[STORAGE_KEYS.itemListFilter]);
      refreshFilter();
    });
    watchOwnedItems((map) => {
      owned = map;
      refreshFilter();
    });

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
      shownList = null;
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
        ? messages.noInventory || 'No synced inventory yet. Use the Sync button on your account.aq.com Inventory page first.'
        : response.noFarmItems
          ? 'Your farm list is empty. Use "Add to farm list" on an item page or card, or right-click an item link.'
          : null;
      if (emptyMessage) {
        ui.grid.replaceChildren();
        ui.status.textContent = emptyMessage;
        return;
      }

      shownList = { list, items, updatedAt };
      refreshFilter();
    }

    /** The open list's items that pass the filter, as cards, and the count above them. */
    function renderList() {
      const { list, items, updatedAt } = shownList;
      queue.clear();
      cardObserver.disconnect();
      const visible = items.filter((item) => passesFilter(item, filter, owned, { ownedApplies: list.source !== 'inventory' }));

      const updated = formatDate(updatedAt);
      const noun = { inventory: 'owned item', farm: 'item on your farm list' }[list.source] || `${list.label} item`;
      const plural = items.length === 1 ? noun : noun.replace(/item/, 'items');
      const count =
        visible.length === items.length
          ? `${items.length.toLocaleString()} ${plural}`
          : `${visible.length.toLocaleString()} of ${items.length.toLocaleString()} ${plural} shown`;
      ui.status.textContent = count + (updated ? ` · catalog updated ${updated}` : '');

      pendingItems = visible;
      ui.grid.replaceChildren(sentinel);
      if (!visible.length && items.length) ui.grid.replaceChildren(el('p', 'aqwt-list-empty', 'Nothing here matches the filter.'));
      else renderNextBatch();
    }

    ui.buttons.addEventListener('click', (e) => {
      const button = e.target.closest('.aqwt-list-button');
      if (!button) return;
      const list = lists.find((l) => l.id === button.dataset.list);
      if (!list) return;
      if (openList === list.id) {
        requestId++;
        queue.clear();
        shownList = null;
          setOpen(null); // clicking the open list closes it
      } else {
        showList(list);
      }
    });

    return ui.wrapper;
  }

  return { create };
})();
