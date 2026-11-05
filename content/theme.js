// Dark theme on the wiki and character pages, using the popup's setting.
(() => {
  const themeClass = PAGE.isWiki ? 'wiki-theme' : PAGE.isCharPage ? 'char-theme' : null;
  if (!themeClass) return;

  const apply = (theme) => document.body.classList.toggle(themeClass, theme === 'dark');

  ext.storage.local.get(STORAGE_KEYS.theme).then((result) => apply(result[STORAGE_KEYS.theme]));

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.theme]) apply(changes[STORAGE_KEYS.theme].newValue);
  });
})();
