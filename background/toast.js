// Feedback pill shown at the top center of the newly active page.
// Falls back to a system notification when the page blocks content scripts
// (about: pages, addons.mozilla.org, PDF viewer, reader view).

/** Runs inside the page. Must be self-contained. */
function showPill(kind, text, holdMs) {
  const ID = "tab-archive-toast-host";
  document.getElementById(ID)?.remove();
  const host = document.createElement("div");
  host.id = ID;
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "closed" });
  const check =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  const warn =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.9 14.6 13.6H1.4z"/><path d="M8 6.2v3.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r=".25" fill="currentColor"/></svg>';
  root.innerHTML = `
    <style>
      .pill {
        position: absolute; top: 16px; left: 50%;
        transform: translate(-50%, -8px); opacity: 0;
        transition: opacity .2s ease, transform .2s ease;
        display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 16px 7px 13px; border-radius: 999px;
        font: message-box; font-size: 13px; font-weight: 600; line-height: 18px;
        white-space: nowrap; box-shadow: 0 2px 8px rgba(21,20,26,.2);
      }
      .pill.in { opacity: 1; transform: translate(-50%, 0); }
      .ok { background: #15141a; color: #fbfbfe; }
      .ok .icon { color: #b5f0b5; }
      .warn { background: #fff4d0; color: #15141a; border: 1px solid #f3dc8f; }
      .warn .icon { color: #9c5200; }
      .icon { display: flex; }
      @media (prefers-color-scheme: dark) {
        .ok { background: #fbfbfe; color: #15141a; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
        .ok .icon { color: #007700; }
        .warn { background: #592b00; color: #fbfbfe; border-color: #7a4400; }
        .warn .icon { color: #ffe699; }
      }
    </style>
    <div class="pill ${kind === "ok" ? "ok" : "warn"}" role="status">
      <span class="icon">${kind === "ok" ? check : warn}</span><span></span>
    </div>`;
  const pill = root.querySelector(".pill");
  pill.lastElementChild.textContent = text;
  (document.body || document.documentElement).appendChild(host);
  requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.add("in")));
  setTimeout(() => {
    pill.classList.remove("in");
    setTimeout(() => host.remove(), 250);
  }, holdMs);
}

async function injectInto(tabId, kind, text, holdMs) {
  await browser.scripting.executeScript({
    target: { tabId },
    func: showPill,
    args: [kind, text, holdMs],
  });
}

function notify(text) {
  return browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon.svg"),
    title: "Tab Archive",
    message: text,
  });
}

/** Wait briefly for Firefox to pick the next active tab after a close. */
async function activeTab(windowId) {
  await new Promise((r) => setTimeout(r, 120));
  try {
    const [tab] = await browser.tabs.query({ active: true, windowId });
    if (tab) return tab;
  } catch {
    // window closed with its last tab
  }
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

export async function toastArchived(windowId) {
  const tab = await activeTab(windowId);
  try {
    await injectInto(tab.id, "ok", "Archived", 1000);
  } catch {
    notify("Archived");
  }
}

export async function toastDuplicate(tabId, date) {
  const text = `Already archived on ${date}`;
  try {
    await injectInto(tabId, "warn", text, 2000);
  } catch {
    notify(text);
  }
}
