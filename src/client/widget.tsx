import { createRoot } from "react-dom/client";
import { BrowserAssistant, type BrowserAssistantProps } from "./index.js";
let current: (() => void) | undefined;
export function mount(options: BrowserAssistantProps) {
  current?.();
  const container = document.createElement("div");
  container.dataset.agentExclude = "";
  document.body.append(container);
  const root = createRoot(container);
  root.render(<BrowserAssistant {...options} />);
  const unmount = () => {
    root.unmount();
    container.remove();
  };
  current = unmount;
  return unmount;
}
const script = document.currentScript as HTMLScriptElement | null;
if (script?.dataset.serverUrl) {
  const options = {
    serverUrl: script.dataset.serverUrl,
    locale: script.dataset.locale as BrowserAssistantProps["locale"],
    timeZone: script.dataset.timeZone,
    instructions: script.dataset.instructions,
    siteContext: script.dataset.siteContext,
    sessionKey: script.dataset.sessionKey,
    title: script.dataset.title,
    chatVisibility:
      script.dataset.chatVisibility === "always"
        ? ("always" as const)
        : ("session" as const),
    voiceEnabled: script.dataset.voiceEnabled !== "false",
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => mount(options), {
      once: true,
    });
  else mount(options);
}
