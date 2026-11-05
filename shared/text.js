
const RANK_SUFFIX = /\s*\(Rank\s*(?:[1-9]|10)\)/i;
const ITEM_TYPE_SUFFIX =
  /\s*\((Class|Armor|Helm|Cape|Weapon|Pet|Misc|Necklace|Sword|Dagger|Axe|Mace|Polearm|Staff|Wand|Bow|Gun|0 AC|AC|Non-AC|Legend|Non-Legend|Merge|Rare|VIP|Monster|House Item|\d+)\)/gi;

function getBaseName(name) {
  return String(name || '').replace(ITEM_TYPE_SUFFIX, '').trim();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getOwnText(el) {
  if (!el) return '';
  let text = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
  });
  return text.trim();
}

function wikiUrlFromName(name) {
  const n = String(name || '').trim();
  // Names like "???" have no wiki page.
  if (!n || n.toLowerCase() === 'none' || !/[\p{L}\p{N}]/u.test(n)) return null;
  return `${WIKI_ORIGIN}/${encodeURIComponent(n)}`;
}

function getItemLinkLabel(link) {
  const clone = link.cloneNode(true);
  clone.querySelectorAll('.aqwt-rarity, .aqwt-owned, .aqwt-farm-button, .aqwt-try-on-button').forEach((el) => el.remove());
  return clone.textContent.replace(RANK_SUFFIX, '').trim();
}

  // Normalized name so the same item matches everywhere: no "(Rank 10)", "(AC)",
  // "x5", case or apostrophe differences.
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

// Copy to clipboard, with the old textarea trick as a fallback.
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function timeAgo(ms) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(ms).toLocaleDateString();
}
