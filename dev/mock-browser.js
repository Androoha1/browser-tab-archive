// Fake WebExtension API for previewing the sidebar and settings page in a
// normal browser. Not part of the extension package.
// URL params: ?empty=1; popup page: ?prompt=tab | group | name

const params = new URLSearchParams(location.search);
const day = (d) => new Date(`${d}T12:00:00`).toISOString();

let entries = params.has("empty")
  ? []
  : [
      { id: "1", type: "tab", title: "Async Rust book: pinning", url: "https://rust-lang.github.io/async-book/", note: "Read chapter 4 later", archivedAt: day("2026-11-16") },
      {
        id: "2", type: "group", name: "Trip to Lisbon", color: "green", note: "Flights and hotels", archivedAt: day("2026-11-15"),
        tabs: [
          { title: "Flights to Lisbon", url: "https://flights.example.com/lis" },
          { title: "Guesthouse in Alfama", url: "https://guesthouse.example.com" },
          { title: "Lisbon city guide", url: "https://lisbon.example.com" },
          { title: "Weather in Lisbon, December", url: "https://weather.example.com/lisbon" },
          { title: "Tram 28 route map", url: "https://tram28.example.com" },
        ],
      },
      {
        id: "3", type: "group", name: "Extension research", color: "purple", note: "", archivedAt: day("2026-11-14"),
        tabs: [
          { title: "WebExtensions API", url: "https://developer.mozilla.org/docs/Mozilla/Add-ons" },
          { title: "sidebarAction", url: "https://developer.mozilla.org/sidebarAction" },
          { title: "Kafka streams intro", url: "https://kafka.example.com" },
        ],
      },
      { id: "4", type: "tab", title: "MDN: tabGroups API", url: "https://developer.mozilla.org/tabGroups", note: "For the extension", archivedAt: day("2026-11-12") },
      { id: "5", type: "tab", title: "Show HN: a terminal for notes", url: "https://news.ycombinator.com/item?id=1", note: "", archivedAt: day("2026-11-03") },
      { id: "6", type: "tab", title: "CSS container queries guide", url: "https://css.example.com/container", note: "Try on the portfolio site", archivedAt: day("2026-10-28") },
      { id: "7", type: "tab", title: "Talk: designing calm interfaces", url: "https://youtube.com/watch?v=x", note: "", archivedAt: day("2026-10-19") },
    ];

const prompts = {
  tab: { needName: false, needNote: true },
  group: { needName: true, needNote: true },
  name: { needName: true, needNote: false },
};

const listeners = [];
let store = { settings: { mirror: params.has("mirror") } };

globalThis.browser = {
  runtime: {
    id: "mock",
    getURL: (p) => p,
    getPlatformInfo: async () => ({ os: "mac" }),
    getBrowserInfo: async () => ({ name: "Firefox", version: "160.0" }),
    openOptionsPage: async () => console.log("openOptionsPage"),
    onMessage: { addListener: (fn) => listeners.push(fn) },
    connect() {
      const handlers = [];
      const req = prompts[params.get("prompt") || "tab"];
      setTimeout(() => handlers.forEach((fn) => fn({ type: "prompt", ...req })), 50);
      return {
        onMessage: { addListener: (fn) => handlers.push(fn) },
        postMessage: (m) => console.log("port.postMessage", m),
      };
    },
    async sendMessage(msg) {
      console.log("sendMessage", msg);
      switch (msg.type) {
        case "list":
          return structuredClone(entries);
        case "updateNote":
          entries.find((e) => e.id === msg.id).note = msg.note.trim();
          return;
        case "delete":
          entries = entries.filter((e) => e.id !== msg.id);
          return;
        case "export":
          return { format: "tab-archive", version: 1, entries };
        case "import":
          return { added: 0, skipped: msg.payload.entries?.length || 0 };
      }
    },
  },
  windows: { getCurrent: async () => ({ id: 1 }) },
  commands: {
    getAll: async () => [
      { name: "archive-tab", shortcut: "Command+Period" },
      { name: "_execute_sidebar_action", shortcut: "Command+Shift+Comma" },
    ],
  },
  sidebarAction: { setTitle: async () => {}, isOpen: async () => true },
  storage: {
    local: {
      get: async (k) => ({ [k]: store[k] }),
      set: async (o) => Object.assign(store, o),
    },
  },
  permissions: {
    contains: async () => true,
    request: async () => true,
  },
};
