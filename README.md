# Tab Archive

Firefox extension: archive a tab or tab group with ⌘. (or the tab context menu), add a note, and find it again in the sidebar.

## Try it

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. Press ⌘. on any tab. The toolbar button shows and hides the sidebar.

The extension uses Manifest V2 with a persistent background page, not V3. In MV3, Firefox suspends the background script when idle, so hotkey and menu events arrive late. Firefox then refuses to open the sidebar from them. Firefox fully supports MV2.

The toolbar icon uses `theme_icons` (`icon-dark.svg` on light toolbars, `icon-light.svg` on dark ones). `icon-dark.svg` also switches itself to the light color under a dark color scheme, because Firefox's extensions menu and sidebar icons ignore `theme_icons` with the built-in dark theme.

A temporary add-on is removed when Firefox quits, along with its archive. Backups in `Downloads/tab-archive/` stay on disk and can be imported again.

## Package

```bash
zip -r tab-archive.zip manifest.json background lib popup sidebar options icons
```

To install it permanently, sign the zip on addons.mozilla.org as an unlisted add-on.

## Layout

| Path | What it does |
| --- | --- |
| `background/background.js` | Hotkey, context menu, prompt flow, saving, reopening, import |
| `background/toast.js` | "Archived" and duplicate pills, with notification fallback |
| `background/backup.js` | Debounced JSON backups, rotating `backup-1…5.json` |
| `background/mirror.js` | Optional bookmark mirror |
| `lib/db.js` | IndexedDB store |
| `popup/` | Note prompt, shown as the toolbar button's popup while archiving |
| `sidebar/` | Archive list, search, inline edit/delete |
| `options/` | Settings page |
| `dev/` | Mock `browser` API and a static server for previewing the UI in a normal browser. Not packaged. |

## Check in real Firefox

These depend on Firefox behavior that cannot be tested outside the browser:

- The note field gets keyboard focus when ⌘. opens the toolbar popup.
- With only "Archive tab" visible, Firefox shows it at the top level. With both items visible, it nests them under "Tab Archive".
- Backups don't show a save dialog when "Always ask where to save files" is on.
- Group reopening restores the name and color.
