// Search Items by Tag page: puts the item lists above the tag search.
Features.run('itemLists', () => {
  if (!location.pathname.startsWith('/search-items-by-tag')) return;
  const content = document.querySelector('#page-content');
  if (!content) return;
  content.insertBefore(ItemListView.create(), content.children[2] || null);
});
