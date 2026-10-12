// Character page: a +/- button on each inventory category (Class, Armor, ...)
// matching the page's own Inventory/Achievements toggles. Collapsed
// categories are remembered across pages.
(() => {
  if (!PAGE.isCharPage) return;

  const KEY = STORAGE_KEYS.collapsedInventorySections;
  let collapsed = new Set();

  function sectionName(header) {
    const clone = header.cloneNode(true);
    clone.querySelector('.aqwt-section-toggle')?.remove();
    return clone.textContent.trim();
  }

  function setCollapsed(section, isCollapsed) {
    section.classList.toggle('aqwt-section-collapsed', isCollapsed);
    const button = section.querySelector('.aqwt-section-toggle');
    const icon = button.querySelector('i');
    icon.classList.toggle('fa-minus', !isCollapsed);
    icon.classList.toggle('fa-plus', isCollapsed);
    button.setAttribute('aria-expanded', String(!isCollapsed));
  }

  function enhance(section) {
    const header = section.querySelector(':scope > .card-header');
    const body = section.querySelector(':scope > .card-body');
    if (!header || !body || header.querySelector('.aqwt-section-toggle')) return;

    const name = sectionName(header);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-xs btn-primary aqwt-section-toggle';
    button.title = `Show or hide ${name}`;
    button.innerHTML = '<i class="fas fa-minus" aria-hidden="true"></i>';
    header.prepend(button);
    header.classList.add('aqwt-section-header');

    // Whole header is clickable, like the page's own collapsible headings.
    header.addEventListener('click', () => {
      const isCollapsed = !section.classList.contains('aqwt-section-collapsed');
      setCollapsed(section, isCollapsed);
      if (isCollapsed) collapsed.add(name);
      else collapsed.delete(name);
      ext.storage.local.set({ [KEY]: [...collapsed] });
    });

    setCollapsed(section, collapsed.has(name));
  }

  function enhanceAll(container) {
    container.querySelectorAll(':scope > div').forEach(enhance);
  }

  async function init(container) {
    container.classList.add('aqwt-inventory-columns');
    const stored = await ext.storage.local.get(KEY);
    collapsed = new Set(stored[KEY] || []);
    enhanceAll(container);
    // Sections are rendered by the page's script, possibly after we run.
    new MutationObserver(() => enhanceAll(container)).observe(container, { childList: true });
  }

  const existing = document.getElementById('inventoryRendered');
  if (existing) {
    init(existing);
  } else {
    const waiter = new MutationObserver(() => {
      const container = document.getElementById('inventoryRendered');
      if (!container) return;
      waiter.disconnect();
      init(container);
    });
    waiter.observe(document.body, { childList: true, subtree: true });
  }
})();
