// Wiki rarity text/tags -> badge. Styles are in rarity.css.

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

// Checked in order, "rare" has to be last or "Seasonal Rare" would match it.
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

// Only used when there's no Rarity field.
const RARITY_TAG_FALLBACKS = ['seasonal', 'rare', 'lqs'];

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
