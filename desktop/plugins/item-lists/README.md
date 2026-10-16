# Item Lists (Lodestar desktop plugin)

*Comes with the app* (a built-in plugin): it can be turned off in Settings →
Plugins, and a newer zip of it can be installed over it.

The event item lists from the wiki's *Search Items by Tag* page, in Lodestar's
**Lists** tab: Frostval, Mogloween, Talk Like a Pirate Day, Black Friday and
30 more, plus *Owned items* and *Farm list*. Pick a list from the dropdown (it
remembers your last one) to see every item in
it as a card with pictures, rarity, location and price, with *Try on* and *Add
to farm list* buttons and checkmarks on what you own.

The **filter icon** beside the dropdown narrows a list to AC items, Member items
and/or items that are neither, and *Show owned items* can be unticked to leave
out what you own (once your inventory is imported, see below; it isn't offered
on the Owned list). The number on the icon is how many boxes are ticked. It's the same filter as the *Filter* button
on the wiki, and the choice is remembered for every list.

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
| `page/page.js` | Loads the extension's list scripts and styles from the app, adds the list view, and a dropdown in place of its row of list buttons (picking a list clicks its button). |
| `page/page.css` | Hides the list buttons, styles the dropdown, and makes the lists follow the app's dark/light theme and fill the window's width. |
| `page/icon.svg` | The tab icon. |
