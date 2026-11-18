// Browser Tab Archive background script (persistent MV2 background page).
//
// browserAction.openPopup() only works synchronously inside a user-action handler
// (hotkey or menu click), so every trigger decides from in-memory caches
// whether a prompt is needed *before* awaiting anything.

import * as db from "../lib/db.js";
import { DEFAULT_SETTINGS, uuid, ymd, entryUrls } from "../lib/util.js";
import { scheduleBackup, exportPayload } from "./backup.js";
import { mirrorAdd, mirrorRemove, mirrorUpdate, mirrorRebuild } from "./mirror.js";
import { toastArchived, toastDuplicate } from "./toast.js";

// ---------- caches ----------

let settings = { ...DEFAULT_SETTINGS };
let urlIndex = new Map(); // url -> archivedAt (earliest)
const highlighted = new Map(); // windowId -> Set<tabId>
let menuContext = null; // filled by menus.onShown, read by menus.onClicked
let ready = false;

async function loadSettings() {
  const { settings: s } = await browser.storage.local.get("settings");
  settings = { ...DEFAULT_SETTINGS, ...(s || {}) };
}

async function rebuildIndex(entries) {
  entries = entries || (await db.getAll());
  const idx = new Map();
  for (const e of entries) {
    for (const url of entryUrls(e)) {
      const prev = idx.get(url);
      if (!prev || e.archivedAt < prev) idx.set(url, e.archivedAt);
    }
  }
  urlIndex = idx;
}

async function loadHighlighted() {
  const tabs = await browser.tabs.query({ highlighted: true });
  highlighted.clear();
  for (const t of tabs) {
    if (!highlighted.has(t.windowId)) highlighted.set(t.windowId, new Set());
    highlighted.get(t.windowId).add(t.id);
  }
}

const warmUp = Promise.all([loadSettings(), rebuildIndex(), loadHighlighted()])
  .then(() => (ready = true))
  .catch((err) => console.error("Browser Tab Archive: warm-up failed", err));

browser.tabs.onHighlighted.addListener(({ windowId, tabIds }) => {
  highlighted.set(windowId, new Set(tabIds));
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  const before = settings;
  settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
  const mirrorKeys = ["mirror", "mirrorLocation", "mirrorFolder", "mirrorMonthly"];
  if (mirrorKeys.some((k) => before[k] !== settings[k]) && settings.mirror) {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(async () => mirrorRebuild(await db.getAll(), settings), 400);
  }
});
let rebuildTimer = null;

// ---------- after every change ----------

function broadcast() {
  browser.runtime.sendMessage({ type: "changed" }).catch(() => {});
}

function afterChange(entries) {
  rebuildIndex(entries);
  broadcast();
  scheduleBackup(
    () => db.getAll(),
    async () => {
      await warmUp;
      return settings.backups;
    }
  );
}

// ---------- triggers ----------
//
// Each hotkey press or menu click is one archive "job". When a note or name is
// needed, the toolbar button's popup is set to popup.html for that job and
// opened right away, inside the user action (Firefox refuses it later). The
// popup connects back over a port; closing it any way clears the popup URL so
// plain toolbar clicks toggle the sidebar again.

const jobs = new Map(); // job id -> { id, tabId, request, port, state }
let nextJobId = 1;
const POPUP_TIMEOUT_MS = 2000;

/**
 * Synchronous first half of every archive action.
 * mode: "hotkey" | "menu-tab" | "menu-group"
 */
function trigger(mode, tab) {
  const guess = guessPrompt(mode, tab);
  console.info("Browser Tab Archive: trigger", mode, { tabId: tab?.id, ready, guess });

  if (guess.dupDate) {
    toastDuplicate(tab.id, ymd(guess.dupDate));
    return;
  }

  const job = { id: nextJobId++, tabId: tab?.id, request: null, port: null, state: "preparing" };
  job.connected = new Promise((resolve) => (job.onConnected = resolve));
  let opened = Promise.resolve(false);
  if (guess.prompt) {
    jobs.set(job.id, job);
    browser.browserAction.setPopup({ popup: `popup/popup.html?job=${job.id}&tabId=${tab?.id ?? ""}` });
    // openPopup() can resolve even when no popup appears (e.g. fullscreen), so
    // the popup only counts as open once its page connects back.
    opened = browser.browserAction.openPopup().then(
      () => Promise.race([job.connected, new Promise((r) => setTimeout(() => r(false), POPUP_TIMEOUT_MS))]),
      () => false
    ).then((ok) => {
      if (!ok) {
        console.warn("Browser Tab Archive: popup did not open, archiving without a note");
        clearPopup();
      }
      return ok;
    });
  }
  prepare(job, mode, tab, opened).catch((err) => {
    console.error("Browser Tab Archive: archive failed", err);
    endJob(job);
  });
}

