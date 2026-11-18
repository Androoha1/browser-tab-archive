# Browser Tab Archive

Firefox extension: archive a tab or tab group with ⌘. (or the tab context menu), add a note, and find it again in the sidebar.

## Develop

```bash
npm install
npm run dev
```

`npm run dev` opens a separate, throwaway Firefox profile with the extension loaded from this folder, and reloads it whenever you save a file. Your installed copy and its archive aren't touched. For UI work without Firefox, `node dev/serve.mjs` serves the pages with a fake `browser` API.

Work on a branch and merge into `main` when the change is finished: every push to `main` is a release.

The extension uses Manifest V2 with a persistent background page, not V3. In MV3, Firefox suspends the background script when idle, so hotkey and menu events arrive late. Firefox then refuses to open the sidebar from them. Firefox fully supports MV2.

The toolbar icon uses `theme_icons` (`icon-dark.svg` on light toolbars, `icon-light.svg` on dark ones). `icon-dark.svg` also switches itself to the light color under a dark color scheme, because Firefox's extensions menu and sidebar icons ignore `theme_icons` with the built-in dark theme.

Uninstalling deletes the archive. Backups in `Downloads/browser-tab-archive/` stay on disk and can be imported again.

## Releases

Firefox only installs extensions permanently if Mozilla has signed them. On every push to `main`, the GitHub Action in `.github/workflows/release.yml` runs `scripts/release.sh`, which signs the committed code as an **unlisted** add-on: Mozilla signs it but doesn't publish it on addons.mozilla.org. The signed `.xpi` is attached to a GitHub release in this private repo. The version is `1.0.<number of commits on main>`.

- `npm run ship`: push `main`, wait for the release, and open it in Firefox (click **Add**).
- `npm run update`: open the newest release in Firefox, e.g. after merging a pull request on GitHub.

Data is kept across updates.

One-time setup: the repo needs two Actions secrets, `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, with the API credentials from https://addons.mozilla.org/developers/addon/api/key/. Set them with `gh secret set AMO_JWT_ISSUER` and `gh secret set AMO_JWT_SECRET`, which ask for the value.

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
| `scripts/` | Release signing (CI), `ship` and `update` |
| `.github/workflows/` | Release workflow |
| `dev/` | Mock `browser` API and a static server for previewing the UI in a normal browser. Not packaged. |

## Check in real Firefox

These depend on Firefox behavior that cannot be tested outside the browser:

- The note field gets keyboard focus when ⌘. opens the toolbar popup.
- With only "Archive tab" visible, Firefox shows it at the top level. With both items visible, it nests them under "Browser Tab Archive".
- Backups don't show a save dialog when "Always ask where to save files" is on.
- Group reopening restores the name and color.
