// Small helpers shared by the background script, sidebar and settings page.

export const DEFAULT_SETTINGS = {
  notePrompt: true,
  backups: true,
  mirror: false,
  mirrorLocation: "unfiled_____", // Other Bookmarks
  mirrorFolder: "Archive",
  mirrorMonthly: false,
};

/** Local date as YYYY-MM-DD. */
export function ymd(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function uuid() {
  return crypto.randomUUID();
}

/** Firefox shortcut string ("Command+Period") to display form ("⌘."). */
export function formatShortcut(shortcut, isMac) {
  if (!shortcut) return "";
  const keyNames = { Period: ".", Comma: ",", Space: "Space", Up: "↑", Down: "↓", Left: "←", Right: "→" };
  const parts = shortcut.split("+");
  if (isMac) {
    const mods = { Command: "⌘", MacCtrl: "⌃", Ctrl: "⌘", Alt: "⌥", Shift: "⇧" };
    return parts.map((p) => mods[p] ?? keyNames[p] ?? p).join("");
  }
  return parts.map((p) => keyNames[p] ?? p).join("+");
}

/** Every URL in an entry, in order. */
export function entryUrls(entry) {
  return entry.type === "group" ? entry.tabs.map((t) => t.url) : [entry.url];
}

/** Text that search matches against: titles, notes, URLs, group names, tab titles inside groups. */
export function searchText(entry) {
  const parts = [entry.note || ""];
  if (entry.type === "group") {
    parts.push(entry.name);
    for (const t of entry.tabs) parts.push(t.title, t.url);
  } else {
    parts.push(entry.title, entry.url);
  }
  return parts.join("\n").toLowerCase();
}

/** Firefox tab group colors, as Firefox draws them. */
export const GROUP_COLORS = {
  blue: "#0060df",
  purple: "#9059ff",
  cyan: "#00b3f4",
  orange: "#ff8a50",
  yellow: "#ffbd4f",
  pink: "#ff4aa2",
  green: "#2ac3a2",
  grey: "#8f8f9d",
  red: "#e22850",
};
