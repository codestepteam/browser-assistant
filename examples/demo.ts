import type { BrowserAssistantProps } from "../src/client/index.js";
declare const BrowserAssistant: {
  mount: (options: BrowserAssistantProps) => () => void;
};
const $ = <T extends HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const rows = [
  { name: "Mina Kim", city: "Seoul", note: "New member" },
  { name: "Alan Green", city: "London", note: "Needs a meeting room" },
  { name: "Nora Park", city: "New York", note: "Monthly plan" },
];
let selected = 0;
const dialog = $<HTMLDialogElement>("#editor");
function render() {
  const query = $<HTMLInputElement>("#search").value.toLowerCase();
  const body = $("#customers");
  body.replaceChildren();
  rows.forEach((row, index) => {
    if (!`${row.name} ${row.city}`.toLowerCase().includes(query)) return;
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100 last:border-0";
    for (const value of [row.name, row.city, row.note]) {
      const td = document.createElement("td");
      td.className = "p-5";
      td.textContent = value;
      tr.append(td);
    }
    const td = document.createElement("td");
    td.className = "p-5";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.agentAction = "safe";
    edit.className =
      "rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50";
    edit.textContent = "Edit";
    edit.onclick = () => {
      selected = index;
      $<HTMLInputElement>("#edit-name").value = row.name;
      $<HTMLTextAreaElement>("#edit-note").value = row.note;
      dialog.showModal();
    };
    td.append(edit);
    tr.append(td);
    body.append(tr);
  });
}
$("#search").addEventListener("input", render);
$("#close-editor").onclick = () => dialog.close();
$("#edit-form").onsubmit = (e) => {
  e.preventDefault();
  rows[selected].name = $<HTMLInputElement>("#edit-name").value;
  rows[selected].note = $<HTMLTextAreaElement>("#edit-note").value;
  render();
  $("#outcome").textContent =
    `Saved for ${rows[selected].name}. Changes are local to this page.`;
  dialog.close();
};
const params = new URLSearchParams(location.search);
$<HTMLInputElement>("#server").value =
  params.get("server") ||
  (location.port === "4188" ? "/assistant" : location.origin);
$<HTMLSelectElement>("#locale").value =
  params.get("locale") === "ko-KR" ? "ko-KR" : "en-US";
const connect = () =>
  BrowserAssistant.mount({
    serverUrl: $<HTMLInputElement>("#server").value,
    locale: $<HTMLSelectElement>("#locale").value as "en-US" | "ko-KR",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    instructions: $<HTMLTextAreaElement>("#instructions").value,
    siteContext: $<HTMLTextAreaElement>("#context").value,
    sessionKey: "fictional-html-example",
  });
$("#connect").onsubmit = (e) => {
  e.preventDefault();
  connect();
};
$("#login").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const result = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: $<HTMLInputElement>("#password").value,
      }),
    });
    $("#login-result").textContent = result.ok
      ? "Signed in."
      : "Sign-in failed. Check the authentication gateway.";
    if (result.ok) connect();
  } catch {
    $("#login-result").textContent =
      "Could not reach the authentication gateway.";
  }
};
render();
connect();
