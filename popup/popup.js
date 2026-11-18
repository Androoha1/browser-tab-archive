// Note prompt shown as the toolbar button's popup. The background script opens
// it for one archive "job" (?job=N&tabId=T) and talks to it over a port, so a
// commit always arrives before the popup's own closing.

import { icons } from "../lib/icons.js";

if (!globalThis.browser?.runtime?.id) await import("../dev/mock-browser.js");

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const job = params.get("job");
const tabId = Number(params.get("tabId"));

for (const el of document.querySelectorAll(".field-icon")) el.innerHTML = icons.archive;

const port = browser.runtime.connect({ name: `prompt:${job}` });
let request = null;
let done = false;

function key(label) {
  const k = document.createElement("span");
  k.className = "key";
  k.textContent = label;
  return k;
}

function hintLine(parts) {
  const out = [];
  parts.forEach(([k, text], i) => {
    if (i) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "·";
      out.push(sep);
    }
    out.push(key(k), document.createTextNode(text));
  });
  return out;
}

function show(req) {
  request = req;
  $("name-wrap").hidden = !req.needName;
  $("note-wrap").hidden = !req.needNote;
  const parts = [];
  if (req.needName && req.needNote) parts.push(["Tab", "next field"]);
  parts.push(["Esc", "to cancel"], ["Enter", "to save"]);
  const hints = hintLine(parts);
  if (req.needName) {
    const extra = document.createElement("span");
    extra.className = "full";
    extra.textContent = "Leave the name empty to use today’s date.";
    hints.push(extra);
  }
  $("hints").replaceChildren(...hints);
  $("prompt").hidden = false;
  (req.needName ? $("name") : $("note")).focus();
}

function finish(message) {
  if (done || !request) return;
  done = true;
  port.postMessage(message);
  window.close();
}

port.onMessage.addListener((msg) => {
  if (msg.type === "prompt") show(msg);
  if (msg.type === "done") window.close();
});

$("prompt").addEventListener("submit", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (e.key === "Enter") {
    e.preventDefault();
    finish({ type: "commit", tabId, name: $("name").value, note: $("note").value });
  } else if (e.key === "Escape") {
    e.preventDefault();
    finish({ type: "cancel" });
    window.close();
  }
});
