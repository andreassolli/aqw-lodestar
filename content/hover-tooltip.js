// The tooltip when hovering wiki links, account site tables and AQCloset items.
// Shows to the side, above the item, or not at all depending on the setting.
(() => {
  const HOVER_DELAY_MS = 100;
  const EXCLUDED_LINK_AREAS = 'sub, #top-bar, #side-bar, #breadcrumbs, [data-aqwt-no-tooltip]';
  const BADGE_ICON_FILES = ['ac.png', 'legend.png'];
  const ANCHOR_GAP = 8;
  const VIEWPORT_MARGIN = 8;
  const SHRINK_ALLOWED = 24; // cut this much off above before moving it below instead

  const panel = document.createElement('div');
  panel.className = 'aqwt-card aqwt-tooltip';
  document.body.appendChild(panel);

  let hoverTimer = null;
  let activeKey = null;
  let anchorEl = null;
  let placement = 'side';

  ext.storage.local.get(STORAGE_KEYS.tooltipPlacement).then((result) => {
    placement = result[STORAGE_KEYS.tooltipPlacement] || 'side';
  });
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.tooltipPlacement]) {
      placement = changes[STORAGE_KEYS.tooltipPlacement].newValue || 'side';
    }
  });

  function isWikiUrl(href) {
    try {
      return new URL(href).hostname === 'aqwwiki.wikidot.com';
    } catch {
      return false;
    }
  }

  function isAqclosetTooltipEnabled() {
    const checkbox = document.getElementById('toggle-tooltip');
    return !checkbox || checkbox.checked;
  }

  // AQCloset already has the images on the page so we just reuse them.
  function getAqclosetObjectImages(object) {
    const images = new Set();
    object.querySelectorAll('img[src]').forEach((img) => {
      const src = img.currentSrc || img.src;
      const fileName = src.toLowerCase().split(/[?#]/)[0].split('/').pop();
      if (src && !BADGE_ICON_FILES.includes(fileName)) images.add(src);
    });
    return [...images];
  }

  // Account site tables like Awesome Items and Buy Back. Looked up by header
  // since you can drag the columns around.
  function columnIndex(table, ...labels) {
    const header = labels.map((label) => table.querySelector(`[role="columnheader"][aria-label="Column ${label}"]`)).find(Boolean);
    return header ? header.getAttribute('aria-colindex') : null;
  }

  function resolveGridItem(target) {
    const cell = target.closest('tr.dx-data-row > td');
    const table = cell && cell.closest('#dataGridContainer');
    if (!table || cell.getAttribute('aria-colindex') !== columnIndex(table, 'Item Name')) return null;

    const name = cell.textContent.trim();
    const typeColumn = columnIndex(table, 'Item Type', 'Type');
    const typeCell = typeColumn && cell.parentElement.querySelector(`td[aria-colindex="${typeColumn}"]`);
    const url = wikiUrlFromName(name);
    if (!url || !typeCell) return null;

    const acColumn = columnIndex(table, 'AC');
    const acBox = acColumn && cell.parentElement.querySelector(`td[aria-colindex="${acColumn}"] [role="checkbox"]`);
    // Buy Back has no AC column, it's all AC gear.
    const ac = acBox ? acBox.getAttribute('aria-checked') === 'true' : true;
    return { el: cell, url, name, itemType: typeCell.textContent.trim(), ac };
  }

  function resolveTarget(target) {
    const link = target.closest('a[href]');
    if (link && !link.dataset.aqwtGenerated && isWikiUrl(link.href) && !link.closest(EXCLUDED_LINK_AREAS)) {
      return { el: link, url: link.href, name: getItemLinkLabel(link), fromLink: true };
    }

    if (PAGE.isAccount) {
      const gridItem = resolveGridItem(target);
      if (gridItem) return gridItem;
    }

    if (PAGE.isInventory && (target.tagName === 'TD' || target.tagName === 'A') && target.parentElement?.firstElementChild === target) {
      const name = target.textContent.trim();
      const url = wikiUrlFromName(name);
      if (url) return { el: target, url, name };
    }

    if (PAGE.isAqcloset && isAqclosetTooltipEnabled()) {
      const object = target.closest('.object');
      const name = object?.querySelector('.label .name')?.textContent.trim();
      const url = wikiUrlFromName(name);
      if (url) return { el: object, url, name, pageImages: getAqclosetObjectImages(object) };
    }

    return null;
  }

  // Above the item. If it doesn't fit it goes below, unless it would barely have
  // to shrink or there's even less room down there. Then it gets shorter instead.
  function positionOnAnchor() {
    if (!anchorEl || !panel.classList.contains('is-anchored') || !anchorEl.isConnected) return;
    const item = anchorEl.getBoundingClientRect();
    // clientWidth/Height skip the scrollbars.
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    // offsetWidth/Height so the pop in animation doesn't mess up the size.
    panel.style.maxHeight = '';
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    const roomAbove = item.top - ANCHOR_GAP - VIEWPORT_MARGIN;
    const roomBelow = viewportHeight - item.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
    const style = getComputedStyle(panel);
    const chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
      .reduce((sum, prop) => sum + parseFloat(style[prop]), 0);
    let top;
    if (height <= roomAbove) {
      top = item.top - ANCHOR_GAP - height;
    } else if (height - roomAbove <= SHRINK_ALLOWED || roomAbove > roomBelow) {
      panel.style.maxHeight = `${Math.max(roomAbove - chrome, 0)}px`;
      top = VIEWPORT_MARGIN;
    } else {
      panel.style.maxHeight = `${Math.max(roomBelow - chrome, 0)}px`;
      top = item.bottom + ANCHOR_GAP;
    }

    const left = item.left + item.width / 2 - width / 2;
    const maxLeft = viewportWidth - width - VIEWPORT_MARGIN;
    panel.style.top = `${top}px`;
    panel.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(left, maxLeft))}px`;
  }

  // Images change the height when they load, keep it lined up.
  new ResizeObserver(positionOnAnchor).observe(panel);
  window.addEventListener('scroll', positionOnAnchor, true);

  function show(preview, el) {
    ItemPreview.fill(panel, preview);
    anchorEl = el;
    const anchored = placement === 'anchored' && !!el;
    panel.classList.toggle('is-anchored', anchored);
    if (!anchored) {
      panel.style.top = '';
      panel.style.left = '';
      panel.style.maxHeight = '';
    }
    panel.classList.add('visible');
    positionOnAnchor();
  }

  function hide() {
    clearTimeout(hoverTimer);
    activeKey = null;
    anchorEl = null;
    panel.classList.remove('visible');
    panel.replaceChildren();
  }

  document.addEventListener('mouseover', (e) => {
    if (!(e.target instanceof Element)) return;
    if (placement === 'off') return;
    const target = resolveTarget(e.target);
    if (!target || !target.url) return;

    const key = ItemPreview.previewKey(target);
    activeKey = key;
    clearTimeout(hoverTimer);

    hoverTimer = setTimeout(async () => {
      const preview = await ItemPreview.load(target);
      if (!preview || activeKey !== key) return;
      show(preview, target.el);
    }, HOVER_DELAY_MS);
  });

  document.addEventListener('mouseout', (e) => {
    if (!(e.target instanceof Element)) return;
    if (
      e.target.closest('a') ||
      (PAGE.isInventory && e.target.tagName === 'TD') ||
      (PAGE.isAccount && e.target.closest('tr.dx-data-row')) ||
      (PAGE.isAqcloset && e.target.closest('.object'))
    ) {
      hide();
    }
  });
})();
