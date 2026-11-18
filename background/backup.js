// Automatic JSON backups to Downloads/browser-tab-archive/backup-1.json … backup-5.json.
// Runs about 5 seconds after the last change, so a burst of changes saves once.

const DEBOUNCE_MS = 5000;
const SLOTS = 5;
let timer = null;

export function exportPayload(entries) {
  return {
    format: "browser-tab-archive",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

export function scheduleBackup(getEntries, isEnabled) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!(await isEnabled())) return;
    try {
      await writeBackup(await getEntries());
    } catch (err) {
      console.error("Browser Tab Archive: backup failed", err);
    }
  }, DEBOUNCE_MS);
}

async function writeBackup(entries) {
  const { backupSlot = 0 } = await browser.storage.local.get("backupSlot");
  const slot = (backupSlot % SLOTS) + 1;
  const blob = new Blob([JSON.stringify(exportPayload(entries), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    // saveAs: false keeps "Always ask where to save files" from showing a dialog.
    const id = await browser.downloads.download({
      url,
      filename: `browser-tab-archive/backup-${slot}.json`,
      conflictAction: "overwrite",
      saveAs: false,
    });
    await browser.storage.local.set({ backupSlot: slot });
    await waitForDownload(id);
    // Keep backups out of the downloads panel. The file stays on disk.
    await browser.downloads.erase({ id });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

function waitForDownload(id) {
  return new Promise((resolve) => {
    const listener = (delta) => {
      if (delta.id !== id || !delta.state) return;
      if (delta.state.current === "complete" || delta.state.current === "interrupted") {
        browser.downloads.onChanged.removeListener(listener);
        resolve();
      }
    };
    browser.downloads.onChanged.addListener(listener);
    setTimeout(() => {
      browser.downloads.onChanged.removeListener(listener);
      resolve();
    }, 15000);
  });
}
