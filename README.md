# Browser Assistant

[한국어](README.ko.md) · [Tutorial](docs/tutorial.md) · [Configuration & prompts](docs/guide.md) · [API](docs/api.md)

An open-source, self-hosted assistant that **uses your website's rendered UI**. Add a script or a React component, connect your server, then ask it to navigate, fill forms, or perform an action with your confirmation.

- Hold the floating microphone to send audio to GPT-Live; release to mute. Voice connects on demand and closes after 60 idle seconds.
- Read the latest answer in a compact floating bar. Tap it for full chat and text input.
- Observe a compact semantic tree; execute only observed controls.
- Review consequential actions before execution. Stop at any time.
- English and Korean UI, speech recognition defaults, and configurable time zones.
- Your server and your AI provider API key. No Codestep-hosted backend is required.

**Status: alpha; GPT-Live support is available on `main`.** Automated browser and mocked microphone checks cover Chromium, Firefox, WebKit, and mobile emulation. Physical iPhone/Android microphone behavior remains unverified. See [compatibility](docs/compatibility.md).

## Watch it work

[▶ Short execution video](docs/media/demo.mp4) · [Recording details](docs/media/README.md)

The recording uses real AI requests against a self-hosted server and fictional customer data. It demonstrates text-driven editing and confirmation; it is not a physical-device voice test.

## Getting started: client and server

| Part   | Where it runs              | Responsibility                                  |
| ------ | -------------------------- | ----------------------------------------------- |
| Client | Your website               | Microphone, conversation UI, and screen actions |
| Server | A separate Node.js service | AI provider API key and AI connections          |

**Give the client the server's address.** For example, your website runs at `http://localhost:3000` and the assistant server at `http://localhost:8796`. They can use different ports.

### 1. Prepare a server address

Use an existing assistant server, or follow [Server setup and deployment](docs/server.md) to run one at `http://localhost:8796`. The examples below are for local development on the same computer.

### 2. Add the client to your website

#### Plain HTML and JavaScript

Add this script to your website. No React installation or repository clone is needed.

```html
<script
  src="http://localhost:8796/widget.js"
  data-server-url="http://localhost:8796"
  data-session-key="current-user"
  data-locale="en-US"
  data-time-zone="America/New_York"
  defer
></script>
```

`src` downloads the client; `data-server-url` identifies the server handling AI requests. This example uses the assistant server for both. Once the client is published to a CDN, `src` can point there independently.

#### React

Install in your existing website project. **The package is not yet published to the npm registry; use the GitHub package for now.** You do not need to clone the repository yourself.

```sh
npm install github:codestepteam/browser-assistant#main
```

```tsx
import { BrowserAssistant } from "@codestepteam/browser-assistant";

<BrowserAssistant
  serverUrl="http://localhost:8796"
  sessionKey="current-user"
  locale="en-US"
  timeZone="America/New_York"
/>;
```

After npm publication, installation can use `npm install @codestepteam/browser-assistant`. Use that command and npm CDN URLs only after publication. To pin a tested revision today, replace `main` with its commit SHA. The `v0.1.1` tag contains the older Realtime implementation.

See the [detailed guide](docs/guide.md) for Next.js, prompts, and login integration. `sessionKey` separates conversation history; it is not authentication. Configure the AI provider API key only on the server.

### 3. Check the connection

Open your website and hold the microphone button to speak. Local HTTP voice input works on `localhost`; production sites require HTTPS.

Set the server's `ALLOWED_ORIGINS` to your **website's address**, `http://localhost:3000` in this example. Change it if your website uses a different port. Production requires authentication integration; the [server guide](docs/server.md) separates local development from deployment.

## Voice behavior and model settings

| Role                                                  | Environment variable    | Default        |
| ----------------------------------------------------- | ----------------------- | -------------- |
| Spoken conversation                                   | `OPENAI_LIVE_MODEL`     | `gpt-live-1`   |
| Task reasoning, screen tool selection, and typed chat | `OPENAI_MODEL`          | `gpt-5.6-luna` |
| Idle timeout                                          | `VOICE_IDLE_SECONDS`    | `60` seconds   |
| Overall voice connection limit                        | `VOICE_SESSION_SECONDS` | `600` seconds  |

The first microphone hold starts a voice session. Release immediately blocks microphone input while the assistant finishes its work and spoken reply. Opening a page alone does not create a voice session. After work and speech finish, 60 seconds without activity closes the connection. The stop button also closes it explicitly.

**An open voice session incurs charges even when the microphone is muted.** GPT-Live bills for session duration; backend model and tool costs are separate. WebRTC creation initially bills 15 seconds, credited against running-session duration. See [official billing guidance](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live).

Update the client and server together. Authentication and API routing are covered in the [server guide](docs/server.md).

## Documentation

| Topic                                     | English                                | 한국어                                    |
| ----------------------------------------- | -------------------------------------- | ----------------------------------------- |
| First task, step by step                  | [Tutorial](docs/tutorial.md)           | [튜토리얼](docs/tutorial.ko.md)           |
| Installation, auth, settings, prompt tips | [Guide](docs/guide.md)                 | [사용 안내](docs/guide.ko.md)             |
| Tool inputs, outputs, errors              | [API reference](docs/api.md)           | [도구 명세](docs/api.ko.md)               |
| Tested scope and limitations              | [Compatibility](docs/compatibility.md) | [검증 범위](docs/compatibility.md#한국어) |

## Development

```sh
npm run check
npm test
npx playwright install chromium firefox webkit
npm run test:browser
npm run test:package
```

`npm run dev` starts the isolated browser test server at `http://macmini:4186/tests/browser.html`. `npm run dev:api` starts the backend from source. Tests use fake data and fake microphone tracks; API unit tests do not call an AI provider. [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md).

The client, server, and examples live in one repository. No database, hosted subscription, or hosted service API key is required. The current AI adapter uses OpenAI. Offline inference and additional providers are not implemented.

MIT License. [Third-party notices](THIRD_PARTY_NOTICES.md).

### Chat visibility and floating controls

`chatVisibility` defaults to `"session"`: only the microphone is visible while idle. The response strip appears when a voice connection starts; pending confirmations and connection errors remain visible. Use `chatVisibility="always"` for a permanent entry point to text chat, or `data-chat-visibility="always"` on the script widget. Controls use the browser Popover API top layer to stay anchored to the viewport while remaining inside an open dialog's focus scope.

Set `voiceEnabled={false}` (or `data-voice-enabled="false"` on the script widget) for chat-only mode. The bottom-right control becomes a chat FAB: tap it to expand the conversation and focus the text input. Microphone permission and `/live` are not used. Confirmation cards and Stop still apply to screen actions.

```tsx
<BrowserAssistant serverUrl="/assistant" voiceEnabled={false} />
```

## Confirmation decisions

The AI decides whether to request confirmation from the user request and visible effects. Reading, search, navigation and ordinary editing can proceed directly; final saves, deletion, payments, sending or unclear effects require confirmation. Optionally mark mandatory confirmation with `data-agent-action="confirm"`. There is no `safe` setting. Requested confirmation still waits for the actual user; AI judgment does not replace your server authorization checks.

## Automatic npm publishing

The CI/CD workflow verifies `main` and `production`, then publishes a new patch version only after a protected `production` push passes all checks. Initial npm authentication and trusted-publisher setup are required. See [publishing setup and behavior](docs/publishing.md).
