// Feedback pill shown at the top center of the newly active page.
//
// The styles go in with scripting.insertCSS as a user stylesheet: unlike a
// <style> element, that isn't blocked by the page's Content Security Policy,
// and !important user rules win over the page's own CSS. The element itself is
// built with DOM calls only (no innerHTML).
//
// Firefox doesn't let extensions touch its own pages (new tab, about: pages,
// addons.mozilla.org, PDF viewer, reader view). There the toolbar button shows
// a badge for a moment, plus a system notification.

const HOST_ID = "browser-tab-archive-toast";

const CSS = `
#${HOST_ID} {
  all: initial !important;
  position: fixed !important; top: 16px !important; left: 50% !important;
  z-index: 2147483647 !important; pointer-events: none !important;
  transform: translate(-50%, -8px) !important; opacity: 0 !important;
  transition: opacity .2s ease, transform .2s ease !important;
  display: inline-flex !important; align-items: center !important; gap: 8px !important;
  padding: 7px 16px 7px 13px !important; border-radius: 999px !important;
  font: message-box !important; font-size: 13px !important; font-weight: 600 !important;
  line-height: 18px !important; white-space: nowrap !important;
  box-shadow: 0 2px 8px rgba(21,20,26,.2) !important;
  background: #15141a !important; color: #fbfbfe !important; border: 0 !important;
}
#${HOST_ID}.in { opacity: 1 !important; transform: translate(-50%, 0) !important; }
#${HOST_ID} svg {
  display: block !important; width: 16px !important; height: 16px !important;
  margin: 0 !important; padding: 0 !important; color: #b5f0b5 !important;
  fill: none !important; stroke: currentColor !important;
  background: none !important; border: 0 !important; box-shadow: none !important;
  opacity: 1 !important; visibility: visible !important; filter: none !important;
}
#${HOST_ID} svg path { fill: none !important; stroke: currentColor !important; }
#${HOST_ID} svg circle { fill: currentColor !important; stroke: currentColor !important; }
#${HOST_ID} span { all: initial !important; font: inherit !important; color: inherit !important; }
#${HOST_ID}.warn { background: #fff4d0 !important; color: #15141a !important; border: 1px solid #f3dc8f !important; }
#${HOST_ID}.warn svg { color: #9c5200 !important; }
@media (prefers-color-scheme: dark) {
  #${HOST_ID} { background: #fbfbfe !important; color: #15141a !important; box-shadow: 0 2px 8px rgba(0,0,0,.4) !important; }
  #${HOST_ID} svg { color: #007700 !important; }
  #${HOST_ID}.warn { background: #592b00 !important; color: #fbfbfe !important; border-color: #7a4400 !important; }
  #${HOST_ID}.warn svg { color: #ffe699 !important; }
}`;

/** Runs inside the page. Must be self-contained. */
function showPill(hostId, kind, text, holdMs) {
  document.getElementById(hostId)?.remove();
  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  const svg = el("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" });
  if (kind === "ok") {
    svg.setAttribute("stroke-width", "1.5");
    svg.append(el("path", { d: "M3 8.5l3.2 3L13 4.5" }));
  } else {
    svg.setAttribute("stroke-width", "1.3");
    svg.append(el("path", { d: "M8 1.9 14.6 13.6H1.4z" }), el("path", { d: "M8 6.2v3.6" }), el("circle", { cx: "8", cy: "11.6", r: ".25", fill: "currentColor" }));
  }
  const label = document.createElement("span");
  label.textContent = text;
  const pill = document.createElement("div");
  pill.id = hostId;
  pill.setAttribute("role", "status");
  if (kind !== "ok") pill.className = "warn";
  pill.append(svg, label);
  (document.body || document.documentElement).append(pill);
  requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.add("in")));
  setTimeout(() => {
    pill.classList.remove("in");
    setTimeout(() => pill.remove(), 250);
  }, holdMs);
}

async function injectInto(tabId, kind, text, holdMs) {
  const css = { target: { tabId }, css: CSS, origin: "USER" };
  await browser.scripting.insertCSS(css);
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: showPill,
      args: [HOST_ID, kind, text, holdMs],
    });
  } finally {
    setTimeout(() => browser.scripting.removeCSS(css).catch(() => {}), holdMs + 400);
  }
}

/** Fallback for pages extensions can't touch. */
function fallback(windowId, kind, text, holdMs) {
  const badge = { text: kind === "ok" ? "✓" : "!", windowId };
  browser.browserAction.setBadgeBackgroundColor({ color: kind === "ok" ? "#2ac3a2" : "#ffa436", windowId });
  browser.browserAction.setBadgeText(badge);
  setTimeout(() => browser.browserAction.setBadgeText({ text: "", windowId }), holdMs + 1000);
  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon.svg"),
    title: "Browser Tab Archive",
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
    fallback(tab?.windowId, "ok", "Archived", 1000);
  }
}

export async function toastDuplicate(tabId, date) {
  const text = `Already archived on ${date}`;
  try {
    await injectInto(tabId, "warn", text, 2000);
  } catch {
    const tab = await browser.tabs.get(tabId).catch(() => null);
    fallback(tab?.windowId, "warn", text, 2000);
  }
}
