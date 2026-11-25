// Location and map pages: an "Items:" line (before Access Points, or above the
// pictures on map pages) that opens every item you can get there, grouped by
// shop, monster and quest, with filters, owned checkmarks and a 0 AC counter.
// A location page shows its own items; a map page (like Doomwood) shows each
// location it links to. The data comes from the item catalog (background.js,
// LOCATION_ITEMS).
Features.run('locationItems', async () => {
  const content = document.querySelector('#page-content');
  if (!content) return;
  const tags = [...document.querySelectorAll('.page-tags a')].map((a) => a.textContent.trim().toLowerCase());
  const isLocation = tags.includes('location');
  const isMap = !isLocation && tags.includes('map');
  if (!isLocation && !isMap) return;

  const KIND_LABELS = { shop: 'Shops and merges', drop: 'Monster drops', quest: 'Quest rewards', other: 'Other' };
  const here = wikiPathOf(location.href);

  // Map pages: the locations they link to, in page order. The background tells
  // us which of them have items.
  function linkedLocations() {
    const seen = new Set();
    const found = [];
    for (const link of content.querySelectorAll('a[href]')) {
      const path = wikiPathOf(link.href);
      if (!path || path === here || path.includes(':') || seen.has(path)) continue;
      seen.add(path);
      found.push({ path, name: link.textContent.trim() || path });
    }
    return found;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function wikiLink(url, text) {
    const link = el('a', null, text);
    link.href = new URL(url, WIKI_ORIGIN).href;
    return link;
  }

  // The same type icons as the item lists' filter. Untyped items get the misc one.
  const TYPES = Object.fromEntries(ItemTypes.ITEM_TYPES.map((type) => [type.id, type]));
  function typeIcon(item) {
    const type = TYPES[ItemTypes.itemType(item)] || TYPES.misc;
    const icon = el('img', 'aqwt-location-type-icon');
    icon.src = ext.runtime.getURL(`icons/${type.icon}`);
    icon.alt = type.label;
    icon.title = type.label;
    icon.draggable = false;
    return icon;
  }

  // "Show only" filters. Ticking several shows items matching any of them.
  //   member  Member only (tagged legend)
  //   zeroAc  tagged 0ac, so it can go in the bank for free
  //   acShop  bought for AC in a shop ("350 AC"), not merged or dropped
  const FILTERS = [
    { id: 'member', label: 'Member', test: (item) => item.tags.includes('legend') },
    { id: 'zeroAc', label: '0 AC', test: (item) => item.tags.includes('0ac') },
    { id: 'acShop', label: 'Bought with AC', test: (item) => /\b[1-9][\d,]*\s*AC\b/i.test(item.price || '') },
  ];
  // The 0 AC counter: free-to-bank gear you farm, so 0 AC tagged drops, quest
  // rewards and merge items. Not Rare ones, not misc items (or untyped ones,
  // which get the misc icon), and nothing with a price: "0 AC" collection chest
  // buys, AC shop items and Gold shop items are left out. Items only listed
  // under "Other" are left out too (see zeroAcItems).
  const countsForBar = (item) =>
    item.tags.includes('0ac') &&
    item.rarity !== 'rare' &&
    !['misc', null].includes(ItemTypes.itemType(item)) &&
    !/\b[\d,]+\s*(AC|Gold)\b/i.test(item.price || '');
  const ticked = new Set();
  let owned = new Map();
  const isOwned = (item) => owned.has(normalizeItemName(item.name));
  const passes = (item) => !ticked.size || FILTERS.some((filter) => ticked.has(filter.id) && filter.test(item));

  function itemRow(item) {
    const li = el('li', 'aqwt-location-item');
    li.aqwtItem = item;
    li.append(typeIcon(item), wikiLink(item.url, item.name));
    if (item.rarity && typeof RARITY_LABELS !== 'undefined' && RARITY_LABELS[item.rarity]) li.appendChild(createRarityBadge(item.rarity));
    return li;
  }

  function sourceBlock(source) {
    const block = el('div', 'aqwt-location-source');
    // "Other" items have no shop, monster or quest to name.
    if (source.name) {
      const heading = el('p', 'aqwt-location-source-name');
      if (source.path) heading.appendChild(wikiLink(source.path, source.name));
      else heading.textContent = source.name;
      heading.appendChild(el('span', 'aqwt-location-count'));
      block.appendChild(heading);
    }
    const list = el('ul', 'aqwt-location-list');
    list.append(...source.items.map(itemRow));
    block.appendChild(list);
    return block;
  }

  function groupedItems(result) {
    const wrap = el('div', 'aqwt-location-groups');
    for (const kind of Object.keys(KIND_LABELS)) {
      const sources = result.sources.filter((source) => source.kind === kind);
      if (!sources.length) continue;
      const group = el('div', 'aqwt-location-group');
      group.appendChild(el('p', 'aqwt-location-kind', KIND_LABELS[kind]));
      group.append(...sources.map(sourceBlock));
      wrap.appendChild(group);
    }
    wrap.appendChild(el('p', 'aqwt-location-none', 'Nothing here matches the filter.'));
    return wrap;
  }

  const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null);
  const plural = (n) => `${n.toLocaleString()} ${n === 1 ? 'item' : 'items'}`;

  const candidates = isLocation ? [{ path: here, name: '' }] : linkedLocations();
  const response = await queryLocationItems(candidates.map((c) => c.path));
  if (!response || response.error) return;

  // Location page: its own items. Map page: each location it links to.
  // Nothing listed, or a hub with hundreds of shop items: no line at all.
  const shown = response.locations
    .map((result, i) => ({ ...result, name: candidates[i].name }))
    .filter((result) => result.total && !result.skipped);
  if (!shown.length) return;

  const allItems = [...new Map(shown.flatMap((result) => result.sources.flatMap((source) => source.items)).map((item) => [item.url, item])).values()];
  const fromShopDropOrQuest = new Set(
    shown.flatMap((result) => result.sources.filter((source) => source.kind !== 'other').flatMap((source) => source.items.map((item) => item.url)))
  );
  const zeroAcItems = allItems.filter((item) => fromShopDropOrQuest.has(item.url) && countsForBar(item));
  const label = isLocation ? plural(allItems.length) : `${plural(allItems.length)} from ${shown.length} ${shown.length === 1 ? 'location' : 'locations'}`;

  const toggle = el('a', 'aqwt-location-toggle');
  toggle.href = '#';
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.dataset.aqwtNoTooltip = '';

  const panel = el('div', 'aqwt-location-items');
  panel.hidden = true;
  panel.id = 'aqwt-location-items';
  toggle.setAttribute('aria-controls', panel.id);

  // Like the collection chests counter: how many of those 0 AC items you own.
  const counter = el('div', 'aqwt-collection-counter aqwt-location-counter');
  counter.innerHTML = '<div class="aqwt-collection-counter-text" role="status"></div><div class="aqwt-collection-counter-bar"><span></span></div>';

  function updateCounter() {
    const text = counter.querySelector('.aqwt-collection-counter-text');
    const fill = counter.querySelector('.aqwt-collection-counter-bar span');
    counter.hidden = !zeroAcItems.length;
    if (!owned.size) {
      text.textContent = 'Sync your inventory on account.aq.com to see which of the 0 AC drop, merge and quest items here you own.';
      fill.style.width = '0%';
      return;
    }
    const have = zeroAcItems.filter(isOwned).length;
    const percent = Math.round((have / zeroAcItems.length) * 100);
    text.innerHTML = `You own <strong>${have}</strong> of <strong>${zeroAcItems.length}</strong> 0 AC drop, merge and quest items here (${percent}%)`;
    fill.style.width = `${percent}%`;
  }

  function filterBar() {
    const bar = el('div', 'aqwt-calc-filters aqwt-location-filters');
    bar.appendChild(el('span', 'aqwt-calc-filters-label', 'Show only:'));
    for (const filter of FILTERS) {
      const option = el('label', 'aqwt-calc-filter-opt');
      const input = el('input', 'aqwt-hidden-toggle');
      input.type = 'checkbox';
      const icon = el('span', 'aqwt-checkbox-icon');
      input.addEventListener('change', () => {
        if (input.checked) ticked.add(filter.id);
        else ticked.delete(filter.id);
        icon.classList.toggle('is-checked', input.checked);
        applyView();
      });
      option.append(input, icon, el('span', null, filter.label));
      bar.appendChild(option);
    }
    return bar;
  }

  // Owned checkmarks and the filter, on everything built so far. Empty shops,
  // groups and locations hide, and the counts follow the filter.
  function applyView() {
    for (const li of panel.querySelectorAll('.aqwt-location-item')) {
      const item = li.aqwtItem;
      li.hidden = !passes(item);
      const mark = li.querySelector('.aqwt-location-owned');
      if (isOwned(item) && !mark) {
        const check = el('span', 'aqwt-location-owned');
        check.title = 'In your inventory';
        check.setAttribute('aria-label', check.title);
        li.querySelector('a').after(check);
      } else if (!isOwned(item) && mark) {
        mark.remove();
      }
    }
    const visibleIn = (node) => node.querySelectorAll('.aqwt-location-item:not([hidden])').length;
    for (const block of panel.querySelectorAll('.aqwt-location-source')) {
      const count = visibleIn(block);
      block.hidden = !count;
      const counted = block.querySelector('.aqwt-location-count');
      if (counted) counted.textContent = ` (${count})`;
    }
    for (const group of panel.querySelectorAll('.aqwt-location-group')) group.hidden = !visibleIn(group);
    for (const groups of panel.querySelectorAll('.aqwt-location-groups')) groups.querySelector('.aqwt-location-none').hidden = Boolean(visibleIn(groups));
    for (const section of panel.querySelectorAll('.aqwt-location-section')) {
      const items = section.aqwtResult.sources.flatMap((source) => source.items);
      const count = new Set(items.filter(passes).map((item) => item.url)).size;
      section.hidden = !count;
      section.querySelector('summary .aqwt-location-count').textContent = ` (${plural(count)})`;
    }
    updateCounter();
  }

  // Built on first open, a map can link to a lot of locations.
  function build() {
    panel.append(counter, filterBar());
    if (isLocation) {
      panel.appendChild(groupedItems(shown[0]));
    } else {
      for (const result of shown) {
        const details = el('details', 'aqwt-location-section');
        details.aqwtResult = result;
        const summary = el('summary');
        summary.append(wikiLink(result.path, result.name), el('span', 'aqwt-location-count'));
        details.appendChild(summary);
        details.addEventListener('toggle', () => {
          if (details.open && details.childElementCount === 1) {
            details.appendChild(groupedItems(result));
            applyView();
          }
        });
        panel.appendChild(details);
      }
    }
    const updated = formatDate(response.updatedAt);
    if (updated) panel.appendChild(el('p', 'aqwt-location-status', `Catalog updated ${updated}`));
    applyView();
  }

  function setOpen(open) {
    if (open && !panel.childElementCount) build();
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = `${open ? '- Hide' : '+ Show'} ${label}`;
  }
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    setOpen(panel.hidden);
  });
  setOpen(false);

  watchOwnedItems((map) => {
    owned = map;
    if (panel.childElementCount) applyView();
  });

  // Location pages: in the "Map Name / Room Limit / Access Points" paragraph,
  // right before Access Points. The paragraph gets split there so the list can
  // open in between.
  const accessLabel = [...content.querySelectorAll(':scope > p > strong')].find((strong) => /^Access Points:?$/i.test(strong.textContent.trim()));
  if (accessLabel) {
    const info = accessLabel.parentElement;
    const rest = el('p', 'aqwt-location-after');
    let node = accessLabel;
    while (node) {
      const next = node.nextSibling;
      rest.appendChild(node);
      node = next;
    }
    info.classList.add('aqwt-location-before');
    info.append(el('strong', null, 'Items:'), ' ', toggle);
    info.after(panel, rest);
    return;
  }

  // Map pages: its own line above the pictures ("New / Old" blocks).
  const line = el('p', 'aqwt-location-line');
  line.append(el('strong', null, 'Items:'), ' ', toggle);
  const pictures = content.querySelector(':scope > .yui-navset, :scope > .collapsible-block');
  const footer = [...content.children].reverse().find((child) => /in our free web game/i.test(child.textContent));
  content.insertBefore(line, pictures || footer || null);
  line.after(panel);
});
