// "Search Items by Tag" page: the event item lists (item-list-view.js), placed
// in the page content after the "Google Search - Search Items by Tag" links and
// the "For any questions" note, above the tag search iframe.
(() => {
  if (!location.pathname.startsWith('/search-items-by-tag')) return;
  const content = document.querySelector('#page-content');
  if (!content) return;
  content.insertBefore(ItemListView.create(), content.children[2] || null);
})();
