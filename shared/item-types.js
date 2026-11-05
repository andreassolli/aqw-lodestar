// Item types for the filter, and which type an item is.
const ItemTypes = (() => {
  // In filter order. weapon: true ones go under "Weapons". inventory is how the
  // game's inventory data writes the type.
  const ITEM_TYPES = [
    { id: 'sword', weapon: true, icon: 'aqwsword.png', label: 'Sword', inventory: ['sword'] },
    { id: 'axe', weapon: true, icon: 'Axe.png', label: 'Axe', inventory: ['axe'] },
    { id: 'dagger', weapon: true, icon: 'aqwdagger.png', label: 'Dagger', inventory: ['dagger'] },
    { id: 'mace', weapon: true, icon: 'Mace.png', label: 'Mace', inventory: ['mace'] },
    { id: 'polearm', weapon: true, icon: 'spear.png', label: 'Polearm', inventory: ['polearm'] },
    // Not a real game type, most scythes are Polearms in game.
    { id: 'scythe', weapon: true, icon: 'scythe.svg', label: 'Scythe', inventory: [] },
    { id: 'staff', weapon: true, icon: 'aqwstaff.png', label: 'Staff', inventory: ['staff'] },
    { id: 'wand', weapon: true, icon: 'aqwwand.png', label: 'Wand', inventory: ['wand'] },
    { id: 'bow', weapon: true, icon: 'bow.png', label: 'Bow', inventory: ['bow'] },
    // Gun, HandGun and Rifle all count as Gun.
    { id: 'gun', weapon: true, icon: 'aqwgun.png', label: 'Gun', inventory: ['gun', 'handgun', 'rifle'] },
    { id: 'whip', weapon: true, icon: 'aqwwhip.png', label: 'Whip', inventory: ['whip'] },
    { id: 'gauntlet', weapon: true, icon: 'aqwgauntlet.png', label: 'Gauntlet', inventory: ['gauntlet'] },
    { id: 'armor', icon: 'armor.png', label: 'Armor', inventory: ['armor'] },
    { id: 'class', icon: 'class.webp', label: 'Class', inventory: ['class'] },
    { id: 'helm', icon: 'helm.webp', label: 'Helm', inventory: ['helm'] },
    { id: 'cape', icon: 'cape.webp', label: 'Cape', inventory: ['cape'] },
    { id: 'pet', icon: 'petaqw.png', label: 'Pet', inventory: ['pet'] },
    { id: 'ground', icon: 'ground.png', label: 'Ground', inventory: ['ground'] },
    { id: 'house', icon: 'aqwhouse.png', label: 'House', inventory: ['house'] },
    { id: 'wall', icon: 'aqwwall.png', label: 'Wall item', inventory: ['wallitem'] },
    { id: 'floor', icon: 'aqwfloor.png', label: 'Floor item', inventory: ['flooritem'] },
    { id: 'misc', icon: 'item.png', label: 'Misc item', inventory: ['item', 'questitem', 'resource', 'necklace'] },
  ];
  const WEAPON_TYPES = ITEM_TYPES.filter((type) => type.weapon).map((type) => type.id);

  // The catalog has no type so we guess from the tags. First match wins and the
  // order matters: armors can be tagged "sword", dual blades are tagged both
  // sword and dagger (and the game treats dual wield as Dagger). I checked this
  // against the wiki breadcrumbs and it gets ~109 of 114 right. Sword+dagger,
  // sword+gun and sword+mace are the unreliable ones.
  const TAG_TYPES = [
    ['class', 'class'], ['armor', 'armor'], ['helm', 'helm'], ['back', 'cape'], ['pet', 'pet'], ['battlepet', 'pet'],
    ['ground', 'ground'], ['house', 'house'], ['housewall', 'wall'], ['housefloor', 'floor'],
    ['dagger', 'dagger'], ['scythe', 'scythe'], ['handgun', 'gun'], ['rifle', 'gun'], ['polearm', 'polearm'], ['axe', 'axe'], ['mace', 'mace'],
    ['staff', 'staff'], ['wand', 'wand'], ['sword', 'sword'], ['gun', 'gun'], ['bow', 'bow'], ['whip', 'whip'], ['gauntlet', 'gauntlet'],
    ['misc', 'misc'], ['questitem', 'misc'], ['necklace', 'misc'],
  ];

  // Owned items use the game's type (except scythes). Everything else goes by tags.
  function itemType(item) {
    const tags = item.tags || [];
    const inventoryType = String(item.inventoryType || '').toLowerCase().replace(/\s+/g, '');
    const owned = inventoryType && ITEM_TYPES.find((type) => type.inventory.includes(inventoryType));
    if (owned) return owned.weapon && owned.id !== 'dagger' && tags.includes('scythe') ? 'scythe' : owned.id;
    return TAG_TYPES.find(([tag]) => tags.includes(tag))?.[1] || null;
  }

  // Types from the account site's tables ("Floor Item", "Sword"...).
  function fromSiteType(name) {
    const type = itemType({ inventoryType: name });
    return type === 'misc' ? null : type;
  }

  // Weapons count as one since the tags can't always tell them apart.
  function sameType(a, b) {
    return a === b || (WEAPON_TYPES.includes(a) && WEAPON_TYPES.includes(b));
  }

  // Which AQCloset slot a type is under. House items aren't on there.
  function closetSlot(type) {
    if (WEAPON_TYPES.includes(type)) return 'weapon';
    if (type === 'class') return 'armor';
    return ['armor', 'helm', 'cape', 'pet', 'ground'].includes(type) ? type : null;
  }

  return { ITEM_TYPES, WEAPON_TYPES, itemType, fromSiteType, sameType, closetSlot };
})();
