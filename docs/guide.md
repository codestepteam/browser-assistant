# Installation, configuration and prompt guide

[한국어](guide.ko.md) · [Quick start](../README.md)

## Architecture

The embedded client reads the current page and executes the three screen tools. The separately running server prepares AI requests and voice connections. A site's authenticated gateway sits between its browser and the assistant backend in shared deployments. Text/tool requests use HTTP; WebRTC voice and voice tool messages flow between the browser and the AI provider after server-mediated connection setup.

Self-hosting means that no Codestep-hosted backend is required. You still supply an AI provider API key. The current adapter calls OpenAI; local inference is not implemented.

## Installation choices

1. Clone the repository and run `npm ci` for the complete server, examples and source.
2. Install the GitHub tag with `npm install github:codestepteam/browser-assistant#v0.1.1` for a React consumer. Installation from Git runs `prepare` to build the package.
3. Alternatively download the `.tgz` release asset and run `npm install ./codestepteam-browser-assistant-0.1.1.tgz`; this installs prebuilt files.
4. Copy `dist/widget.js` to your own web server for plain HTML. Set its `data-server-url` to your authenticated gateway.

Pin a release tag or release asset. Do not point production installs to a moving default branch. Protocol version 1 clients and servers must be deployed together; `/health` advertises the protocol version. No cross-major compatibility guarantee is made for this alpha.

## Server environment

| Variable                | Default               | Purpose                                                                    |
| ----------------------- | --------------------- | -------------------------------------------------------------------------- |
| `HOST`                  | `127.0.0.1`           | Backend bind address                                                       |
| `PORT`                  | `8796`                | Backend port                                                               |
| `OPENAI_API_KEY`        | required for AI       | AI provider API key; server only                                           |
| `OPENAI_MODEL`          | `gpt-5.6-luna`        | Text/tool model                                                            |
| `OPENAI_LIVE_MODEL`     | `gpt-live-1`          | Voice model                                                                |
| `SERVER_TOKEN`          | empty for local demo  | Server-to-server authentication token                                      |
| `ALLOWED_ORIGINS`       | local backend origins | Exact comma-separated browser origins                                      |
| `REQUESTS_PER_MINUTE`   | `60`                  | POST limit per authenticated identity, or server-wide with token auth      |
| `MAX_CONCURRENT`        | `4`                   | Concurrent HTTP requests per process                                       |
| `VOICE_SESSION_SECONDS` | `600`                 | Advertised SDK voice connection lifetime                                   |
| `VOICE_IDLE_SECONDS`    | `60`                  | Close voice after this many seconds without input, speech, or backend work |

The request body limit is 400,000 bytes. The SDK ends its voice connection after the advertised lifetime; this is a cooperative client limit, not an authoritative billing or malicious-client control. Voice connection creation remains subject to backend POST limits. Apply provider-side spend limits and a reverse-proxy policy appropriate to your deployment. In-memory rate counters are per process; use a shared limiter before scaling to multiple replicas.

`NODE_ENV=production` or a non-loopback `HOST` requires `SERVER_TOKEN`. Do not expose a tokenless loopback backend through a public reverse proxy.

## Authentication and HTTPS

The server token belongs on servers. A browser-visible identifier, `sessionKey`, CORS, and prompts are not authentication.

`examples/auth-gateway.ts` is a runnable gateway. It provides a small password login, an HttpOnly SameSite cookie, expiry, login throttling, and server-side forwarding. It deliberately uses one demonstration password and in-memory sessions: replace those with your real account/session system before production.

1. Set a random `SERVER_TOKEN` in `.env` and a separate `DEMO_LOGIN_PASSWORD` of at least 12 characters. Generate secrets with your preferred password manager.
2. Run `npm start` (assistant backend).
3. In a second terminal run `npm run demo:gateway`.
4. Open `http://localhost:4188/demo`; sign in in the connection section. The example uses `/assistant` for requests.
5. The gateway forwards the server token; the browser never receives it.

Gateway settings: `ASSISTANT_URL` (default `http://127.0.0.1:8796`), `GATEWAY_PORT` (default `4188`), and `COOKIE_SECURE=1` when served through HTTPS. Keep the backend on loopback or a private network and terminate HTTPS at your site's reverse proxy. Preserve the original Host header for the example's same-origin POST check. Use HTTPS for the production page and its assistant routes.

