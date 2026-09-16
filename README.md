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

## Run your own server

Requires Node.js **22.14+** and npm. Node.js 24 is also checked by CI.

```sh
git clone https://github.com/codestepteam/browser-assistant.git
cd browser-assistant
npm ci
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`, then:

```sh
npm start
```

Open [http://localhost:8796/demo](http://localhost:8796/demo) for the script example or [http://localhost:8796/react](http://localhost:8796/react) for the React example. `npm ci` builds the distribution through `prepare`. Provider usage may incur charges from your AI provider.

The default server binds to loopback. Voice requires HTTPS or localhost. For a shared deployment, follow the [authentication and HTTPS guide](docs/guide.md#authentication-and-https).

## Voice behavior and model settings

| Role                                                  | Environment variable    | Default        |
| ----------------------------------------------------- | ----------------------- | -------------- |
| Spoken conversation                                   | `OPENAI_LIVE_MODEL`     | `gpt-live-1`   |
| Task reasoning, screen tool selection, and typed chat | `OPENAI_MODEL`          | `gpt-5.6-luna` |
| Idle timeout                                          | `VOICE_IDLE_SECONDS`    | `60` seconds   |
| Overall voice connection limit                        | `VOICE_SESSION_SECONDS` | `600` seconds  |

The first microphone hold starts a voice session. Release immediately blocks microphone input while the assistant finishes its work and spoken reply. Opening a page alone does not create a voice session. After work and speech finish, 60 seconds without activity closes the connection. The stop button also closes it explicitly.

**An open voice session incurs charges even when the microphone is muted.** GPT-Live bills for session duration; backend model and tool costs are separate. WebRTC creation initially bills 15 seconds, credited against running-session duration. See [official billing guidance](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live).

Update the client and server together, and allow `/live` through your authenticated proxy. Typed chat uses `/chat`. The `v0.1.1` tag contains the older Realtime implementation; the installation below uses `main` for GPT-Live support. To pin a tested revision, replace `main` with its commit SHA.

## Embed a script

Serve `dist/widget.js` from your server, and expose authenticated assistant routes at `/assistant`:

```html
<script
  src="/widget.js"
  data-server-url="/assistant"
  data-locale="en-US"
  data-time-zone="America/New_York"
  data-site-context="Customers can be searched and edited on /customers."
  data-instructions="Keep answers brief and verify the visible result."
  data-session-key="current-user-id"
  defer
></script>
```

`data-session-key` separates local conversation history; **it is not authentication**. Never put the server token or AI provider API key in client code.

## Embed React

The first release is distributed through GitHub, not the npm registry:

```sh
npm install github:codestepteam/browser-assistant#main
```

```tsx
import { BrowserAssistant } from "@codestepteam/browser-assistant";

<BrowserAssistant
  serverUrl="/assistant"
  sessionKey={currentUser.id}
  locale="en-US"
  timeZone="America/New_York"
  instructions="Keep answers brief. Verify the result after acting."
  siteContext="This website manages customers and contracts."
/>;
```

For Next.js, use a client-only dynamic import with `ssr: false`; see the [guide](docs/guide.md#react-and-nextjs). Plain HTML users do not need React installed: the script bundles its own runtime.

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
