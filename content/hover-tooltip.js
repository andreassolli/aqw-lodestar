// Item preview panel shown while hovering wiki links, inventory rows on
// account.aq.com, and items on aqcloset.com. Content comes from item-preview.js.
// Placement follows the popup setting: at the side of the screen, or above the item.
(() => {
  const HOVER_DELAY_MS = 100;
  const EXCLUDED_LINK_AREAS = 'sub, #top-bar, #side-bar, #breadcrumbs, [data-aqwt-no-tooltip]';
  const BADGE_ICON_FILES = ['ac.png', 'legend.png'];
  const ANCHOR_GAP = 8; // px between the item and the tooltip
  const VIEWPORT_MARGIN = 8;
  const MIN_HEIGHT_ABOVE = 180; // below this much room above the item, show it underneath instead

  const panel = document.createElement('div');
  panel.className = 'aqwt-card aqwt-tooltip';
  document.body.appendChild(panel);

  let hoverTimer = null;
  let activeKey = null;
  let anchorEl = null; // the hovered item, for 'anchored' placement
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

  // aqcloset-page.js adds a "Toggle tooltip" switch; no switch means enabled.
  function isAqclosetTooltipEnabled() {
    const checkbox = document.getElementById('toggle-tooltip');
    return !checkbox || checkbox.checked;
  }

  /** On aqcloset.com the item's preview is already in the DOM - reuse it. */
  function getAqclosetObjectImages(object) {
    const images = new Set();
    object.querySelectorAll('img[src]').forEach((img) => {
      const src = img.currentSrc || img.src;
      const fileName = src.toLowerCase().split(/[?#]/)[0].split('/').pop();
      if (src && !BADGE_ICON_FILES.includes(fileName)) images.add(src);
    });
    return [...images];
  }

  /** @returns {{url: string, name: string, pageImages?: string[]}|null} */
  function resolveTarget(target) {
    const link = target.closest('a[href]');
    if (link && !link.dataset.aqwtGenerated && isWikiUrl(link.href) && !link.closest(EXCLUDED_LINK_AREAS)) {
      return { el: link, url: link.href, name: getItemLinkLabel(link) };
    }

    if (PAGE.isInventory && target.tagName === 'TD' && target.parentElement?.firstElementChild === target) {
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

  /**
   * 'anchored' placement: centered above the item. When the tooltip is taller
   * than the room above, it's shortened to fit there; only when there's almost
   * no room above (item at the very top of the screen) does it go below.
   */
  function positionOnAnchor() {
    if (!anchorEl || !panel.classList.contains('is-anchored') || !anchorEl.isConnected) return;
    const item = anchorEl.getBoundingClientRect();
    // clientWidth/Height exclude scrollbars, unlike innerWidth/Height.
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    // Natural size first. offsetWidth/Height are layout sizes, so the pop-in
    // animation's scale doesn't distort them.
    panel.style.maxHeight = '';
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    const roomAbove = item.top - ANCHOR_GAP - VIEWPORT_MARGIN;
    const roomBelow = viewportHeight - item.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
    // max-height applies inside the padding and border, so leave room for them.
    const style = getComputedStyle(panel);
    const chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
      .reduce((sum, prop) => sum + parseFloat(style[prop]), 0);
    let top;
    if (height <= roomAbove) {
      top = item.top - ANCHOR_GAP - height;
    } else if (roomAbove >= MIN_HEIGHT_ABOVE || roomAbove >= roomBelow) {
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

  // Images loading in change the tooltip's height; keep it lined up with the item.
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
    const target = resolveTarget(e.target);
    if (!target || !target.url) return;

    const key = `${target.url}::${target.name || ''}`;
    activeKey = key;
    clearTimeout(hoverTimer);

    hoverTimer = setTimeout(async () => {
      const preview = await ItemPreview.load(target);
      if (!preview || activeKey !== key) return; // nothing to show, or the cursor already left
      show(preview, target.el);
    }, HOVER_DELAY_MS);
  });

  document.addEventListener('mouseout', (e) => {
    if (!(e.target instanceof Element)) return;
    if (
      e.target.closest('a') ||
      (PAGE.isInventory && e.target.tagName === 'TD') ||
      (PAGE.isAqcloset && e.target.closest('.object'))
    ) {
      hide();
    }
  });
})();
