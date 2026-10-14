// The "Items to Farm" list: rendering, checking off, removing, and the
// hover image preview / scroll hint.
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
  };

  const iconUrl = (file) => ext.runtime.getURL(`icons/${file}`);

  let items = [];
  let hoverTimer = null;
  let mouse = { x: 0, y: 0 };
  let previewEl = null;
  let scrollHintEl = null;

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

  // Entries saved by older versions kept wiki images under wikiInfo.
  function previewUrlsFor(item) {
    if (Array.isArray(item.image) && item.image.length) return item.image;
    if (typeof item.image === 'string' && item.image) return [item.image];
    if (item.wikiInfo && Array.isArray(item.wikiInfo.images)) return item.wikiInfo.images;
    return [];
  }

  function updateScrollHint() {
    const list = document.getElementById('list');
    if (!scrollHintEl) {
      scrollHintEl = document.createElement('div');
      scrollHintEl.className = 'lip-scroll-indicator';
      scrollHintEl.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
      document.body.appendChild(scrollHintEl);
    }

    const hasMoreBelow = list.scrollHeight - list.clientHeight - list.scrollTop > 4;
    scrollHintEl.classList.toggle('visible', hasMoreBelow);
    if (!hasMoreBelow) return;

    const rect = list.getBoundingClientRect();
    scrollHintEl.style.left = `${rect.left + rect.width / 2}px`;
    scrollHintEl.style.top = `${rect.bottom - 20}px`;
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

    // Newest first.
    const ordered = [...items].sort((a, b) => b.savedAt - a.savedAt);
    list.replaceChildren(...ordered.map(createItem));
    updateScrollHint();
  }

  function init() {
    document.getElementById('list').addEventListener('scroll', () => {
      hidePreview();
      updateScrollHint();
    });

    document.getElementById('clear-all').addEventListener('click', async () => {
      await FarmEntry.saveAll([]);
      render([]);
    });

    FarmEntry.loadAll().then(render);

    // Items added elsewhere while this is open: the add buttons on item list
    // cards (the desktop app's Lists tab, or its popout window), the right-click
    // menu, another window. Changes made here come back too; those are skipped
    // so the list isn't redrawn (and its scroll position lost) for nothing.
    ext.storage.onChanged.addListener((changes, area) => {
      const change = changes[STORAGE_KEYS.farmItems];
      if (area !== 'local' || !change) return;
      const next = change.newValue || [];
      if (JSON.stringify(next) !== JSON.stringify(items)) render(next);
    });
  }

  return { init, render };
})();
