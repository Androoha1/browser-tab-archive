// 16px line icons in the style of Firefox's own (1.25px stroke, currentColor).

const svg = (body, extra = "") =>
  `<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  close: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
  search: svg('<circle cx="7" cy="7" r="4.75"/><path d="M10.5 10.5l3.75 3.75"/>'),
  settings: svg('<path d="M12.80 6.61L14.42 6.98L14.42 9.02L12.80 9.39L12.38 10.41L13.26 11.82L11.82 13.26L10.41 12.38L9.39 12.80L9.02 14.42L6.98 14.42L6.61 12.80L5.59 12.38L4.18 13.26L2.74 11.82L3.62 10.41L3.20 9.39L1.58 9.02L1.58 6.98L3.20 6.61L3.62 5.59L2.74 4.18L4.18 2.74L5.59 3.62L6.61 3.20L6.98 1.58L9.02 1.58L9.39 3.20L10.41 3.62L11.82 2.74L13.26 4.18L12.38 5.59z"/><circle cx="8" cy="8" r="2"/>'),
  open: svg('<path d="M9.5 2.25h4.25V6.5M13.5 2.5 7.5 8.5"/><path d="M12.25 9.5v3.25c0 .55-.45 1-1 1h-8c-.55 0-1-.45-1-1v-8c0-.55.45-1 1-1H6.5"/>'),
  edit: svg('<path d="M10.5 2.75l2.75 2.75L5.5 13.25l-3.5.75.75-3.5z"/>'),
  copy: svg('<rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.25"/><path d="M10.75 5.25V3.5c0-.7-.55-1.25-1.25-1.25h-6c-.7 0-1.25.55-1.25 1.25v6c0 .7.55 1.25 1.25 1.25h1.75"/>'),
  trash: svg(
    '<path d="M2.25 4h11.5M6.25 4V2.75c0-.4.35-.75.75-.75h2c.4 0 .75.35.75.75V4M3.75 4l.7 9.1c.05.5.45.9 1 .9h5.1c.55 0 .95-.4 1-.9l.7-9.1M6.5 6.75v4.5M9.5 6.75v4.5"/>'
  ),
  check: svg('<path d="M3 8.5l3.2 3L13 4.5"/>'),
  chevronRight: svg('<path d="M6 3.5 10.5 8 6 12.5"/>'),
  chevronDown: svg('<path d="M3.5 6 8 10.5 12.5 6"/>'),
  archive: svg('<rect x="1.75" y="2.25" width="12.5" height="3.25" rx=".75"/><path d="M2.75 5.5v7.25c0 .55.45 1 1 1h8.5c.55 0 1-.45 1-1V5.5M6.5 8.5h3"/>'),
  warning: svg('<path d="M8 1.9 14.6 13.6H1.4z"/><path d="M8 6.2v3.6"/><circle cx="8" cy="11.6" r=".3" fill="currentColor"/>'),
  download: svg('<path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.75h11"/>'),
  bookmark: svg('<path d="M4 2.25h8c.4 0 .75.35.75.75v10.75L8 10.75l-4.75 3V3c0-.4.35-.75.75-.75z"/>'),
  file: svg('<path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z"/><path d="M9 1.75V5h3.25"/>'),
  keyboard: svg('<rect x="1.5" y="3.75" width="13" height="8.5" rx="1.25"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6"/>'),
};

/** Colored letter tile, used when a page had no favicon. */
export function letterTile(title, url) {
  const palette = ["#e66000", "#7542e5", "#0062fa", "var(--tile-ink)", "#058b00", "#c50042"];
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  const seed = host || title || "?";
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const letter = ((title || host || "?").trim()[0] || "?").toUpperCase();
  return { letter, color: palette[h % palette.length] };
}
