// Where Imgur is blocked: swap the item picture for the AQCloset one, or load
// it through a proxy if AQCloset doesn't have it.
(() => {
  if (!PAGE.isWiki || location.pathname.startsWith('/search-items-by-tag')) return;
  if (!WikiParser.isItemPage(document) || WikiParser.isNonItemCategory(document)) return;

  const content = document.getElementById('page-content');
  if (!content) return;

  const originalSrc = (img) => img.getAttribute(ImageProxy.ORIGINAL_ATTR) || img.getAttribute('src') || '';

  // The male/female tab images, or the first Imgur image.
  const tabImages = ['#wiki-tab-0-0 img', '#wiki-tab-0-1 img'].map((s) => content.querySelector(s)).filter(Boolean);
  const itemImages = (tabImages.length ? tabImages : [...content.querySelectorAll('img')])
    .filter((img) => ImageProxy.isImgur(originalSrc(img)))
    .slice(0, tabImages.length ? 2 : 1);
  if (!itemImages.length) return;

  // Marked so ImageProxy leaves them alone.
  const originals = new Map(itemImages.map((img) => [img, new URL(originalSrc(img), location.href).href]));
  itemImages.forEach((img) => img.setAttribute(ImageProxy.OWNER_ATTR, 'wiki-images'));

  let closetPromise = null;
  const findOnCloset = () => {
    const name = getBaseName(WikiParser.getTitle(document) || '');
    closetPromise = closetPromise || Aqcloset.findItemPreview(name, { exact: true }).catch(() => ({ images: [] }));
    return closetPromise;
  };

  function showOriginal(img) {
    img.onerror = null;
    img.removeAttribute(ImageProxy.ORIGINAL_ATTR);
    img.classList.remove('aqwt-closet-image');
    img.removeAttribute('title');
    img.src = originals.get(img);
  }

  async function replace() {
    const { images } = await findOnCloset();
    if (!ImageProxy.isActive()) return;

    itemImages.forEach((img, i) => {
      const original = originals.get(img);
      const closet = images[Math.min(i, images.length - 1)];
      if (!closet) {
        ImageProxy.useProxy(img, original);
        return;
      }
      img.onerror = () => {
        img.onerror = null;
        img.classList.remove('aqwt-closet-image');
        ImageProxy.useProxy(img, original); // no thumbnail, proxy the wiki image instead
      };
      img.classList.add('aqwt-closet-image');
      img.title = 'Picture from AQCloset (Imgur is blocked here)';
      img.src = closet;
    });
  }

  function apply(active) {
    if (active) replace();
    else itemImages.forEach(showOriginal);
  }

  ImageProxy.ready.then(() => {
    apply(ImageProxy.isActive());
    ImageProxy.onChange(apply);
  });
})();