You can integrate your own authenticated user lookup directly through `createApp`:

```ts
import { createApp } from "@codestepteam/browser-assistant/server-app";
const app = createApp({
  authenticate: async (request) => {
    const session = await yourExistingSessionLookup(request);
    return session?.userId ?? null;
  },
  origins: ["https://your-site.example"],
  requestsPerMinute: 60,
});
```

`yourExistingSessionLookup` is your application's function, not an exported helper. Do not replace it with a browser-supplied user ID. If both `token` and `authenticate` are supplied, both checks must pass.

## Client settings

| Setting                       | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `serverUrl`                   | API base path; required                                                             |
| `sessionKey`                  | Separate per-user local history; default `default` is for single-user demos         |
| `locale`                      | `en-US` (default) or `ko-KR`; UI, recognition default and AI response language      |
| `timeZone`                    | IANA time zone, default `UTC`; relative date interpretation                         |
| `title`                       | Optional assistant title                                                            |
| `instructions`                | Preferred behavior; public reference guidance, not an authorization policy          |
| `siteContext`                 | Site purpose, pages and terminology                                                 |
| `context`                     | Current selection/page details; do not include secrets                              |
| `translations`                | Override UI text by English source phrase, e.g. `{'Hold to talk':'Press to speak'}` |
| `screen.root`                 | Restrict extraction to a DOM root, supplied as a function                           |
| `screen.exclude`              | Additional CSS selector to exclude                                                  |
| `screen.requiresConfirmation` | Optional forced confirmation; true adds a requirement, false leaves the AI decision |
| `onReady`                     | Optional tool executor callback, useful for diagnostics and tests                   |
| `chatVisibility`              | When the response strip appears: `session` (default) or `always`                    |
| `voiceEnabled`                | Hold-to-talk voice. Default `true`. `false` shows a chat FAB instead of the mic     |

With `voiceEnabled={false}`, the bottom-right control is a chat icon. Tapping it expands the conversation and focuses the composer. The compact floating response bar is not shown. Microphone permission and `/live` are never requested; typed messages still use `/chat` and screen tools.

The plain script supports `data-server-url`, `data-session-key`, `data-locale`, `data-time-zone`, `data-title`, `data-instructions`, `data-site-context`, `data-chat-visibility`, and `data-voice-enabled`. For functions, dynamic context or long text, load the script and call `BrowserAssistant.mount(options)`. Its return value unmounts the widget; call it on logout. Remount after changing site instructions for an existing voice connection. Language/time-zone changes restart the connection and re-read the screen.

## React and Next.js

Mount once near the application root, and use the authenticated account ID as `sessionKey`. React 18+ is declared as a peer requirement; the release's automated browser examples use React 19. The browser-only widget accesses `document`; do not server-render it.

```tsx
"use client";
import dynamic from "next/dynamic";
const Assistant = dynamic(
  () =>
    import("@codestepteam/browser-assistant").then((m) => m.BrowserAssistant),
  { ssr: false },
);
export default function SiteAssistant({ userId }: { userId: string }) {
  return (
    <Assistant
      serverUrl="/assistant"
      sessionKey={userId}
      locale="en-US"
      timeZone="UTC"
    />
  );
}
```

The Next.js snippet documents client-only loading; Next.js is not part of the browser test matrix. The widget isolates its Tailwind styles in a Shadow DOM root. If your CSP restricts inline styles, adapt your policy or bundling before embedding; nonce-based CSP integration is not implemented in this release.

## Prompt tips

Keep the three inputs separate:

- `instructions`: response style and preferred task behavior. Example: “Keep replies brief. Verify the visible result after each action. Ask when the target is ambiguous.”
- `siteContext`: purpose, page routes, navigation, domain terms, and workflow hints. Example: “This is a customer workspace. /customers provides search and editing. A member means an active customer.”
- `context`: current facts, such as `{section:'customers', selectedCustomerId:'demo-1'}`. Update when your application changes selection.

Do not paste source code, secrets or entire datasets into these inputs. Do not claim a button exists unless the screen exposes it. Avoid telling the model to skip confirmation, guess missing records, or treat a successful click as proof that a remote save completed. Page text, site context and conversation history are untrusted reference data; the base prompt is retained. Enforce business permissions on your real application server.

