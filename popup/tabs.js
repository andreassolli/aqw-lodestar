// The tab row under the logo: page tabs on the left (Farm, ...), Settings and
// the theme switch on the right. Every [data-tab] button shows the element named
// in its aria-controls and hides the other panels. Settings works the same way,
// so it can be opened from any page; its Back button returns to that page.
//
// To add a page: add a .tab button to .tabs in popup.html (role="tab",
// data-tab="<name>", aria-controls="<panel id>") and a
// <section id="<panel id>" class="tab-panel" role="tabpanel" hidden> for it.
// Tabs added later (the desktop app's plugin pages) work too: call
// Tabs.refresh() after adding them. With only one page, the tab list is hidden.
const Tabs = (() => {
  const REMEMBER_KEY = 'lodestar-popup-tab'; // the last page, so the popup reopens on it
  const HOME = 'farm';
  let current = null;
  let previous = null; // the page Settings was opened from

  const buttons = () => [...document.querySelectorAll('[data-tab]')];
  const pageTabs = () => [...document.querySelectorAll('.tabs [role="tab"]')];
  const isPage = (name) => pageTabs().some((tab) => tab.dataset.tab === name);

  /**
   * Shows a tab's panel and hides the rest.
   * @param {{remember?: boolean}} [options]  remember: false keeps the remembered
   *   page (used while a remembered plugin page hasn't been added yet)
   */
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
        // storage blocked: just don't remember
      }
    }
    document.dispatchEvent(new CustomEvent('lodestar:tab', { detail: { tab: name } }));
  }

  /** Back to the page that was showing before Settings (or Farm). */
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

  /** After tabs are added or removed: hide a lone tab, and reopen the remembered page if it just appeared. */
  function refresh() {
    document.querySelector('.tabs')?.classList.toggle('is-single', pageTabs().length < 2);
    const saved = savedPage();
    if (current === HOME && saved !== HOME && isPage(saved)) show(saved);
    else show(current || HOME, { remember: false });
  }

  function init() {
    // One listener for every [data-tab] button, including ones added later.
    document.addEventListener('click', (e) => {
      const button = e.target.closest('[data-tab]');
      if (!button) return;
      // A second click on Settings closes it again.
      if (button.dataset.tab === current && !isPage(current)) back();
      else show(button.dataset.tab);
    });
    document.querySelectorAll('[data-tab-back]').forEach((button) =>
      button.addEventListener('click', () => {
        back();
        document.querySelector('.tab.is-active')?.focus();
      })
    );

    // Arrow keys move between page tabs, as in any tab list.
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
    // A remembered plugin page may not be added yet; keep remembering it until refresh().
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
