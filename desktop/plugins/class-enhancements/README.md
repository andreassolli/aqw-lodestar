# Class Enhancements (Lodestar desktop plugin)

*Comes with the app, turned off.* Turn it on in Settings → Plugins (it starts
when Lodestar restarts) and a **Classes** tab appears, with the class guide from
[aqw.app](https://aqw.app):

- A search box for the class (type part of the name, or its initials: `vhl`
  finds Void Highlord; arrows and Enter pick one). The last class is remembered.
- The class's card: the boss buttons (*Standard* first), the weapon, class, helm
  and cape enhancements, the elixir, tonic and active consumable, and the class
  picture from `https://aqw.app/classes/<class>.png`. Choosing another boss
  slides the values over, like on the website.
- The button at the top right opens it in a window of its own; wide enough, the
  picture moves beside the loadout.

## Where the guide comes from

`main.js` downloads `https://aqw.app/classes.json` (`DATA_URL`) in the app's
main process, since a page in the app can't read another site's data unless
that site allows it. It keeps a copy in `plugin-data/class-enhancements/`,
downloads again after 6 hours (or with *Refresh*), and uses the copy when
aqw.app can't be reached.

The JSON is the list of classes the website's class page already uses:

```json
[
  {
    "name": "Void Highlord",
    "generalLoadout": { "sword": "Valiance", "class": "Lucky", "helm": "Lucky", "cloak": "Penitence",
                        "elixir": "Potent Destruction Elixir", "tonic": "Might Tonic",
                        "consumable": "Potent Malevolence Philtre" },
    "bossLoadouts": { "Ultra Dage": { "sword": "Dauntless", "...": "..." } }
  }
]
```

(`{ "classes": [...] }` works too.) It's exactly what the website's
`getAllClassesData()` returns (built from the boss sheets in
`src/data/sheets/*.csv`), published by an endpoint file: copy
`site/classes.json.ts` to the website as `src/pages/classes.json.ts`. Boss names
are the sheet file names; `standard` becomes *Standard* and dashes become spaces.

## Files

| File | What it does |
| --- | --- |
| `plugin.json` | `"defaultEnabled": false` keeps it off until turned on. |
| `main.js` | Downloads and keeps the guide; answers the page's `classes` request. |
| `page/page.js` | The class search (`ClassSearch`) and the card (`ClassCard`, `BossButtons`, `Row`). |
| `page/page.css` | Styles, in the app's theme colours. |
| `site/classes.json.ts` | The endpoint to add to the website. |
