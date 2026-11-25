// Location and map pages: an "Items:" line above the screen pictures that opens
// every item you can get there, grouped by shop, monster and quest. A location
// page shows its own items; a map page (like Doomwood) shows each location it
// links to. The data comes from the item catalog (background.js, LOCATION_ITEMS).
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

  function itemRow(item) {
    const li = el('li', 'aqwt-location-item');
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
      heading.appendChild(el('span', 'aqwt-location-count', ` (${source.items.length})`));
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
    return wrap;
  }

  const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null);
  const plural = (n) => `${n.toLocaleString()} ${n === 1 ? 'item' : 'items'}`;

  // Right above the screen pictures, so it reads like "Map Name:" and "Room
  // Limit:". Map pages have their pictures in "New / Old" blocks.
  function placeLine(line) {
    const pictures = content.querySelector(':scope > .yui-navset, :scope > .collapsible-block');
    if (pictures) return content.insertBefore(line, pictures);
    const footer = [...content.children].reverse().find((child) => /in our free web game/i.test(child.textContent));
    content.insertBefore(line, footer || null);
  }

  const candidates = isLocation ? [{ path: here, name: '' }] : linkedLocations();
  const response = await queryLocationItems(candidates.map((c) => c.path));
  if (!response || response.error) return;

  // Location page: its own items. Map page: each location it links to.
  // Nothing listed, or a hub with hundreds of shop items: no line at all.
  const shown = response.locations
    .map((result, i) => ({ ...result, name: candidates[i].name }))
    .filter((result) => result.total && !result.skipped);
  if (!shown.length) return;

  const total = new Set(shown.flatMap((result) => result.sources.flatMap((source) => source.items.map((item) => item.url)))).size;
  const label = isLocation ? plural(total) : `${plural(total)} from ${shown.length} ${shown.length === 1 ? 'location' : 'locations'}`;

  const line = el('p', 'aqwt-location-line');
  const toggle = el('a', 'aqwt-location-toggle');
  toggle.href = '#';
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.dataset.aqwtNoTooltip = '';
  line.append(el('strong', null, 'Items:'), ' ', toggle);

  const panel = el('div', 'aqwt-location-items');
  panel.hidden = true;
  panel.id = 'aqwt-location-items';
  toggle.setAttribute('aria-controls', panel.id);

  // Built on first open, a map can link to a lot of locations.
  function build() {
    const updated = formatDate(response.updatedAt);
    if (updated) panel.appendChild(el('p', 'aqwt-location-status', `Catalog updated ${updated}`));
    if (isLocation) {
      panel.appendChild(groupedItems(shown[0]));
      return;
    }
    for (const result of shown) {
      const details = el('details', 'aqwt-location-section');
      const summary = el('summary');
      summary.append(wikiLink(result.path, result.name), el('span', 'aqwt-location-count', ` (${plural(result.total)})`));
      details.appendChild(summary);
      details.addEventListener('toggle', () => {
        if (details.open && details.childElementCount === 1) details.appendChild(groupedItems(result));
      });
      panel.appendChild(details);
    }
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

  placeLine(line);
  line.after(panel);
});
