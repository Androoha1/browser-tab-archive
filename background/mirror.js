// Optional bookmark mirror. Keeps a copy of the archive in a bookmarks folder:
// single tabs become bookmarks titled "[YYYY-MM-DD] Page title — note",
// groups become subfolders holding their tabs.

import { ymd } from "../lib/util.js";

const KEY = "mirrorState"; // { rootId, map: {entryId: bookmarkId}, months: {"2026-11": folderId} }

async function hasPermission() {
  return browser.permissions.contains({ permissions: ["bookmarks"] });
}

async function loadState() {
  const { [KEY]: s } = await browser.storage.local.get(KEY);
  return s || { rootId: null, map: {}, months: {} };
}

function saveState(s) {
  return browser.storage.local.set({ [KEY]: s });
}

async function exists(id) {
  if (!id) return false;
  try {
    await browser.bookmarks.get(id);
    return true;
  } catch {
    return false;
  }
}

async function ensureRoot(state, settings) {
  if (await exists(state.rootId)) return state.rootId;
  const folder = await browser.bookmarks.create({
    parentId: settings.mirrorLocation,
    title: settings.mirrorFolder || "Archive",
  });
  state.rootId = folder.id;
  state.map = {};
  state.months = {};
  return folder.id;
}

async function parentFor(entry, state, settings) {
  const rootId = await ensureRoot(state, settings);
  if (entry.type === "group" || !settings.mirrorMonthly) return rootId;
  const month = ymd(entry.archivedAt).slice(0, 7);
  if (await exists(state.months[month])) return state.months[month];
  const folder = await browser.bookmarks.create({ parentId: rootId, title: month });
  state.months[month] = folder.id;
  return folder.id;
}

function tabTitle(entry) {
  const base = `[${ymd(entry.archivedAt)}] ${entry.title || entry.url}`;
  return entry.note ? `${base} — ${entry.note}` : base;
}

async function createFor(entry, state, settings) {
  const parentId = await parentFor(entry, state, settings);
  if (entry.type === "group") {
    const folder = await browser.bookmarks.create({ parentId, title: entry.name });
    for (const t of entry.tabs) {
      await browser.bookmarks.create({ parentId: folder.id, title: t.title || t.url, url: t.url });
    }
    state.map[entry.id] = folder.id;
  } else {
    const bm = await browser.bookmarks.create({ parentId, title: tabTitle(entry), url: entry.url });
    state.map[entry.id] = bm.id;
  }
}

async function removeFor(entryId, state) {
  const id = state.map[entryId];
  delete state.map[entryId];
  if (!id) return;
  try {
    await browser.bookmarks.removeTree(id);
  } catch {
    // already gone
  }
}

/** Wraps every mirror operation: skipped when the mirror is off or not permitted. */
async function run(settings, fn) {
  if (!settings.mirror || !(await hasPermission())) return;
  const state = await loadState();
  try {
    await fn(state);
  } catch (err) {
    console.error("Tab Archive: bookmark mirror failed", err);
  }
  await saveState(state);
}

export function mirrorAdd(entries, settings) {
  return run(settings, async (state) => {
    for (const e of entries) await createFor(e, state, settings);
  });
}

export function mirrorRemove(entryId, settings) {
  return run(settings, (state) => removeFor(entryId, state));
}

export function mirrorUpdate(entry, settings) {
  return run(settings, async (state) => {
    const id = state.map[entry.id];
    if (id && entry.type === "tab" && (await exists(id))) {
      await browser.bookmarks.update(id, { title: tabTitle(entry) });
    } else if (entry.type === "tab") {
      await removeFor(entry.id, state);
      await createFor(entry, state, settings);
    }
  });
}

/** Recreate the whole mirror, e.g. after turning it on or changing its location. */
export async function mirrorRebuild(entries, settings) {
  if (!(await hasPermission())) return;
  const state = await loadState();
  // Turning the mirror off stops syncing but leaves the folder in place.
  if (settings.mirror && (await exists(state.rootId))) {
    try {
      await browser.bookmarks.removeTree(state.rootId);
    } catch {
      // ignore
    }
  }
  const fresh = { rootId: null, map: {}, months: {} };
  if (settings.mirror) {
    try {
      await ensureRoot(fresh, settings);
      // Oldest first, so bookmark order matches the archive's order of arrival.
      for (const e of [...entries].reverse()) await createFor(e, fresh, settings);
    } catch (err) {
      console.error("Tab Archive: bookmark mirror rebuild failed", err);
    }
  }
  await saveState(fresh);
}
