// The farm list: drawing it, checking off, removing, the image preview and the scroll hint.
const FarmList = (() => {
  const HOVER_DELAY_MS = 350;
  const CURSOR_OFFSET = 16;

  const TYPE_ICONS = {
    armor: 'armor.png',
    sword: 'aqwsword.png',
    staff: 'aqwstaff.png',
    wand: 'aqwwand.png',
    dagger: 'aqwdagger.png',
    axe: 'Axe.png',
    mace: 'Mace.png',
    bow: 'bow.png',
    polearm: 'spear.png',
    item: 'item.png',
    class: 'class.webp',
    helm: 'helm.webp',
    cape: 'cape.webp',
    pet: 'petaqw.png',
    house: 'aqwhouse.png',
    ground: 'ground.png',
    wall: 'aqwwall.png',
    whip: 'aqwwhip.png',
    handgun: 'aqwgun.png',
    rifle: 'aqwgun.png',
    gauntlet: 'aqwgauntlet.png',

  };

  const iconUrl = (file) => ext.runtime.getURL(`icons/${file}`);

  let items = [];
  let hoverTimer = null;
  let mouse = { x: 0, y: 0 };
  let previewEl = null;

  function getPreview() {
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.className = 'lip-hover-tooltip';
      document.body.appendChild(previewEl);
    }
    return previewEl;
  }

  function positionPreview() {
    const preview = getPreview();
    const rect = preview.getBoundingClientRect();

    let left = mouse.x + CURSOR_OFFSET;
    if (left + rect.width > document.documentElement.clientWidth) left = mouse.x - rect.width - CURSOR_OFFSET;
    const top = Math.max(4, mouse.y - CURSOR_OFFSET - rect.height);

    preview.style.left = `${Math.max(4, left)}px`;
    preview.style.top = `${top}px`;
  }

  function showPreview(urls) {
    const preview = getPreview();
    preview.replaceChildren(
      ...urls.map((src) => {
        const img = document.createElement('img');
        img.alt = '';
        img.onload = positionPreview;
        if (ImageProxy.isActive() && ImageProxy.isImgur(src)) {
          ImageProxy.useProxy(img, src, null, () => img.remove());
        } else {
          img.onerror = () => img.remove();
          img.src = src;
        }
        return img;
      })
    );
    preview.classList.add('visible');
    positionPreview();
  }

  function hidePreview() {
    clearTimeout(hoverTimer);
    if (previewEl) previewEl.classList.remove('visible');
  }

  function attachPreview(row, urls) {
    if (!urls.length) return;
    row.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showPreview(urls), HOVER_DELAY_MS);
    });
    row.addEventListener('mousemove', (e) => {
      mouse = { x: e.clientX, y: e.clientY };
      if (previewEl && previewEl.classList.contains('visible')) positionPreview();
    });
    row.addEventListener('mouseleave', hidePreview);
  }

  // Older entries kept images under wikiInfo.
  function previewUrlsFor(item) {
    if (Array.isArray(item.image) && item.image.length) return item.image;
    if (typeof item.image === 'string' && item.image) return [item.image];
    if (item.wikiInfo && Array.isArray(item.wikiInfo.images)) return item.wikiInfo.images;
    return [];
  }

  function updateScrollHint() {
    const list = document.getElementById('list');
    const hasMoreBelow = list.scrollHeight - list.clientHeight - list.scrollTop > 4;
    document.querySelector('.farm-list .lip-scroll-indicator').classList.toggle('visible', hasMoreBelow);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function priceIcon(price) {
    if (price.includes('Gold')) return iconUrl('goldshop.png');
    if (price.includes('AC')) return iconUrl('AC.png');
    return iconUrl('item.png');
  }

  function createLocation(location) {
    const [place, detail] = location.name.split(' - ');
    const wrap = el('div', 'location');

    const icon = el('img');
    icon.src = iconUrl('map.png');
    icon.alt = '';

    const link = el('a', null, detail ? `${place} (${detail})` : place);
    link.href = new URL(location.hrefs[0] || '/', WIKI_ORIGIN).href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    wrap.append(icon, link);
    return wrap;
  }

  function createPrice(price) {
    const wrap = el('div', 'price');
    const icon = el('img');
    icon.src = priceIcon(price);
    icon.alt = '';
    wrap.append(icon, el('p', null, price === 'N/A' ? 'Merge these:' : `Buy for: ${price}`));
    return wrap;
  }

  function createItem(item) {
    const li = el('li', 'lip-popup-item');
    li.classList.toggle('checked', !!item.checked);

    const row = el('div', 'lip-popup-row');

    const check = el('button', 'checkbox-icon');
    check.type = 'button';
    check.setAttribute('aria-label', 'Mark as farmed');
    check.setAttribute('aria-pressed', String(!!item.checked));
    check.addEventListener('click', () => {
      item.checked = !item.checked;
      li.classList.toggle('checked', item.checked);
      check.setAttribute('aria-pressed', String(item.checked));
      FarmEntry.saveAll(items);
    });

    const link = el('a', null, item.text || item.url);
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const thumb = el('span', 'lip-popup-thumb');
    const typeIcon = item.type ? iconUrl(TYPE_ICONS[String(item.type).toLowerCase()] || 'item.png') : null;
    if (typeIcon) {
      const img = el('img');
      img.src = typeIcon;
      img.alt = '';
      img.onload = updateScrollHint;
      thumb.appendChild(img);
    }

    const remove = el('button', 'lip-popup-remove', '\u00d7');
    remove.type = 'button';
    remove.title = 'Remove';
    remove.addEventListener('click', async () => {
      hidePreview();
      const next = items.filter((i) => i.id !== item.id);
      await FarmEntry.saveAll(next);
      render(next);
    });

    row.append(check, link, thumb, remove);
    const previews = previewUrlsFor(item);
    attachPreview(row, previews.length ? previews : typeIcon ? [typeIcon] : []);
    li.appendChild(row);

    if (item.locations && item.locations.length) li.appendChild(createLocation(item.locations[0]));
    if (item.map) li.appendChild(CopyButton.create(`/join ${item.map}`, { className: 'join-command' }));
    if (item.price) li.appendChild(createPrice(item.price));
    if (item.mergeList && item.mergeList.items.length) {
      const ingredients = el('ul', 'lip-popup-ingredients');
      item.mergeList.items.forEach((text) => ingredients.appendChild(el('li', null, text)));
      li.appendChild(ingredients);
    }

    return li;
  }

  function render(nextItems) {
    items = nextItems;
    hidePreview();

    const list = document.getElementById('list');
    document.getElementById('empty-message').hidden = items.length > 0;

    const ordered = [...items].sort((a, b) => b.savedAt - a.savedAt);
    list.replaceChildren(...ordered.map(createItem));
    updateScrollHint();
  }

  function init() {
    // The list's height changes with the window.
    new ResizeObserver(updateScrollHint).observe(document.getElementById('list'));
    document.getElementById('list').addEventListener('scroll', () => {
      hidePreview();
      updateScrollHint();
    });

    document.getElementById('clear-all').addEventListener('click', async () => {
      await FarmEntry.saveAll([]);
      render([]);
    });

    // Fill in entries from a transfer code or older ones without a /join map.
    FarmEntry.loadAll()
      .then(render)
      .then(() => FarmEntry.completeEntries())
      .catch(() => {});

    // Items added somewhere else while this is open (cards, right-click, another
    // window). Our own changes come back too, skip those so we don't lose the scroll position.
    ext.storage.onChanged.addListener((changes, area) => {
      const change = changes[STORAGE_KEYS.farmItems];
      if (area !== 'local' || !change) return;
      const next = change.newValue || [];
      if (JSON.stringify(next) !== JSON.stringify(items)) render(next);
    });
  }

  return { init, render };
})();
