// Settings for `npm run dev` (web-ext run). See README > Testing changes.
export default {
  ignoreFiles: ["dev/**", "scripts/**", "dist/**", "releases/**", "node_modules/**", "web-ext-config.mjs"],
  run: {
    // A copy of this profile is used on every run; it pins the toolbar button.
    firefoxProfile: "dev/firefox-profile",
    // Open real web pages: Firefox's own pages (like a new tab) can't show the "Archived" pill.
    startUrl: ["https://example.com/", "https://www.mozilla.org/"],
  },
};
