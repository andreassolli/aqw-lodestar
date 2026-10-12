// Applies the popup's dark/light choice (STORAGE_KEYS.theme) to the wiki and
// character pages, by toggling a class on <body> that theme.css styles.
(() => {
  const themeClass = PAGE.isWiki ? 'wiki-theme' : PAGE.isCharPage ? 'char-theme' : null;
  if (!themeClass) return;

  const apply = (theme) => document.body.classList.toggle(themeClass, theme === 'dark');

  ext.storage.local.get(STORAGE_KEYS.theme).then((result) => apply(result[STORAGE_KEYS.theme]));

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.theme]) apply(changes[STORAGE_KEYS.theme].newValue);
  });
})();
