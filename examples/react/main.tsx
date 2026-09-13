import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserAssistant } from "../../src/client/index.js";
import "../demo.css";
function App() {
  const [name, setName] = useState("Mina Kim"),
    [saved, setSaved] = useState("No changes saved."),
    [locale, setLocale] = useState<"en-US" | "ko-KR">("en-US");
  const serverUrl =
    new URLSearchParams(location.search).get("server") ||
    (location.port === "4188" ? "/assistant" : location.origin);
  return (
    <div className="mx-auto max-w-3xl px-6 pb-36 pt-12">
      <nav className="mb-10 flex gap-5 text-sm">
        <a href="/demo">HTML example</a>
        <a href="/react" className="font-semibold">
          React example
        </a>
      </nav>
      <main>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
          React controlled input
        </p>
        <h1 className="my-4 text-4xl font-semibold tracking-tight">
          Edit a customer together
        </h1>
        <p className="mb-8 text-slate-500">
          Try: “Change the customer name to Alex and save.” The assistant asks
          for confirmation before saving.
        </p>
        <form
          className="rounded-2xl border border-slate-200 bg-white p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(`Saved: ${name}`);
          }}
        >
          <label className="block text-sm">
            Customer name
            <input
              aria-label="Customer name"
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="mt-5 rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white">
            Save
          </button>
          <p className="mt-4 text-sm text-slate-500" role="status">
            {saved}
          </p>
        </form>
      </main>
      <label data-agent-exclude className="mt-6 block text-sm">
        Assistant language
        <select
          className="ml-3 rounded-lg border border-slate-200 px-3 py-2"
          value={locale}
          onChange={(e) => setLocale(e.target.value as typeof locale)}
        >
          <option value="en-US">English</option>
          <option value="ko-KR">한국어</option>
        </select>
      </label>
      <BrowserAssistant
        serverUrl={serverUrl}
        sessionKey="fictional-react-example"
        locale={locale}
        timeZone="UTC"
        instructions="Keep replies brief. Verify the visible saved status."
        siteContext="This is a fictional customer form. Saving updates React state on this page."
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
