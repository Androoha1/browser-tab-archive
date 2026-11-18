# Browser Tab Archive

Firefox extension: archive a tab with ⌘. or a whole tab group with ⌘⇧. (or from the tab context menu), add a note, and find it again in the sidebar.

## Setup

You need Firefox, Node.js, git and the GitHub CLI (`gh`), plus access to this repo.

```bash
gh auth login
gh repo clone Androoha1/browser-tab-archive
cd browser-tab-archive
npm install
npm run sync
```

`npm run sync` at the end installs the current release in your Firefox (click **Add**).

## Workflow

Nobody pushes to `main` directly (the owner may). For each change:

1. Start from the latest `main`: `git switch main` and `git pull`
2. Create a branch: `git switch -c feature/<name>`
3. Develop and test with `npm run dev` (see below)
4. Push the branch: `git push -u origin feature/<name>`
5. Open a pull request on GitHub and wait for the owner to merge it.

If `main` changes while you work, bring those changes into your branch before opening the pull request:

```bash
git fetch
git rebase origin/main
```

If git reports a conflict, fix the marked files, test again, then `git add` them and `git rebase --continue`. A rebased branch that was already pushed needs `git push --force-with-lease`.

Merging a pull request into `main` makes a release (see Releases). To get it on your computer:

```bash
npm run sync
```

`sync` updates your local `main` (your current branch and uncommitted changes stay as they are), waits if GitHub is still signing a release, and opens the newest release in Firefox. Click **Add** to install; your archive is kept. If that version is already installed it does nothing; `npm run sync -- --force` reinstalls it.

## Testing changes

```bash
npm run dev
```

This opens a separate, throwaway Firefox profile with the extension loaded from your folder, and reloads it whenever you save a file. Your installed copy and its archive aren't touched. The toolbar button is pinned right after the address bar, and two web pages open so there's something to archive. The settings are in `web-ext-config.mjs` and the starter profile in `dev/firefox-profile/`.

The "Archived" pill only shows on web pages. Firefox's own pages (a new tab, `about:` pages, addons.mozilla.org) don't allow it, so there the toolbar button shows a ✓ badge instead. For UI work without Firefox, `node dev/serve.mjs` serves the pages with a fake `browser` API.

## Releases

Firefox only installs extensions permanently if Mozilla has signed them. On every push to `main` that changes the extension itself (`manifest.json`, `background/`, `lib/`, `popup/`, `sidebar/`, `options/`, `icons/`), the GitHub Action in `.github/workflows/release.yml` runs `scripts/release.sh`, which signs the committed code as an **unlisted** add-on: Mozilla signs it but doesn't publish it on addons.mozilla.org. The signed `.xpi` is attached to a GitHub release in this private repo. The version is `1.0.<number of commits on main>`.

Data is kept across updates.

One-time setup: the repo needs two Actions secrets, `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, with the API credentials from https://addons.mozilla.org/developers/addon/api/key/. Set them with `gh secret set AMO_JWT_ISSUER` and `gh secret set AMO_JWT_SECRET`, which ask for the value.

## Notes

The extension uses Manifest V2 with a persistent background page, not V3. In MV3, Firefox suspends the background script when idle, so hotkey and menu events arrive late. Firefox then refuses to open the sidebar from them. Firefox fully supports MV2.

The toolbar icon uses `theme_icons` (`icon-dark.svg` on light toolbars, `icon-light.svg` on dark ones). `icon-dark.svg` also switches itself to the light color under a dark color scheme, because Firefox's extensions menu and sidebar icons ignore `theme_icons` with the built-in dark theme.

Uninstalling deletes the archive. Backups in `Downloads/browser-tab-archive/` stay on disk and can be imported again.

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
| `scripts/` | Release signing (CI) and `sync` |
| `.github/workflows/` | Release workflow |
| `dev/` | Starter profile for `npm run dev`, plus a mock `browser` API and static server for previewing the UI in a normal browser. Not packaged. |

## Check in real Firefox

These depend on Firefox behavior that cannot be tested outside the browser:

- The note field gets keyboard focus when ⌘. opens the toolbar popup.
- With only "Archive tab" visible, Firefox shows it at the top level. With both items visible, it nests them under "Browser Tab Archive".
- Backups don't show a save dialog when "Always ask where to save files" is on.
- Group reopening restores the name and color.
