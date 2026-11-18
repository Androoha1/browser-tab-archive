import { icons, letterTile } from "../lib/icons.js";
import { ymd, searchText, entryUrls, formatShortcut, GROUP_COLORS } from "../lib/util.js";

// Outside Firefox (design preview in a normal browser) load a fake API.
if (!globalThis.browser?.runtime?.id) await import("../dev/mock-browser.js");

const $ = (id) => document.getElementById(id);
const send = (msg) => browser.runtime.sendMessage(msg);

const state = {
  windowId: null,
  entries: [],
  query: "",
  expanded: new Set(),
  editingId: null,
  confirmingId: null,
};

// ---------- tiny DOM helper ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v; // only ever used with our own icon markup
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const iconButton = (icon, label, onclick) =>
  h("button", { class: "icon-button", title: label, "aria-label": label, html: icon, onclick });

function keyHints(parts) {
  const out = [];
  parts.forEach(([key, text], i) => {
    if (i) out.push(h("span", { class: "sep" }, "·"));
    out.push(h("span", { class: "key" }, key), document.createTextNode(text));
  });
  return out;
}

// ---------- favicon ----------

function favicon(t) {
  const tile = () => {
    const { letter, color } = letterTile(t.title, t.url);
    return h("span", { class: "tile", style: `background:${color}` }, letter);
  };
  if (!t.favicon) return tile();
  const img = h("img", { class: "favicon", src: t.favicon, alt: "" });
  img.addEventListener("error", () => img.replaceWith(tile()), { once: true });
  return img;
}

// ---------- list ----------

function matches(entry, q) {
  return !q || searchText(entry).includes(q);
}

function childMatches(entry, q) {
  if (!q || entry.type !== "group") return false;
  const own = `${entry.name}\n${entry.note || ""}`.toLowerCase();
  return !own.includes(q) && entry.tabs.some((t) => `${t.title}\n${t.url}`.toLowerCase().includes(q));
}

function render() {
  const q = state.query.trim().toLowerCase();
  const visible = state.entries.filter((e) => matches(e, q));
  $("clear").hidden = !state.query;
  $("empty").hidden = state.entries.length > 0;
  $("nomatch").hidden = !(state.entries.length && !visible.length);
  $("nomatch-title").textContent = `No matches for “${state.query.trim()}”`;

  const list = $("list");
  const editHadFocus = document.activeElement?.classList.contains("edit-field");
  list.replaceChildren(...visible.map((e) => (e.id === state.confirmingId ? confirmRow(e) : entryRow(e, q))));
  list.hidden = !visible.length;

  // Focus the note field when editing starts, or keep it there across a refresh.
  const field = list.querySelector(".edit-field");
  if (field && (state.focusEdit || editHadFocus)) {
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }
  state.focusEdit = false;
}

function entryRow(entry, q) {
  const isGroup = entry.type === "group";
  const editing = state.editingId === entry.id;
  const expanded = isGroup && (state.expanded.has(entry.id) || childMatches(entry, q));

  const lead = isGroup
    ? h("span", { class: "lead" },
        h("button", {
          class: "chevron",
          tabindex: "-1",
          "aria-label": expanded ? "Collapse group" : "Expand group",
          html: expanded ? icons.chevronDown : icons.chevronRight,
          onclick: (e) => { e.stopPropagation(); toggle(entry.id); },
        }))
    : h("span", { class: "lead" }, favicon(entry));

  const titleLine = isGroup
    ? h("div", { class: "title-line" },
        h("span", { class: "dot", style: `background:${GROUP_COLORS[entry.color] || GROUP_COLORS.grey}` }),
        h("span", { class: "title" }, entry.name),
        h("span", { class: "count" }, `${entry.tabs.length} ${entry.tabs.length === 1 ? "tab" : "tabs"}`))
    : h("div", { class: "title-line" }, h("span", { class: "title", title: entry.url }, entry.title || entry.url));

  let below = null;
  if (editing) {
    const field = h("input", {
      class: "text-field edit-field",
      value: state.editDraft ?? entry.note ?? "",
      placeholder: "Add a note",
      "aria-label": "Note",
      oninput: (e) => (state.editDraft = e.target.value),
      onkeydown: (e) => {
        if (e.isComposing) return;
        if (e.key === "Enter") { e.preventDefault(); saveNote(entry.id, field.value); }
        if (e.key === "Escape") { e.preventDefault(); state.editingId = null; render(); }
      },
      onclick: (e) => e.stopPropagation(),
    });
    below = [field, h("p", { class: "hints" }, keyHints([["Esc", "to cancel"], ["Enter", "to save"]]))];
  } else if (entry.note) {
    below = h("p", { class: "note" }, entry.note);
  }

  const copyBtn = iconButton(icons.copy, isGroup ? "Copy URLs" : "Copy URL", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(entryUrls(entry).join("\n"));
    copyBtn.innerHTML = icons.check;
    setTimeout(() => (copyBtn.innerHTML = icons.copy), 1000);
  });

  const row = h("div", {
      class: `row${isGroup ? " group" : ""}${editing ? " editing" : ""}`,
      tabindex: "0",
      onclick: () => (isGroup ? toggle(entry.id) : open(entry.id)),
      onkeydown: (e) => {
        if (e.target !== row) return;
        if (e.key === "Enter") isGroup ? toggle(entry.id) : open(entry.id);
        if (e.key === "Delete" || e.key === "Backspace") askDelete(entry.id);
      },
    },
    lead,
    h("div", { class: "main" }, titleLine, below),
    h("span", { class: "date" }, ymd(entry.archivedAt)),
    h("div", { class: "actions" },
      iconButton(icons.open, isGroup ? "Open group" : "Open", (e) => { e.stopPropagation(); open(entry.id); }),
      iconButton(icons.edit, "Edit note", (e) => { e.stopPropagation(); startEdit(entry.id); }),
      copyBtn,
      iconButton(icons.trash, "Delete", (e) => { e.stopPropagation(); askDelete(entry.id); })));

  if (!expanded) return h("li", {}, row);

  const children = h("ul", { class: "children", role: "list" },
    entry.tabs.map((t, i) => {
      const child = h("li", {
          class: "row child",
          tabindex: "0",
          title: t.url,
          onclick: () => open(entry.id, i),
          onkeydown: (e) => e.key === "Enter" && open(entry.id, i),
        },
        h("span", { class: "lead" }, favicon(t)),
        h("div", { class: "main" }, h("span", { class: "title", style: "display:block" }, t.title || t.url)));
      return child;
    }));
  return h("li", {}, row, children);
}

