// Small string/DOM helpers shared by content scripts and the popup.

const RANK_SUFFIX = /\s*\(Rank\s*(?:[1-9]|10)\)/i;
const ITEM_TYPE_SUFFIX =
  /\s*\((Class|Armor|Helm|Cape|Weapon|Pet|Misc|Necklace|Sword|Dagger|Axe|Mace|Polearm|Staff|Wand|Bow|Gun|0 AC|AC|Legend|Non-Legend|Merge|Rare|VIP|Monster)\)/gi;

/** "Void Highlord (Class)" -> "Void Highlord" */
function getBaseName(name) {
  return String(name || '').replace(ITEM_TYPE_SUFFIX, '').trim();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Text of an element's direct text nodes only, ignoring nested elements. */
function getOwnText(el) {
  if (!el) return '';
  let text = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
  });
  return text.trim();
}

/** Wiki URL for a plain item name, or null for empty / "none". */
function wikiUrlFromName(name) {
  const n = String(name || '').trim();
  // Placeholder names like "???" have no wiki page (Wikidot would serve the homepage).
  if (!n || n.toLowerCase() === 'none' || !/[\p{L}\p{N}]/u.test(n)) return null;
  return `${WIKI_ORIGIN}/${encodeURIComponent(n)}`;
}

/** Item name shown by a link, without our badges or a "(Rank N)" suffix. */
function getItemLinkLabel(link) {
  const clone = link.cloneNode(true);
  clone.querySelectorAll('.aqwt-rarity, .aqwt-owned, .aqwt-farm-button, .aqwt-try-on-button').forEach((el) => el.remove());
  return clone.textContent.replace(RANK_SUFFIX, '').trim();
}

/**
 * Comparable form of an item name, so the same item matches across the wiki,
 * char pages, AQCloset and the inventory: no "(Rank 10)", "(AC)"-style suffix,
 * stack count ("x5"), case or apostrophe differences.
 */
function normalizeItemName(name) {
  return getBaseName(
    String(name || '')
      .replace(RANK_SUFFIX, '')
      .replace(/\s+x\d+$/i, '')
      .replace(/[\u2018\u2019`]/g, "'")
  )
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
