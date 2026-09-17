# Server setup and deployment

[Back to client installation](../README.md) · [한국어](server.ko.md)

This guide is for the assistant server operator. Website integrators only need the server address. The server currently runs from source; an npm server command and a managed service are not provided yet.

## Local development

This example runs your website at `http://localhost:3000` and the assistant server at `http://localhost:8796` on the same computer. Requires Node.js 22.14+ and npm.

```sh
git clone https://github.com/codestepteam/browser-assistant.git
cd browser-assistant
npm ci
cp .env.example .env
```

`npm ci` builds the distribution. Configure `.env`:

```dotenv
HOST=127.0.0.1
PORT=8796
OPENAI_API_KEY=your_provider_api_key
OPENAI_LIVE_MODEL=gpt-live-1
OPENAI_MODEL=gpt-5.6-luna
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8796,http://127.0.0.1:8796
SERVER_TOKEN=
```

`ALLOWED_ORIGINS` lists the website addresses embedding the client. Adjust the port to match your website. Leaving `SERVER_TOKEN` empty is only for loopback development on your own computer.

```sh
npm start
```

- Health: [http://localhost:8796/health](http://localhost:8796/health)
- Client script: [http://localhost:8796/widget.js](http://localhost:8796/widget.js)
- Demo: [http://localhost:8796/demo](http://localhost:8796/demo)

Set the client's `serverUrl` or `data-server-url` to `http://localhost:8796`. No extra proxy path is needed to try this local setup.

## Production deployment

Client distribution and server deployment are separate. Build the server in a Node.js environment and run `npm start`. Configure the AI provider API key in server environment variables, never in browser code or a public repository.

The supplied production setup uses your website's login server or authenticated proxy to attach `SERVER_TOKEN` when forwarding requests to the assistant server. `NODE_ENV=production` or a non-loopback bind requires `SERVER_TOKEN`. Keep the backend on loopback or a private network, and protect the public entry point with HTTPS and user authentication.

For example, if your authenticated API is deployed at `https://your-site.example/assistant`, use **that full address** as the client's `serverUrl`. This is a placeholder; replace it with your actual deployed address. Forward `/health`, `/chat`, and `/live` through the proxy.

Authenticated browser connections directly to a separate API domain are not complete in the default SDK. Requests send same-origin credentials only; setting an API URL alone does not establish cross-origin login. `ALLOWED_ORIGINS` is not authentication, and `SERVER_TOKEN` must never be exposed to clients.

See the [detailed operations guide](guide.md#authentication-and-https) for the authenticated proxy example, request limits, and HTTPS. Publishing the client to npm or a CDN does not deploy or authenticate the server.
