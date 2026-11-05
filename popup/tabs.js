// The tab row: page tabs on the left, Settings and theme on the right. Every
// [data-tab] button shows its aria-controls panel. Plugin pages can be added
// later, just call Tabs.refresh() after. With only one page the tabs hide.
const Tabs = (() => {
  const REMEMBER_KEY = 'lodestar-popup-tab'; // so the popup reopens on it
  const HOME = 'farm';
  let current = null;
  let previous = null; // the page Settings was opened from

  const buttons = () => [...document.querySelectorAll('[data-tab]')];
  const pageTabs = () => [...document.querySelectorAll('.tabs [role="tab"]')];
  const isPage = (name) => pageTabs().some((tab) => tab.dataset.tab === name);

  // remember: false keeps the saved page (for plugin pages that aren't added yet).
  function show(name, { remember = true } = {}) {
    if (!buttons().some((button) => button.dataset.tab === name)) name = HOME;
    if (name !== current) {
      if (isPage(current)) previous = current;
      current = name;
    }

    for (const button of buttons()) {
      const active = button.dataset.tab === name;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
      button.classList.toggle('is-active', active);
      if (button.getAttribute('role') === 'tab') {
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active || (!isPage(name) && button.dataset.tab === previous) ? 0 : -1;
      } else {
        button.setAttribute('aria-expanded', String(active));
      }
    }

    if (remember && isPage(name)) {
      try {
        localStorage.setItem(REMEMBER_KEY, name);
      } catch {
        // storage blocked, just don't remember
      }
    }
    document.dispatchEvent(new CustomEvent('lodestar:tab', { detail: { tab: name } }));
  }

  function back() {
    show(previous && isPage(previous) ? previous : HOME);
  }

  function savedPage() {
    try {
      return localStorage.getItem(REMEMBER_KEY);
    } catch {
      return null;
    }
  }

  // Call after adding tabs. Hides a lone tab and reopens the saved page if it showed up.
  function refresh() {
    document.querySelector('.tabs')?.classList.toggle('is-single', pageTabs().length < 2);
    const saved = savedPage();
    if (current === HOME && saved !== HOME && isPage(saved)) show(saved);
    else show(current || HOME, { remember: false });
  }

  function init() {
    // One listener for all tabs, including ones added later.
    document.addEventListener('click', (e) => {
      const button = e.target.closest('[data-tab]');
      if (!button) return;
      // Clicking Settings again closes it.
      if (button.dataset.tab === current && !isPage(current)) back();
      else show(button.dataset.tab);
    });
    document.querySelectorAll('[data-tab-back]').forEach((button) =>
      button.addEventListener('click', () => {
        back();
        document.querySelector('.tab.is-active')?.focus();
      })
    );

    document.querySelector('.tabs')?.addEventListener('keydown', (e) => {
      const tabs = pageTabs();
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      const next = step ? tabs[(index + step + tabs.length) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
      if (!next) return;
      e.preventDefault();
      next.focus();
      show(next.dataset.tab);
    });

    document.querySelector('.tabs')?.classList.toggle('is-single', pageTabs().length < 2);
    // A saved plugin page might not be added yet, keep it until refresh().
    const saved = savedPage();
    show(isPage(saved) ? saved : HOME, { remember: false });
  }

  return {
    init,
    show,
    back,
    refresh,
    get current() {
      return current;
    },
  };
})();
