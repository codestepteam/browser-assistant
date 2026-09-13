# Browser Assistant

[한국어](README.ko.md) · [Tutorial](docs/tutorial.md) · [Configuration & prompts](docs/guide.md) · [API](docs/api.md)

An open-source, self-hosted assistant that **uses your website's rendered UI**. Add a script or a React component, connect your server, then ask it to navigate, fill forms, or perform an action with your confirmation.

- Hold the floating microphone to speak; release to send.
- Read the latest answer in a compact floating bar. Tap it for full chat and text input.
- Observe a compact semantic tree; execute only observed controls.
- Review consequential actions before execution. Stop at any time.
- English and Korean UI, speech recognition defaults, and configurable time zones.
- Your server and your AI provider API key. No Codestep-hosted backend is required.

**Status: 0.1.0 alpha.** Automated browser and mocked microphone checks cover Chromium, Firefox, WebKit, and mobile emulation. Physical iPhone/Android microphone behavior remains unverified. See [compatibility](docs/compatibility.md).

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
npm install github:codestepteam/browser-assistant#v0.1.0
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
