// The item lists: search, filter and cards that look like the tooltip.
// Used on the wiki's Search Items by Tag page and in the desktop app.
//
// Cards show right away from the catalog and get filled in with the full
// details as you scroll to them.
const ItemListView = (() => {

  const MAX_PARALLEL_CARDS = 6;
  const PRELOAD_MARGIN = '800px 0px'; // start filling cards this far before they're visible
  const MAX_LOCATIONS = 3;
  const SKELETON_CARDS = 6;
  const BATCH_SIZE = 60; // more get added as you scroll

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

  // "Event Hub" is on almost every seasonal item and tells you nothing in a
  // list of one event, so we hide it.
  const HIDDEN_LOCATION = /^Event Hub\b(\s*\([^)]*\))?$/i;
  const HIDDEN_LOCATION_PATH = /\/event-hub\/?$/i;

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

  // Same thing for the full details from the item page.
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
      if (parent && parent.tagName === 'LI' && !parent.textContent.trim()) parent.remove();
      if (parent && parent.tagName === 'P') {
        const label = parent.querySelector('strong');
        if (label && /^Locations?:$/.test(label.textContent.trim()) && parent.textContent.trim() === label.textContent.trim()) {
          parent.remove();
        }
      }
    }
    for (const list of details.querySelectorAll('ul')) {
      const entries = [...list.children].filter((li) => li.textContent.trim() && li.textContent.trim() !== '...');
      if (entries.length) continue;
      const label = list.previousElementSibling;
      if (label && /^Locations?:$/.test(label.textContent.trim())) label.remove();
      list.remove();
    }
  }

  const { ITEM_TYPES, WEAPON_TYPES, itemType } = ItemTypes;
  const { listsByTiming, listGroups } = ListTiming;

  // Everything is shown by default. One filter for all lists, saved in storage.
  const DEFAULT_FILTER = { ac: true, member: true, neither: true, showOwned: true, types: [] };
  const FILTER_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>';
  const SEARCH_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.4"/><path d="m16 16 4.2 4.2"/></svg>';

  function readFilter(saved) {
    const filter = { ...DEFAULT_FILTER, ...(saved || {}) };
    if (saved && saved.showOwned === undefined && saved.hideOwned !== undefined) filter.showOwned = !saved.hideOwned;
    delete filter.hideOwned;
    const known = ITEM_TYPES.map((type) => type.id);
    // Old saves: "weapon" means all weapons, handgun and rifle are gun now.
    const RENAMED = { weapon: WEAPON_TYPES, handgun: ['gun'], rifle: ['gun'] };
    const savedTypes = Array.isArray(filter.types) ? filter.types.flatMap((id) => RENAMED[id] || [id]) : [];
    filter.types = [...new Set(savedTypes)].filter((id) => known.includes(id));
    return filter;
  }

  function itemGroups(item) {
    const tags = item.tags || [];
    const ac = tags.includes('ac');
    const member = tags.includes('legend');
    return { ac, member, neither: !ac && !member };
  }

  // Shown if it's in a ticked group (AC/Member/neither), not owned when "Show
  // owned" is off, and one of the ticked types if any are ticked.
  function passesFilter(item, filter, owned, { ownedApplies = true } = {}) {
    const groups = itemGroups(item);
    if (!((groups.ac && filter.ac) || (groups.member && filter.member) || (groups.neither && filter.neither))) return false;
    if (!filter.showOwned && ownedApplies && owned.size && owned.has(normalizeItemName(item.name))) return false;
    if (filter.types.length && !filter.types.includes(itemType(item))) return false;
    return true;
  }

  function listOption(list) {
    const label = el('label', 'aqwt-filter-option');
    const input = el('input');
    input.type = 'checkbox';
    input.name = 'list';
    input.value = list.id;
    const dot = el('span', 'aqwt-filter-list-dot');
    if (list.color) dot.style.setProperty('--aqwt-list-color', list.color);
    label.append(input, dot, el('span', null, list.label));
    if (list.title) label.title = list.title;
    return label;
  }

  // The filter button and its menu. Lists to show first, then the filter.
  // The badge counts how many filters are in use.
  function createFilterControl(onChange, { needsInventory, lists = [], onListsChange = () => {} } = {}) {
    const root = el('div', 'aqwt-filter');
    const button = el('button', 'aqwt-filter-button');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `${FILTER_ICON}<span class="aqwt-filter-count" hidden></span>`;
    const typeOption = (type) =>
      `<label class="aqwt-filter-option"><input type="checkbox" name="type" value="${type.id}">` +
      `<img class="aqwt-filter-type-icon" src="${ext.runtime.getURL(`icons/${type.icon}`)}" alt="" draggable="false">` +
      `<span>${type.label}</span></label>`;
    // "Weapons" toggles all weapon types. Shows a dash when only some are ticked.
    const typeOptions =
      `<label class="aqwt-filter-option aqwt-filter-type-group"><input type="checkbox" name="type-group" value="weapon"> <span>Weapons</span></label>` +
      `<div class="aqwt-filter-types aqwt-filter-weapon-types">${ITEM_TYPES.filter((type) => type.weapon).map(typeOption).join('')}</div>` +
      `<div class="aqwt-filter-types">${ITEM_TYPES.filter((type) => !type.weapon).map(typeOption).join('')}</div>`;

    const menu = el('div', 'aqwt-filter-menu');
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Filter the list');
    menu.innerHTML = `
      <div class="aqwt-filter-column aqwt-filter-lists-column">
        <p class="aqwt-filter-heading">Lists <span class="aqwt-filter-subhead">tick several to see them together</span></p>
      </div>
      <div class="aqwt-filter-column">
      <p class="aqwt-filter-heading">Show</p>
      <label class="aqwt-filter-option"><input type="checkbox" name="ac"> <span>AC items</span></label>
      <label class="aqwt-filter-option"><input type="checkbox" name="member"> <span>Member items</span></label>
      <label class="aqwt-filter-option"><input type="checkbox" name="neither"> <span>Neither (free for everyone)</span></label>
      <div class="aqwt-filter-owned">
        <hr class="aqwt-filter-sep">
        <label class="aqwt-filter-option"><input type="checkbox" name="showOwned"> <span>Show owned items</span></label>
        <p class="aqwt-filter-note" hidden></p>
      </div>
      <hr class="aqwt-filter-sep">
      <p class="aqwt-filter-heading">Type <span class="aqwt-filter-subhead">none ticked: every type</span></p>
      ${typeOptions}
      <button type="button" class="aqwt-filter-reset">Show everything</button>
      </div>`;
    const listsColumn = menu.querySelector('.aqwt-filter-lists-column');
    for (const [title, group] of listGroups(lists)) {
      const grid = el('div', 'aqwt-filter-lists');
      grid.append(...group.map(listOption));
      listsColumn.append(el('p', 'aqwt-filter-group', title), grid);
    }
    listsColumn.hidden = lists.length < 2;
    root.append(button, menu);

    let filter = { ...DEFAULT_FILTER };
    const boxes = Object.fromEntries(
      [...menu.querySelectorAll('input:not([name="type"]):not([name="type-group"]):not([name="list"])')].map((input) => [input.name, input])
    );
    const typeBoxes = [...menu.querySelectorAll('input[name="type"]')];
    const weaponsBox = menu.querySelector('input[name="type-group"]');
    const listBoxes = [...menu.querySelectorAll('input[name="list"]')];
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
      if (e.target.name === 'list') {
        onListsChange(listBoxes.filter((box) => box.checked).map((box) => box.value));
      } else if (e.target.name === 'type-group') {
        const others = filter.types.filter((id) => !WEAPON_TYPES.includes(id));
        onChange({ ...filter, types: e.target.checked ? [...WEAPON_TYPES, ...others] : others });
      } else if (e.target.name === 'type') {
        onChange({ ...filter, types: typeBoxes.filter((box) => box.checked).map((box) => box.value) });
      } else if (e.target.name) {
        onChange({ ...filter, [e.target.name]: e.target.checked });
      }
    });
    menu.querySelector('.aqwt-filter-reset').addEventListener('click', () => onChange({ ...DEFAULT_FILTER }));

    return {
      element: root,
      open() {
        setOpen(true);
        menu.querySelector('input')?.focus();
      },
      set(next, { hasInventory, ownedList, selectedLists = [] }) {
        filter = next;
        for (const box of listBoxes) box.checked = selectedLists.includes(box.value);
        for (const [name, box] of Object.entries(boxes)) box.checked = Boolean(filter[name]);
        // No "Show owned" on the Owned list, and it needs a synced inventory.
        ownedSection.hidden = ownedList;
        boxes.showOwned.disabled = !hasInventory;
        note.hidden = hasInventory;
        note.textContent = needsInventory || 'Sync your inventory on account.aq.com to use this.';

        for (const box of typeBoxes) box.checked = filter.types.includes(box.value);
        const weaponsTicked = WEAPON_TYPES.filter((id) => filter.types.includes(id)).length;
        weaponsBox.checked = weaponsTicked === WEAPON_TYPES.length;
        weaponsBox.indeterminate = weaponsTicked > 0 && !weaponsBox.checked;

        const offered = Object.keys(boxes).filter((name) => !(name === 'showOwned' && ownedList));
        // All weapon types ticked counts as one filter, not thirteen.
        const typesInUse = filter.types.length - (weaponsBox.checked ? WEAPON_TYPES.length - 1 : 0);
        const inUse = offered.filter((name) => !filter[name]).length + typesInUse;
        count.textContent = inUse;
        count.hidden = !inUse;
        root.classList.toggle('is-active', inUse > 0);
        button.title = inUse ? `Filter: ${inUse} in use` : 'Filter';
        button.setAttribute('aria-label', button.title);
      },
    };
  }

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

  // Same shape ItemPreview.fill makes, from what the catalog already has.
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

  function skeletonCard() {
    const card = el('div', 'aqwt-card aqwt-list-card aqwt-skeleton-card');
    card.setAttribute('aria-hidden', 'true');
    const details = el('div', 'aqwt-hover-details');
    details.append(skeletonLines(['65%']), skeletonLines(['90%', '80%', '55%']), skeletonLines(['70%', '40%']));
    card.append(el('div', 'aqwt-skeleton aqwt-skeleton-image'), details);
    return card;
  }

  // Shimmer until an image loads or they all fail.
  function watchImages(card) {
    const row = card.querySelector('.aqwt-tooltip-images');
    if (!row) return;
    const loaded = () => row.classList.remove('is-loading');
    if ([...row.querySelectorAll('img')].some((img) => img.complete && img.naturalWidth > 0)) return;

    row.classList.add('is-loading');
    row.addEventListener('load', loaded, { capture: true, once: true });
    row.addEventListener(
      'error',
      // ItemPreview.fill removes the broken image after this runs.
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
    if (Features.isOn('itemButtons') && TryOnButtons.isWearable(tags)) {
      actions.appendChild(TryOnButtons.create({ name: item.name, compact: true }));
    }
    if (Features.isOn('itemButtons')) {
      actions.appendChild(
        FarmButtons.create({ url: item.url, compact: true, buildEntry: () => FarmEntry.build(item.url, item.name) })
      );
    }
    if (actions.childElementCount) card.appendChild(actions);
  }

  function createCard(item) {
    const card = el('div', 'aqwt-card aqwt-list-card');

    fillCard(card, catalogPreview(item), item);

    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-expanded', 'false');

    // Only one card open at a time.
    const toggleExpanded = () => {
      const expanded = !card.classList.contains('is-expanded');
      if (expanded) {
        card.parentElement?.querySelectorAll('.aqwt-list-card.is-expanded').forEach((other) => {
          other.classList.remove('is-expanded');
          other.setAttribute('aria-expanded', 'false');
        });
      }
      card.classList.toggle('is-expanded', expanded);
      card.setAttribute('aria-expanded', String(expanded));
    };

    card.addEventListener('click', (event) => {
      // Clicking a link or button inside shouldn't expand it.
      if (
        event.target.closest(
          'a, button, input, select, textarea, label'
        )
      ) {
        return;
      }

      toggleExpanded();
    });

    card.addEventListener('keydown', (event) => {
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        !event.target.closest(
          'a, button, input, select, textarea, label'
        )
      ) {
        event.preventDefault();
        toggleExpanded();
      }
    });

    card.querySelector('.aqwt-hover-details')
      ?.appendChild(skeletonLines(['85%', '70%', '50%']));

    return card;
  }

  /**
   * Search, filter and results, ready to put on a page. Opens the lists from
   * last time, or the events on now the first time.
   * messages lets the desktop app use its own wording (it has no Sync button).
   */
  function create({ lists = ITEM_LISTS, messages = {} } = {}) {
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
        <section class="aqwt-list-results">
          <div class="aqwt-list-head">
            <div class="aqwt-list-tools">
              <label class="aqwt-list-search-field">
                ${SEARCH_ICON}
                <span class="aqwt-visually-hidden">Search this list</span>
                <input class="aqwt-list-search" type="search" placeholder="Search this list" autocomplete="off" spellcheck="false">
              </label>
            </div>
            <p class="aqwt-list-status" role="status"></p>
          </div>
          <div class="aqwt-list-grid"></div>
        </section>`;

      return {
        wrapper,
        results: wrapper.querySelector('.aqwt-list-results'),
        status: wrapper.querySelector('.aqwt-list-status'),
        tools: wrapper.querySelector('.aqwt-list-tools'),
        search: wrapper.querySelector('.aqwt-list-search'),
        grid: wrapper.querySelector('.aqwt-list-grid'),
      };
    }

    const ui = mount();

    let selected = [];
    let requestId = 0;
    let pendingItems = [];
    let shown = null; // { lists, items, updatedAt, notes }: the selected lists' items, before filtering
    let filter = { ...DEFAULT_FILTER };
    let owned = new Map();

    let searchText = '';

    ui.search.addEventListener('input', () => {
      searchText = ui.search.value.trim().toLocaleLowerCase();
      if (shown) renderList();
    });

    const filterControl = createFilterControl(
      (next) => {
        filter = next;
        ext.storage.local.set({ [STORAGE_KEYS.itemListFilter]: filter }).catch(() => {});
        refreshFilter();
      },
      { needsInventory: messages.needsInventory, lists, onListsChange: (ids) => select(ids) }
    );
    ui.tools.append(filterControl.element);

    // The Owned list is all owned, so "Show owned" doesn't apply there.
    const showsInventory = () => selected.some((id) => lists.find((list) => list.id === id)?.source === 'inventory');

    function refreshFilter() {
      filterControl.set(filter, { hasInventory: owned.size > 0, ownedList: showsInventory(), selectedLists: selected });
      if (shown) renderList();
    }

    ext.storage.local.get(STORAGE_KEYS.itemListFilter).then((result) => {
      filter = readFilter(result[STORAGE_KEYS.itemListFilter]);
      refreshFilter();
    });
    watchOwnedItems((map) => {
      owned = map;
      refreshFilter();
    });

    // When this marker gets close to the screen we add the next batch.
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

    function formatDate(iso) {
      return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
    }

    function emptyReason(list, response) {
      if (!response || response.error) {
        const reason = response ? response.error : 'the extension background did not respond';
        return { long: `Couldn't load the ${list.label} list (${reason}).`, short: `${list.label} couldn't load` };
      }
      if (response.noInventory) {
        return {
          long: messages.noInventory || 'No synced inventory yet. Use the Sync button on your account.aq.com Inventory page first.',
          short: 'no synced inventory yet',
        };
      }
      if (response.noFarmItems) {
        return {
          long: 'Your farm list is empty. Use "Add to farm list" on an item page or card, or right-click an item link.',
          short: 'your farm list is empty',
        };
      }
      return null;
    }

    // Shows these lists together and remembers them. Fires "aqwt-lists-change"
    // so the desktop dropdown can follow along.
    function select(ids, { remember = true } = {}) {
      const next = lists.filter((list) => ids.includes(list.id)).map((list) => list.id);
      if (shown && next.join() === selected.join()) return;
      selected = next;
      if (remember) ext.storage.local.set({ [STORAGE_KEYS.itemListSelection]: selected }).catch(() => {});
      ui.wrapper.dispatchEvent(new CustomEvent('aqwt-lists-change', { detail: { ids: [...selected] } }));
      load();
    }

    function showChooser() {
      const box = el('div', 'aqwt-list-empty aqwt-list-choose');
      const button = el('button', 'aqwt-list-choose-button', 'Choose lists');
      button.type = 'button';
      button.addEventListener('click', (e) => {
        e.stopPropagation(); // or the menu's "click outside" closes it again
        filterControl.open();
      });
      box.append(el('span', null, 'No list chosen yet.'), button);
      ui.grid.replaceChildren(box);
      ui.status.textContent = 'Choose one or more lists with the filter button.';
    }

    async function load() {
      const myRequest = ++requestId; // ignore answers for lists that aren't selected anymore
      queue.clear();
      cardObserver.disconnect();
      pendingItems = [];
      shown = null;
      refreshFilter();
      if (!selected.length) {
        showChooser();
        return;
      }
      ui.grid.replaceChildren(...Array.from({ length: SKELETON_CARDS }, skeletonCard));
      ui.grid.setAttribute('aria-busy', 'true');
      ui.status.textContent = selected.length === 1 ? 'Loading list…' : 'Loading lists…';

      const chosen = lists.filter((list) => selected.includes(list.id));
      const responses = await Promise.all(chosen.map((list) => queryItemCatalog(list.filter || {}, list.source || 'catalog')));
      if (myRequest !== requestId) return;
      ui.grid.removeAttribute('aria-busy');

      const items = [];
      const seen = new Set();
      const notes = [];
      let updatedAt = null;
      chosen.forEach((list, i) => {
        const response = responses[i];
        const reason = emptyReason(list, response);
        if (reason) {
          notes.push(chosen.length === 1 ? reason.long : reason.short);
          if (!response || response.error) return;
        }
        updatedAt = updatedAt || response.updatedAt;
        for (const item of response.items || []) {
          const key = String(item.url).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
        }
      });
      // One list keeps its own order (farm list), several get sorted by name.
      if (chosen.length > 1) items.sort((a, b) => String(a.name).localeCompare(String(b.name)));

      shown = { lists: chosen, items, updatedAt, notes };
      refreshFilter();
    }

    function renderList() {
      const { lists: chosen, items, updatedAt, notes } = shown;
      queue.clear();
      cardObserver.disconnect();

      if (!items.length) {
        ui.grid.replaceChildren();
        ui.status.textContent = notes.join(' ') || 'Nothing in this list.';
        return;
      }

      const ownedApplies = !showsInventory();
      const visible = items.filter(
        (item) =>
          passesFilter(item, filter, owned, { ownedApplies }) &&
          (!searchText || String(item.name || '').toLocaleLowerCase().includes(searchText))
      );
      const updated = formatDate(updatedAt);
      const single = chosen.length === 1 ? chosen[0] : null;
      const noun = single ? { inventory: 'owned item', farm: 'item on your farm list' }[single.source] || `${single.label} item` : 'item';
      const plural = items.length === 1 ? noun : noun.replace(/item/, 'items');
      const from = single ? '' : ` from ${chosen.length} lists`;
      const count =
        visible.length === items.length
          ? `${items.length.toLocaleString()} ${plural}${from}`
          : `${visible.length.toLocaleString()} of ${items.length.toLocaleString()} ${plural}${from} shown`;
      ui.status.textContent = [count + (updated ? ` · catalog updated ${updated}` : ''), ...notes].join(' · ');

      pendingItems = visible;
      ui.grid.replaceChildren(sentinel);
      if (!visible.length) {
        const message = searchText ? 'Nothing here matches the search and filter.' : 'Nothing here matches the filter.';
        ui.grid.replaceChildren(el('p', 'aqwt-list-empty', message));
      } else {
        renderNextBatch();
      }
    }

    // Lists from last time, or what's on now the first time.
    ext.storage.local
      .get(STORAGE_KEYS.itemListSelection)
      .catch(() => ({}))
      .then((result) => {
        const saved = result[STORAGE_KEYS.itemListSelection];
        if (Array.isArray(saved)) select(saved, { remember: false });
        else select(listsByTiming(lists).now.map((list) => list.id), { remember: false });
      });

    // Lets the desktop app pick lists and reload them.
    ui.wrapper.lists = {
      select,
      selected: () => [...selected],
      refresh: () => selected.length && load(),
    };

    return ui.wrapper;
  }

  return { create };
})();
