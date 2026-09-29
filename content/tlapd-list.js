(() => {
  if (!location.pathname.startsWith('/search-items-by-tag')) return;

  const LIST_PATH =
    '/search-items-by-tag/parent/-=/tags/' +
    '%2Bseasonal%20%2Btlapd%20-npc%20-war%20-location%20-monster%20-cutscene%20-minigame' +
    '%20-disambiguation%20-bolbadge%20-cpbadge%20-misc%20-quest%20-shop%20-enhancement%20-_index%20-_redirect' +
    '/perPage/250/order/title';
  const MAX_LISTING_PAGES = 20; // safety stop if the result count can't be read
  const MAX_PARALLEL_CARDS = 4;
  const LISTING_TIMEOUT_MS = 45000; // a 250-item listing can take a while for Wikidot to render
  const LISTING_ATTEMPTS = 2;
  const REQUIRED_TAG = 'tlapd';
  // Same exclusions as the search URL; anything carrying these isn't an item.
  const EXCLUDED_TAGS = ['location', 'shop', 'monster', 'npc', 'quest', 'war', 'cutscene', 'minigame',
    'disambiguation', 'enhancement', 'bolbadge', 'cpbadge', 'misc'];

  function parseResultCount(doc) {
    const box = doc.querySelector('#page-content .list-pages-box');
    const match = box && box.textContent.match(/([\d,]+)\s+results?/i);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
  }

  const PER_PAGE = 250;
  const ITEM_LINK = /^\/[^/:#?]+$/; // single-segment wiki path, no system/category pages

  function isItemLink(a) {
    return !a.closest('.pager') && ITEM_LINK.test(a.getAttribute('href') || '');
  }

  /**
   * One block per search result. Wikidot's ListPages wraps each result in
   * .list-pages-item; if it doesn't, find the ancestor level that yields exactly
   * as many blocks as this page should hold (e.g. table rows).
   */
  function findResultBlocks(box, links, expected) {
    const wrapped = box.querySelectorAll('.list-pages-item');
    if (wrapped.length) return [...wrapped];
    if (!expected) return null;

    for (let depth = 1; depth <= 6; depth++) {
      const blocks = new Set();
      for (const link of links) {
        let el = link;
        for (let i = 0; i < depth && el.parentElement && el.parentElement !== box; i++) el = el.parentElement;
        blocks.add(el);
      }
      if (blocks.size === expected) return [...blocks];
    }
    return null;
  }

  /**
   * The item each result is about. Results also link to their locations,
   * shops, monsters etc., so only the first item link in each result counts.
   */
  function parseItemLinks(doc, expected) {
    const items = new Map(); // path -> name
    const boxes = doc.querySelectorAll('#page-content .list-pages-box');

    for (const box of boxes) {
      const links = [...box.querySelectorAll('a[href]')].filter(isItemLink);
      if (!links.length) continue;

      const blocks = findResultBlocks(box, links, expected);
      if (!blocks) {
        console.warn('TLAPD list: could not tell results apart; related links may show up as items.');
      }
      const perResult = blocks
        ? blocks.map((block) => (block.matches('a[href]') ? [block] : links.filter((a) => block.contains(a))))
        : links.map((a) => [a]);

      for (const resultLinks of perResult) {
        const first = resultLinks[0];
        if (!first) continue;
        const path = first.getAttribute('href');
        // The image and the title often both link to the item; prefer the one with text.
        const name = resultLinks.filter((a) => a.getAttribute('href') === path).map((a) => a.textContent.trim()).find(Boolean) || '';
        if (!items.has(path) || (!items.get(path) && name)) items.set(path, name);
      }
    }
    return items;
  }

  async function fetchListingPage(page) {
    const url = `${WIKI_ORIGIN}${LIST_PATH}/p/${page}`;
    let lastError = 'the extension background did not respond';

    for (let attempt = 1; attempt <= LISTING_ATTEMPTS; attempt++) {
      const response = await fetchPage(url, { timeoutMs: LISTING_TIMEOUT_MS });
      if (response && response.html) return new DOMParser().parseFromString(response.html, 'text/html');
      if (response && response.error) lastError = response.error;
    }
    throw new Error(`Listing page ${page} could not be loaded: ${lastError}`);
  }

  async function fetchAllItems(onProgress) {
    const items = new Map();
    let total = null;

    for (let page = 1; page <= MAX_LISTING_PAGES; page++) {
      onProgress(page, total);
      const doc = await fetchListingPage(page);
      if (page === 1) total = parseResultCount(doc);
      const expected = total === null ? null : Math.min(PER_PAGE, total - (page - 1) * PER_PAGE);

      const before = items.size;
      parseItemLinks(doc, expected).forEach((name, path) => {
        if (!items.has(path) || (!items.get(path) && name)) items.set(path, name);
      });

      const gotNothingNew = items.size === before;
      if (gotNothingNew || (total !== null && items.size >= total)) break;
    }

    return [...items].map(([path, name]) => ({
      url: `${WIKI_ORIGIN}${path}`,
      name: name || decodeURIComponent(path.slice(1)).replace(/-/g, ' '),
    }));
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
    return (job) => {
      pending.push(job);
      next();
    };
  }

  const enqueue = createQueue(MAX_PARALLEL_CARDS);

  function createPlaceholder(item) {
    const card = document.createElement('div');
    card.className = 'aqwt-card aqwt-tlapd-card is-loading';

    const details = document.createElement('div');
    details.className = 'aqwt-hover-details';

    const title = document.createElement('a');
    title.className = 'aqwt-tlapd-card-name';
    title.href = item.url;
    title.dataset.aqwtNoTooltip = '';
    title.textContent = item.name;

    const status = document.createElement('p');
    status.className = 'aqwt-tlapd-card-status';
    status.textContent = 'Loading…';

    details.append(title, status);
    card.appendChild(details);
    return card;
  }

  function isNotAnItem(tags) {
    if (!tags || !tags.length) return false; // tags unknown - keep it
    return !tags.includes(REQUIRED_TAG) || tags.some((tag) => EXCLUDED_TAGS.includes(tag));
  }

  async function loadCard(card, item) {
    const preview = await ItemPreview.load(item);
    if (preview && isNotAnItem(preview.tags)) {
      card.remove();
      shownCount--;
      updateCount();
      return;
    }
    card.classList.remove('is-loading');
    if (preview) {
      ItemPreview.fill(card, preview, { titleUrl: item.url });
    } else {
      card.querySelector('.aqwt-tlapd-card-status').textContent = 'No preview available.';
    }
  }

  const cardObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        cardObserver.unobserve(entry.target);
        const { card, item } = entry.target.aqwtItem;
        enqueue(() => loadCard(card, item));
      }
    },
    { rootMargin: '400px 0px' }
  );

  // ---------- UI ----------

  function mount() {
    const wrapper = document.createElement('div');
    wrapper.className = 'aqwt-tlapd';
    wrapper.innerHTML = `
      <button type="button" class="aqwt-tlapd-button" aria-expanded="false"
              title="Show every seasonal Talk Like a Pirate Day item">TLAPD</button>
      <section class="aqwt-tlapd-results" hidden>
        <p class="aqwt-tlapd-status" role="status"></p>
        <div class="aqwt-tlapd-grid"></div>
      </section>`;

    // The tag buttons and search button live in a third-party iframe, so the
    // button and results go directly below it on the wiki page itself.
    const iframe = document.querySelector('#page-content iframe');
    const anchor = iframe && (iframe.closest('p') || iframe);
    if (anchor) anchor.after(wrapper);
    else document.querySelector('#page-content')?.prepend(wrapper);

    return {
      button: wrapper.querySelector('.aqwt-tlapd-button'),
      results: wrapper.querySelector('.aqwt-tlapd-results'),
      status: wrapper.querySelector('.aqwt-tlapd-status'),
      grid: wrapper.querySelector('.aqwt-tlapd-grid'),
    };
  }

  const ui = mount();
  let loaded = false;
  let shownCount = 0;

  function updateCount() {
    ui.status.textContent = `${shownCount} seasonal TLAPD item${shownCount === 1 ? '' : 's'}`;
  }
  let loading = false;

  function setOpen(open) {
    ui.results.hidden = !open;
    ui.button.setAttribute('aria-expanded', String(open));
  }

  async function loadList() {
    loading = true;
    ui.button.disabled = true;
    ui.grid.replaceChildren();

    try {
      const items = await fetchAllItems((page, total) => {
        const pages = total ? ` of ${Math.max(1, Math.ceil(total / PER_PAGE))}` : '';
        ui.status.textContent = `Loading list (page ${page}${pages})…`;
      });

      shownCount = items.length;
      updateCount();
      for (const item of items) {
        const card = createPlaceholder(item);
        card.aqwtItem = { card, item };
        ui.grid.appendChild(card);
        cardObserver.observe(card);
      }
      loaded = true;
    } catch (err) {
      console.error('TLAPD list error:', err);
      ui.status.textContent = `Couldn't load the TLAPD list (${err.message.replace(/^.*?: /, '')}). Click the button to try again.`;
    } finally {
      loading = false;
      ui.button.disabled = false;
    }
  }

  ui.button.addEventListener('click', () => {
    if (loading) return;
    if (!loaded) {
      setOpen(true);
      loadList();
      return;
    }
    setOpen(ui.results.hidden); // already loaded: just toggle
  });
})();
