// Maps wiki rarity text / tags to a badge. Styles live in shared/rarity.css.

const RARITY_LABELS = {
  rare: 'Rare',
  'pseudo-rare': 'Pseudo-Rare',
  seasonal: 'Seasonal',
  lqs: 'LQS',
  legendary: 'Legendary',
  upgrade: 'Upgrade',
  benevolent: 'Benevolent',
  champion: 'Champion',
  collector: 'Collector',
  secret: 'Secret',
};

// Checked in order against the lowercased rarity text; "rare" must stay last
// so "Seasonal Rare" isn't matched as plain "Rare".
const RARITY_TEXT_RULES = [
  ['upgrade', 'upgrade'],
  ['seasonal', 'seasonal'],
  ['limited quantity', 'lqs'],
  ['legendary', 'legendary'],
  ['benevolent', 'benevolent'],
  ['champion', 'champion'],
  ['collector', 'collector'],
  ['secret', 'secret'],
  ['hidden', 'secret'],
  ['rare', 'rare'],
];

// Used only when the page has no usable "Rarity:" field.
const RARITY_TAG_FALLBACKS = ['seasonal', 'rare', 'lqs'];

/**
 * @param {{rarity?: string|null, tags?: string[]}} source
 * @returns {string|null} a key of RARITY_LABELS, or null for common/unknown rarities
 */
function getRarity({ rarity, tags }) {
  const tagList = Array.isArray(tags) ? tags : [];
  if (tagList.includes('pseudo-rare')) return 'pseudo-rare';

  const text = String(rarity || '').toLowerCase();
  const rule = text && RARITY_TEXT_RULES.find(([match]) => text.includes(match));
  if (rule) return rule[1];

  return RARITY_TAG_FALLBACKS.find((tag) => tagList.includes(tag)) || null;
}

function createRarityBadge(key) {
  const span = document.createElement('span');
  span.className = `aqwt-rarity aqwt-rarity--${key}`;
  span.textContent = RARITY_LABELS[key];
  return span;
}