function guessPrompt(mode, tab) {
  if (!ready || !tab) return { prompt: true };
  if (mode === "menu-group") {
    const group = menuContext?.tabId === tab.id ? menuContext.group : null;
    return { prompt: settings.notePrompt || !group?.title };
  }
  const sel = highlighted.get(tab.windowId);
  const isSelection = sel && sel.size > 1 && (mode === "hotkey" || sel.has(tab.id));
  if (isSelection) return { prompt: true }; // a selection always asks for a name
  const dupDate = urlIndex.get(tab.url);
  if (dupDate) return { dupDate };
  return { prompt: settings.notePrompt };
}

/** Asynchronous second half: collect tab data, then prompt or save directly. */
async function prepare(job, mode, tab, openedPromise) {
  await warmUp;
  if (!tab) [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const windowId = tab.windowId;

  let tabs;
  let group = null;
  if (mode === "menu-group" && tab.groupId != null && tab.groupId !== -1) {
    group = await browser.tabGroups.get(tab.groupId);
    tabs = await browser.tabs.query({ windowId, groupId: tab.groupId });
  } else {
    const sel = await browser.tabs.query({ windowId, highlighted: true });
    const useSelection = sel.length > 1 && (mode === "hotkey" || sel.some((t) => t.id === tab.id));
    tabs = useSelection ? sel : [tab];
  }
  tabs.sort((a, b) => a.index - b.index);

  const isGroup = mode === "menu-group" || tabs.length > 1;
  if (!isGroup) {
    const dup = urlIndex.get(tab.url);
    if (dup) {
      endJob(job);
      toastDuplicate(tab.id, ymd(dup));
      return;
    }
  }

  const captured = tabs.map(captureTab);
  const draft = isGroup
    ? { type: "group", name: group?.title || "", color: group?.color || null, tabs: captured }
    : { type: "tab", ...captured[0] };
  const request = {
    windowId,
    tabIds: tabs.map((t) => t.id),
    draft,
    needName: isGroup && !draft.name,
    needNote: settings.notePrompt,
  };

  if (!request.needName && !request.needNote) {
    endJob(job);
    await commit(request, { name: "", note: "" });
    return;
  }

  if (!(await openedPromise)) {
    // No popup: save without a note (an unnamed group gets today's date).
    endJob(job);
    await commit(request, { name: "", note: "" });
    return;
  }

  if (job.state === "closed") return; // popup was closed before the data was ready
  job.request = request;
  job.state = "ready";
  job.port?.postMessage({ type: "prompt", needName: request.needName, needNote: request.needNote });
}

/** Forget the job and close its popup if one is open. */
function endJob(job) {
  job.state = "closed";
  jobs.delete(job.id);
  job.port?.postMessage({ type: "done" });
}

function clearPopup() {
  browser.browserAction.setPopup({ popup: "" });
}

browser.runtime.onConnect.addListener((port) => {
  const match = /^prompt:(\d+)$/.exec(port.name);
  if (!match) return;
  const job = jobs.get(Number(match[1]));
  if (!job) {
    port.postMessage({ type: "done" });
    return;
  }
  job.port = port;
  job.onConnected(true);
  if (job.state === "ready") {
    port.postMessage({ type: "prompt", needName: job.request.needName, needNote: job.request.needNote });
  }
  port.onMessage.addListener(async (msg) => {
    if (job.state !== "ready") return;
    endJob(job);
    // The popup echoes the tab id it was opened for, so the right tab is archived.
    if (msg.type === "commit" && (job.tabId == null || msg.tabId === job.tabId)) {
      await commit(job.request, msg).catch((err) => console.error("Browser Tab Archive: archive failed", err));
    }
  });
  // Closing the popup by any means (Esc, clicking away, switching tabs) cancels.
  port.onDisconnect.addListener(() => {
    clearPopup();
    if (jobs.get(job.id) === job) endJob(job);
  });
});

/** Tab data at trigger time. The favicon is fetched in the background and filled in at save. */
function captureTab(tab) {
  prefetchFavicon(tab.favIconUrl);
  return {
    title: tab.title || tab.url,
    url: tab.url,
    favIconUrl: tab.favIconUrl || null,
    containerId: tab.cookieStoreId && tab.cookieStoreId !== "firefox-default" ? tab.cookieStoreId : null,
  };
}

const favResolved = new Map(); // favIconUrl -> data URL | null
const favInflight = new Map(); // favIconUrl -> Promise

function prefetchFavicon(src) {
  if (!src || favResolved.has(src) || favInflight.has(src)) return;
  if (favResolved.size > 300) favResolved.clear();
  const p = faviconData(src).then((d) => {
    favResolved.set(src, d);
    favInflight.delete(src);
    return d;
  });
  favInflight.set(src, p);
}

async function resolveFavicon(src) {
  if (!src) return null;
  if (favResolved.has(src)) return favResolved.get(src);
  return favInflight.get(src) ?? faviconData(src);
}

/** Replace raw favicon URLs with data URLs. `wait` false = only what is already fetched. */
async function finishTab(t, wait) {
  const { favIconUrl, ...rest } = t;
  const favicon = wait ? await resolveFavicon(favIconUrl) : favResolved.get(favIconUrl) ?? null;
  return { ...rest, favicon };
}

/** Store the favicon inline as a data URL so it survives offline. */
async function faviconData(src) {
  if (!src) return null;
  if (src.startsWith("data:")) return src.length < 200000 ? src : null;
  if (!/^https?:/.test(src)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(src, { signal: ctrl.signal, credentials: "omit" });
    clearTimeout(t);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > 100000) return null;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function uniqueGroupName(name) {
  const taken = new Set((await db.getAll()).filter((e) => e.type === "group").map((e) => e.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

/** Save the entry, close its tabs, show the toast. */
async function commit(request, { name, note }) {
  const { draft } = request;
  const entry = { id: uuid(), archivedAt: new Date().toISOString(), note: (note || "").trim() };
  if (draft.type === "group") {
    Object.assign(entry, {
      type: "group",
      name: await uniqueGroupName((name || "").trim() || draft.name || ymd()),
      color: draft.color,
      tabs: await Promise.all(draft.tabs.map((t) => finishTab(t, false))),
    });
  } else {
    Object.assign(entry, await finishTab(draft, false), { type: "tab" });
  }
  await db.put(entry);
  await browser.tabs.remove(request.tabIds).catch(() => {});
  toastArchived(request.windowId);
  afterChange();
  mirrorAdd([entry], settings);
  fillMissingFavicons(entry, draft);
}

/** Favicons still loading at save time are added to the entry once they arrive. */
async function fillMissingFavicons(entry, draft) {
  const rawTabs = draft.type === "group" ? draft.tabs : [draft];
  const savedTabs = entry.type === "group" ? entry.tabs : [entry];
  let changed = false;
  for (const [i, t] of savedTabs.entries()) {
    if (t.favicon || !rawTabs[i].favIconUrl) continue;
    t.favicon = await resolveFavicon(rawTabs[i].favIconUrl);
    if (t.favicon) changed = true;
  }
  const current = changed ? await db.get(entry.id) : null;
  if (current) {
    if (entry.type === "group") current.tabs = entry.tabs;
    else current.favicon = entry.favicon;
    await db.put(current);
    broadcast();
  }
}

// ---------- reopening ----------

async function createTab(t, windowId, active) {
  const props = { windowId, active };
  if (!/^about:(newtab|home|blank)$/.test(t.url)) props.url = t.url;
  if (t.containerId) {
    try {
      return await browser.tabs.create({ ...props, cookieStoreId: t.containerId });
    } catch {
      // container removed since; fall through
    }
  }
  try {
    return await browser.tabs.create(props);
  } catch (err) {
    console.warn("Browser Tab Archive: cannot open", t.url, err);
    return null;
  }
}

async function openEntry(id, windowId, tabIndex) {
  const entry = await db.get(id);
  if (!entry) return;
  if (entry.type === "tab") return void (await createTab(entry, windowId, true));
  if (tabIndex != null) return void (await createTab(entry.tabs[tabIndex], windowId, true));

  const created = [];
  for (const [i, t] of entry.tabs.entries()) {
    const tab = await createTab(t, windowId, i === 0);
    if (tab) created.push(tab.id);
  }
  if (!created.length) return;
  const groupId = await browser.tabs.group({ tabIds: created, createProperties: { windowId } });
  const update = { title: entry.name };
  if (entry.color) update.color = entry.color;
  await browser.tabGroups.update(groupId, update);
}

// ---------- import ----------

function validEntry(e) {
  if (!e || typeof e.id !== "string" || typeof e.archivedAt !== "string") return false;
  if (e.type === "tab") return typeof e.url === "string";
  if (e.type === "group") return typeof e.name === "string" && Array.isArray(e.tabs);
  return false;
}

async function importEntries(payload) {
  const list = Array.isArray(payload) ? payload : payload?.entries;
  if (!Array.isArray(list)) throw new Error("This file is not a Browser Tab Archive export.");
  const existing = await db.getAll();
  const ids = new Set(existing.map((e) => e.id));
  const added = [];
  let skipped = 0;
  for (const e of list) {
    if (!validEntry(e) || ids.has(e.id) || (e.type === "tab" && urlIndex.has(e.url))) {
      skipped++;
      continue;
    }
    ids.add(e.id);
    added.push({ note: "", ...e });
  }
  if (added.length) {
    await db.putMany(added);
    afterChange();
    mirrorAdd(added, settings);
  }
  return { added: added.length, skipped };
}

// ---------- listeners ----------

browser.commands.onCommand.addListener((name, tab) => {
  if (name === "archive-tab") trigger("hotkey", tab);
});

browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

function createMenus() {
  browser.menus.removeAll().then(() => {
    browser.menus.create({
      id: "archive-tab",
      title: "Archive tab",
      contexts: ["tab"],
      icons: { 16: "icons/icon-menu.svg" },
    });
    browser.menus.create({
      id: "archive-group",
      title: "Archive group",
      contexts: ["tab"],
      visible: false,
    });
  });
}

// A persistent MV2 background page creates its menus every time it loads.
createMenus();

browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    browser.tabs.create({ url: browser.runtime.getURL("options/options.html?welcome=1") });
  }
});

browser.menus.onShown.addListener(async (info, tab) => {
  if (!info.contexts.includes("tab") || !tab) return;
  const inGroup = tab.groupId != null && tab.groupId !== -1;
  const sel = tab.highlighted ? await browser.tabs.query({ windowId: tab.windowId, highlighted: true }) : [tab];
  const group = inGroup ? await browser.tabGroups.get(tab.groupId).catch(() => null) : null;
  menuContext = { tabId: tab.id, group };
  browser.menus.update("archive-tab", { title: sel.length > 1 ? `Archive ${sel.length} tabs` : "Archive tab" });
  browser.menus.update("archive-group", { visible: inGroup });
  browser.menus.refresh();
});

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "archive-tab") trigger("menu-tab", tab);
  if (info.menuItemId === "archive-group") trigger("menu-group", tab);
});

browser.runtime.onMessage.addListener((msg) => {
  switch (msg?.type) {
    case "list":
      return db.getAll();
    case "updateNote":
      return (async () => {
        const entry = await db.get(msg.id);
        if (!entry) return;
        entry.note = (msg.note || "").trim();
        await db.put(entry);
        afterChange();
        mirrorUpdate(entry, settings);
      })();
    case "delete":
      return (async () => {
        await db.remove(msg.id);
        afterChange();
        mirrorRemove(msg.id, settings);
      })();
    case "open":
      return openEntry(msg.id, msg.windowId, msg.tabIndex);
    case "export":
      return db.getAll().then(exportPayload);
    case "import":
      return importEntries(msg.payload);
    case "rebuildMirror":
      return (async () => {
        await loadSettings();
        await mirrorRebuild(await db.getAll(), settings);
      })();
  }
});
