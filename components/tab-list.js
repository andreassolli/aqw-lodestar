// Tabs that show one panel at a time. Arrow keys work and the last tab is remembered.
//
//   const tabs = TabList.create(listEl, { rememberAs: 'lodestar-settings-panel' });
//   tabs.show('about');
const TabList = (() => {
  function create(list, { rememberAs = null } = {}) {
    const tabs = [...list.querySelectorAll('[role="tab"]')];

    function show(name) {
      if (!tabs.some((tab) => tab.dataset.tabName === name)) return;
      for (const tab of tabs) {
        const selected = tab.dataset.tabName === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      }
      if (!rememberAs) return;
      try {
        localStorage.setItem(rememberAs, name);
      } catch {
        // storage blocked, just don't remember
      }
    }

    tabs.forEach((tab) => tab.addEventListener('click', () => show(tab.dataset.tabName)));
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
      const next = tabs[(current + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      show(next.dataset.tabName);
      next.focus();
      e.preventDefault();
    });

    if (rememberAs) {
      let saved = null;
      try {
        saved = localStorage.getItem(rememberAs);
      } catch {
        saved = null;
      }
      if (saved) show(saved);
    }
    return { show };
  }

  return { create };
})();
