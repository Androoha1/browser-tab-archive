# Tab Archive

Firefox extension: archive a tab or tab group with ⌘. (or the tab context menu), add a note, and find it again in the sidebar.

## Try it

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. Press ⌘. on any tab. The toolbar button shows and hides the sidebar.

The extension uses Manifest V2 with a persistent background page, not V3. In MV3, Firefox suspends the background script when idle, so hotkey and menu events arrive late. Firefox then refuses to open the sidebar from them. Firefox fully supports MV2.

The toolbar icon uses `theme_icons` (`icon-dark.svg` on light toolbars, `icon-light.svg` on dark ones). `icon-dark.svg` also switches itself to the light color under a dark color scheme, because Firefox's extensions menu and sidebar icons ignore `theme_icons` with the built-in dark theme.

A temporary add-on is removed when Firefox quits, along with its archive. Backups in `Downloads/tab-archive/` stay on disk and can be imported again.

## Releases

Firefox only installs extensions permanently if Mozilla has signed them. `scripts/release.sh` signs the committed code as an **unlisted** add-on: Mozilla signs it but does not publish it on addons.mozilla.org, and the signed `.xpi` stays on this Mac. The version is `1.0.<number of commits>`, so each commit gets a higher version.

One-time setup:

1. Install the signing tool: `npm install --save-dev web-ext`
2. Sign in at https://addons.mozilla.org/developers/addon/api/key/ and generate API credentials.
3. Store them in the macOS Keychain. Each command asks for the value, so it doesn't end up in your shell history:
   - `security add-generic-password -s tab-archive-amo -a jwt-issuer -w` (paste the JWT issuer)
   - `security add-generic-password -s tab-archive-amo -a jwt-secret -w` (paste the JWT secret)
4. Install the commit hook: `npm run install-hook`

After that, every commit on `main` signs a new version in the background and opens it in Firefox. Click **Add** to update. Data is kept across updates. Progress and errors go to `releases/release.log`. To release without committing, run `npm run release`.

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
| `scripts/` | Release signing and the post-commit hook |
| `dev/` | Mock `browser` API and a static server for previewing the UI in a normal browser. Not packaged. |

## Check in real Firefox

These depend on Firefox behavior that cannot be tested outside the browser:

- The note field gets keyboard focus when ⌘. opens the toolbar popup.
- With only "Archive tab" visible, Firefox shows it at the top level. With both items visible, it nests them under "Tab Archive".
- Backups don't show a save dialog when "Always ask where to save files" is on.
- Group reopening restores the name and color.