English example:

```js
{locale:'en-US', timeZone:'America/New_York',
 instructions:'Keep answers brief. Verify visible outcomes. Ask before choosing between ambiguous records.',
 siteContext:'Customer profiles are on /customers. Search by name, then open Edit. Notes are drafts until Save succeeds.'}
```

Korean example:

```js
{locale:'ko-KR', timeZone:'Asia/Seoul',
 instructions:'짧게 답하고 실제 결과를 확인하세요. 대상이 여러 개면 사용자에게 물어보세요.',
 siteContext:'/customers에서 고객 이름을 검색하고 수정창을 엽니다. 메모는 저장 완료 전까지 초안입니다.'}
```

Start with three concrete test requests, including an ambiguous one. Improve labels and site context based on observed failures; do not keep adding contradictory prompt rules.

## Privacy, history and execution

The client transmits rendered screen text and allowed control values to the AI provider. Password/hidden/file inputs and selected sensitive autocomplete fields are excluded, and a limited identifier pattern is redacted. These defaults are not a universal sensitive-data detector. Use `data-agent-exclude`, `screen.exclude`, or a restricted root for your domain.

History and pending requests use same-tab `sessionStorage`; it is not shared across devices or tabs. A refresh resumes by observing a fresh screen. If storage is blocked, only in-page memory works. Site scripts can read same-origin storage: do not treat it as a secret vault. Unmount on logout and use account-specific `sessionKey` values. Browser tab/session restoration policies can retain session storage; the product does not provide a durable retention or deletion service.

Stopping cancels further client tool execution and closes the voice connection. HTTP cancellation is propagated to the provider where the transport supports it. An already-sent website save or provider request may still finish or incur cost; stop is not rollback. No exactly-once guarantee is made across page reloads for arbitrary external websites.

## Troubleshooting

- **401**: confirm the gateway session and matching server token. Never solve it by putting that token in the browser.
- **403**: check the exact scheme, hostname and port in `ALLOWED_ORIGINS`.
- **429 / 503 busy**: wait or adjust the configured limits; check provider limits separately.
- **Voice unavailable**: use HTTPS/localhost, allow microphone access, then hold again. Browser permission indicators cannot be suppressed by the SDK.
- **Repeated microphone prompts**: tracks are reused within a connection; reconnects, permission expiry or browser settings can still request permission.
- **Control not found**: use semantic HTML/ARIA and a real label. Canvas, iframe content, and site-owned Shadow DOM controls are not supported.
- **A slow save looks unchanged**: expose `aria-busy="true"` while saving and a visible completion/error message.
- **Protocol mismatch**: deploy matching version-1 client/server artifacts.

Server logs contain request ID, method, path, status and duration only. Correlate `X-Request-Id` or the JSON `requestId` with those logs. Do not add authorization headers, SDP, conversation bodies or screen dumps to production logs.

## GPT-Live voice sessions

Opening a page or regaining connectivity does not create a voice session. The first hold requests microphone permission before creating the connection. Releasing while permission is pending does not start a paid session. If a creation request is already in flight, initialization charges may apply.

Only a held button enables the microphone track. Release disables it immediately and WebRTC carries silence. No Realtime commit/response trigger is used; GPT-Live decides when to reply. Pointer cancellation and window blur mute and close the session. Typed input keeps using `/chat` and closes voice.

GPT-Live handles speech; the Responses model in `OPENAI_MODEL` selects screen tools. Existing browser tools still execute actions and request confirmation. A new hold invalidates subsequent actions from older work; it does not roll back actions already performed.

The default idle timeout is 60 seconds. Holds, received audio, captions and backend activity reset it. Pending tools and confirmations postpone idle closure. The overall `VOICE_SESSION_SECONDS` cap still applies. The stop button closes the session explicitly. Closure sends `session.close` and waits for final usage before releasing the transport.

Muted sessions still incur duration charges. The current voice rate is $0.05/minute, with backend model and tool costs separate. WebRTC creation bills 15 seconds initially, credited against running-session duration. See [official billing guidance](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live).

The new client requires a server supporting `/live`; add that path to authenticated proxy allowlists. `/realtime` and `OPENAI_REALTIME_MODEL` remain for older clients.
