import { icons } from "../lib/icons.js";
import { DEFAULT_SETTINGS, ymd, formatShortcut } from "../lib/util.js";

if (!globalThis.browser?.runtime?.id) await import("../dev/mock-browser.js");

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS };

for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = icons[el.dataset.icon];
$("month-example").textContent = ymd().slice(0, 7);
$("welcome").hidden = !new URLSearchParams(location.search).has("welcome");

async function load() {
  const { settings: s } = await browser.storage.local.get("settings");
  settings = { ...DEFAULT_SETTINGS, ...(s || {}) };
  // The mirror only counts as on when Firefox actually granted the permission.
  if (settings.mirror && !(await browser.permissions.contains({ permissions: ["bookmarks"] }))) {
    settings.mirror = false;
  }
  $("notePrompt").checked = settings.notePrompt;
  $("backups").checked = settings.backups;
  $("mirror").checked = settings.mirror;
  $("mirrorLocation").value = settings.mirrorLocation;
  $("mirrorFolder").value = settings.mirrorFolder;
  document.querySelector(`input[name=mirrorMonthly][value=${settings.mirrorMonthly ? "monthly" : "flat"}]`).checked = true;
  $("mirror-options").hidden = !settings.mirror;
}

function save(patch) {
  settings = { ...settings, ...patch };
  return browser.storage.local.set({ settings });
}

$("notePrompt").addEventListener("change", (e) => save({ notePrompt: e.target.checked }));
$("backups").addEventListener("change", (e) => save({ backups: e.target.checked }));

$("mirror").addEventListener("change", async (e) => {
  const on = e.target.checked;
  if (on) {
    // Must be requested straight from the click, before any other await.
    const granted = await browser.permissions.request({ permissions: ["bookmarks"] });
    if (!granted) {
      e.target.checked = false;
      return;
    }
  }
  $("mirror-options").hidden = !on;
  await save({ mirror: on });
});

$("mirrorLocation").addEventListener("change", (e) => save({ mirrorLocation: e.target.value }));
$("mirrorFolder").addEventListener("change", (e) => {
  const name = e.target.value.trim() || "Archive";
  e.target.value = name;
  save({ mirrorFolder: name });
});
for (const radio of document.querySelectorAll("input[name=mirrorMonthly]")) {
  radio.addEventListener("change", () => save({ mirrorMonthly: radio.value === "monthly" }));
}

// ---------- export / import ----------

const status = (text) => ($("data-status").textContent = text);

$("export").addEventListener("click", async () => {
  const payload = await browser.runtime.sendMessage({ type: "export" });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `tab-archive-${ymd()}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  status(`Exported ${payload.entries.length} ${payload.entries.length === 1 ? "entry" : "entries"}.`);
});

$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const { added, skipped } = await browser.runtime.sendMessage({ type: "import", payload });
    status(`Imported ${added} ${added === 1 ? "entry" : "entries"}${skipped ? `, skipped ${skipped} you already had` : ""}.`);
  } catch (err) {
    status(`Could not import this file. ${err.message || ""}`.trim());
  }
});

// ---------- shortcuts ----------

async function showShortcuts() {
  const [commands, platform] = await Promise.all([browser.commands.getAll(), browser.runtime.getPlatformInfo()]);
  for (const el of document.querySelectorAll("[data-shortcut]")) {
    const cmd = commands.find((c) => c.name === el.dataset.shortcut);
    el.textContent = formatShortcut(cmd?.shortcut, platform.os === "mac") || "Not set";
  }
}

$("manage-shortcuts").addEventListener("click", (e) => {
  e.preventDefault();
  if (browser.commands.openShortcutSettings) browser.commands.openShortcutSettings();
  else status("Open about:addons, click the gear icon and choose Manage Extension Shortcuts.");
});

load();
showShortcuts();
