// Location and map pages: every item you can get there, grouped by shop,
// monster and quest. A location page shows its own items; a map page (like
// Doomwood) shows each location it links to. The data comes from the item
// catalog (background.js, LOCATION_ITEMS).
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

  function itemRow(item) {
    const li = el('li', 'aqwt-location-item');
    li.appendChild(wikiLink(item.url, item.name));
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

  const panel = el('section', 'aqwt-location-items');
  panel.appendChild(el('h2', 'aqwt-location-title', 'Items found here'));
  const status = el('p', 'aqwt-location-status', 'Loading items…');
  status.setAttribute('role', 'status');
  panel.appendChild(status);
  // Before the "Explore this area in our free web game" line if there is one.
  const footer = [...content.children].reverse().find((child) => /in our free web game/i.test(child.textContent));
  content.insertBefore(panel, footer || null);

  const candidates = isLocation ? [{ path: here, name: '' }] : linkedLocations();
  const response = await queryLocationItems(candidates.map((c) => c.path));
  if (!response || response.error) {
    status.textContent = `Couldn't load the items (${response ? response.error : 'the extension background did not respond'}).`;
    return;
  }
  const updated = formatDate(response.updatedAt);
  const updatedNote = updated ? ` · catalog updated ${updated}` : '';

  if (isLocation) {
    const [result] = response.locations;
    if (!result.total || result.skipped) {
      panel.remove(); // nothing listed here, or a hub with hundreds of shop items
      return;
    }
    status.textContent = `${plural(result.total)}${updatedNote}`;
    panel.appendChild(groupedItems(result));
    return;
  }

  // Map page: one foldable section per location with items.
  const shown = response.locations
    .map((result, i) => ({ ...result, name: candidates[i].name }))
    .filter((result) => result.total && !result.skipped);
  if (!shown.length) {
    panel.remove();
    return;
  }
  panel.querySelector('.aqwt-location-title').textContent = 'Items found in these locations';
  const total = new Set(shown.flatMap((result) => result.sources.flatMap((source) => source.items.map((item) => item.url)))).size;
  status.textContent = `${plural(total)} in ${shown.length} ${shown.length === 1 ? 'location' : 'locations'}${updatedNote}`;
  for (const result of shown) {
    const details = el('details', 'aqwt-location-section');
    const summary = el('summary');
    summary.appendChild(wikiLink(result.path, result.name));
    summary.appendChild(el('span', 'aqwt-location-count', ` (${plural(result.total)})`));
    details.appendChild(summary);
    // Built when first opened, a map can link to a lot of locations.
    details.addEventListener('toggle', () => {
      if (details.open && details.childElementCount === 1) details.appendChild(groupedItems(result));
    });
    panel.appendChild(details);
  }
});
