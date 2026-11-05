# Item Lists (Lodestar desktop plugin)

*Comes with the app* (a built-in plugin): it can be turned off in Settings →
Options → Features, and a newer zip of it can be installed over it (Settings →
Options → Plugins).

The event item lists from the wiki's *Search Items by Tag* page, in Lodestar's
**Lists** tab: Frostval, Mogloween, Talk Like a Pirate Day, Black Friday and
30 more, plus *Owned items* and *Farm list*. Pick a list from the dropdown to see every item in
it as a card with pictures, rarity, location and price, with *Try on* and *Add
to farm list* buttons and checkmarks on what you own.

Above the cards, a **search box** narrows the list to names containing what you
type, and the **filter icon** beside it opens a menu with:

- **Lists**: tick several to see them together (an item in more than one shows
  once). Your own lists (Owned items, Farm list) come first, then the events
  on now, then the rest by how soon they come around (each event's `months` in
  `content/item-lists.config.js`); the dropdown is ordered the same way.
  Dage's, Nulgath's and Beleen's birthdays are events too, with only their
  seasonal items, and count as on now from a week before to a week after. Their
  items come from the staff member's wiki page (read once a day) and from shops
  and maps named after them. With several ticked the dropdown reads "Frostval +
  2 more"; picking a list in it shows that one alone again.
- **Show**: AC items, Member items and/or items that are neither, and *Show
  owned items* to leave out what you own (once your inventory is imported, see
  below; not offered while the Owned list is shown).
- **Type**: the weapon types (Sword, Axe, Dagger, Mace, Polearm, Staff, Wand,
  Bow, Gun, Scythe, Whip, Gauntlet; *Weapons* ticks them all), then Armor, Class, Helm,
  Cape, Pet, Ground, House, Wall item, Floor item and Misc item; none ticked
  shows every type. Gun covers the game's Gun, HandGun and Rifle; Scythe is every weapon tagged scythe (the game calls most of them Polearms), so Polearm has none.

The number on the icon is how many filters are in use. It's the same search and
filter as on the wiki; the filter is remembered for every list, and the lists
you had open are opened again next time (the first time: the events on now). Clicking a card makes it bigger to show
all of its details; clicking another card shrinks the first one again.

Locations leave out **Event Hub** (the game menu that lists every event): it's on
almost every seasonal item, so it only takes up room. The wiki's lists do the same.

## Owned items: importing your inventory

The extension saves your inventory with its *Sync* button on account.aq.com,
which the app doesn't have. Choose *Owned items* and the import box explains it:

1. Log in on [account.aq.com](https://account.aq.com/) in your browser.
2. Open [your inventory data](https://account.aq.com/myapi/inventory/InventoryData?skip=0&requireTotalCount=true),
   a page of text starting with `{"data":[`.
3. Select all, copy, and paste it into the box (it imports on paste). In
   Firefox, choose *Raw Data* first. A saved copy of the page can be opened
   with *Open saved file…* instead.

It's read by the same code as the extension's Sync (`shared/inventory-import.js`)
and replaces the saved inventory, so the owned checkmarks, the Owned list and
the farm list's counts all use it. Importing from Chrome (Settings) brings over
an inventory synced in the extension too.

The button at the top right opens the lists in a **window of their own**, which
can be made as wide as you like (more cards side by side) and stays on top along
with Lodestar.

## Same lists, same results

The plugin doesn't have its own copy of the lists. It loads the extension's own
code from the app: the list definitions (`content/item-lists.config.js`), the
list view (`content/item-list-view.js`) and the cards (`content/item-preview.js`),
and asks the same item catalog through the same background code. So it always
shows exactly what the extension shows on the wiki, and a list added to
`item-lists.config.js` appears here too once the app is rebuilt.

It's plain JavaScript (no native code), so one zip runs on every platform:
`item-lists-<version>.zip`.

## Files

| File | What it does |
| --- | --- |
| `plugin.json` | Name, version, and the page (with `"popout"`, which adds the window button and sets its first size). |
| `page/page.html` | The tab's heading and the place the lists go. |
| `page/page.js` | Loads the extension's list scripts and styles from the app, adds the list view, and a dropdown above it (it chooses lists with the view's `lists.select(ids)` and follows its `aqwt-lists-change` event). |
| `page/page.css` | Styles the dropdown, and makes the lists follow the app's dark/light theme and fill the window's width. |
| `page/icon.svg` | The tab icon. |