function confirmRow(entry) {
  const label = entry.type === "group" ? entry.name : entry.title || entry.url;
  const cancel = h("button", { class: "btn", onclick: () => { state.confirmingId = null; render(); } }, "Cancel");
  const del = h("button", { class: "btn destructive", onclick: () => remove(entry.id) }, "Delete");
  const box = h("li", {
      class: "confirm",
      role: "alertdialog",
      onkeydown: (e) => { if (e.key === "Escape") { state.confirmingId = null; render(); } },
    },
    h("h3", {}, `Delete “${label}”?`),
    h("p", {}, "This can’t be undone."),
    h("div", { class: "buttons" }, cancel, del));
  queueMicrotask(() => del.focus());
  return box;
}

// ---------- actions ----------

function toggle(id) {
  state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
  render();
}

function open(id, tabIndex) {
  send({ type: "open", id, tabIndex, windowId: state.windowId });
}

function startEdit(id) {
  state.editingId = id;
  state.editDraft = null;
  state.focusEdit = true;
  state.confirmingId = null;
  render();
}

async function saveNote(id, note) {
  state.editingId = null;
  const entry = state.entries.find((e) => e.id === id);
  if (entry) entry.note = note.trim();
  render();
  await send({ type: "updateNote", id, note });
}

function askDelete(id) {
  state.confirmingId = id;
  state.editingId = null;
  render();
}

async function remove(id) {
  state.confirmingId = null;
  state.entries = state.entries.filter((e) => e.id !== id);
  render();
  await send({ type: "delete", id });
}

async function reload() {
  state.entries = (await send({ type: "list" })) || [];
  render();
}

// ---------- wiring ----------

$("clear").innerHTML = icons.close;
document.querySelector(".footer-icon").innerHTML = icons.settings;
document.querySelector(".search-icon").innerHTML = icons.search;
document.querySelector(".state-icon").innerHTML = icons.archive;

$("settings").addEventListener("click", () => browser.runtime.openOptionsPage());

$("search").addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
});
$("search").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.query) {
    e.preventDefault();
    e.target.value = state.query = "";
    render();
  }
});
$("clear").addEventListener("click", (e) => {
  e.preventDefault();
  $("search").value = state.query = "";
  render();
  $("search").focus();
});

// Not async on purpose: a listener that returns a promise counts as a reply in
// Firefox and could answer messages meant for the background script.
browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "changed") reload();
});

async function showShortcuts() {
  try {
    const [commands, platform] = await Promise.all([browser.commands.getAll(), browser.runtime.getPlatformInfo()]);
    const archive = commands.find((c) => c.name === "archive-tab");
    const label = formatShortcut(archive?.shortcut, platform.os === "mac");
    for (const el of document.querySelectorAll('[data-shortcut="archive-tab"]')) {
      if (label) el.textContent = label;
      else el.replaceWith("your archive shortcut");
    }
  } catch {}
}

// Firefox's sidebar header is shared by all sidebar extensions, and any of
// them can overwrite it at any time, even when its panel isn't showing.
// Bitwarden rewrites its title after tab switches and page loads. We can't see
// those writes, so while this panel is open we write our title back on every
// frame; a foreign title never lasts long enough to be drawn. Firefox doesn't
// run animation frames while the sidebar is hidden.
// Mozilla fixed this in Firefox 161 (bug 2085952), so it only runs on older versions.
const HEADER_FIX_VERSION = 161;
let panelOpen = false;
async function checkPanelOpen() {
  panelOpen = await browser.sidebarAction.isOpen({ windowId: state.windowId });
}
function claimHeader() {
  if (panelOpen) browser.sidebarAction.setTitle({ title: "Browser Tab Archive", windowId: state.windowId });
  requestAnimationFrame(claimHeader);
}

(async function init() {
  state.windowId = (await browser.windows.getCurrent()).id;
  const { version } = await browser.runtime.getBrowserInfo();
  if (parseInt(version, 10) < HEADER_FIX_VERSION) {
    await checkPanelOpen();
    setInterval(checkPanelOpen, 500);
    claimHeader();
  }
  showShortcuts();
  await reload();
})();
