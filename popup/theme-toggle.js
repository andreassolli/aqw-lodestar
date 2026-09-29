// Dark/light switch. The popup applies it via [data-theme]; wiki and
// character pages pick up the same storage value in content/theme.js.
const ThemeToggle = (() => {
  const isDark = (theme) => theme !== 'light';

  function reflect(button, theme) {
    button.setAttribute('aria-pressed', String(isDark(theme)));
    button.setAttribute('aria-label', isDark(theme) ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function init() {
    const root = document.documentElement;
    const button = document.querySelector('.search-theme');
    if (!button) return;

    ext.storage.local.get(STORAGE_KEYS.theme).then((result) => {
      const theme = result[STORAGE_KEYS.theme] || 'dark'; // dark matches the CSS default
      root.dataset.theme = theme;
      reflect(button, theme);
    });

    button.addEventListener('click', () => {
      const next = isDark(root.dataset.theme) ? 'light' : 'dark';
      root.dataset.theme = next;
      reflect(button, next);
      ext.storage.local.set({ [STORAGE_KEYS.theme]: next });
    });
  }

  return { init };
})();
