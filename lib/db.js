// IndexedDB store for archive entries. Used only by the background script;
// the sidebar and settings page go through runtime messages.

const DB_NAME = "browser-tab-archive";
const STORE = "entries";
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("archivedAt", "archivedAt");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode) {
  const db = await open();
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** All entries, newest first. */
export async function getAll() {
  const all = await done((await tx("readonly")).getAll());
  return all.sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1));
}

export async function get(id) {
  return done((await tx("readonly")).get(id));
}

export async function put(entry) {
  await done((await tx("readwrite")).put(entry));
  return entry;
}

export async function putMany(entries) {
  const db = await open();
  const t = db.transaction(STORE, "readwrite");
  const store = t.objectStore(STORE);
  for (const e of entries) store.put(e);
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

export async function remove(id) {
  await done((await tx("readwrite")).delete(id));
}
