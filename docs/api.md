# Protocol 1 reference

[한국어](api.ko.md)

## HTTP

All bodies are JSON. The API base URL is configurable. The gateway example mounts these routes under `/assistant`.

- `GET /health`: `{ok, configured, protocolVersion:1, voiceApi:"live", voiceIdleSeconds, voiceSessionSeconds}`.
- `POST /chat`: `{prompt,context?,history?,continuation?,instructions?,siteContext?,locale?,timeZone?,protocolVersion?:1}`. Returns `{reply,calls,responseItems,usage?}`. `calls` contain `{name,argumentsJson,callId}`; append returned `responseItems` and the matching `function_call_output` to the next continuation.
- `POST /live`: `{sdp,context?,instructions?,siteContext?,locale?,timeZone?,protocolVersion?:1}` → `{sdp,sessionId}`. Creates a GPT-Live WebRTC session. Only the server holds the provider key.
- `POST /realtime`: `{sdp,context?,instructions?,siteContext?,locale?,timeZone?,protocolVersion?:1}`. Returns an SDP answer `{sdp}`. Only the server holds the provider key.

`locale` accepts `en-US` or `ko-KR`; `timeZone` is a valid IANA time zone. Prompt limit: 4,000 characters. Instructions: 8,000. Site context: 16,000. Screen context: 24,000 serialized characters. History: 12 entries and 30,000 serialized characters. Continuation: 100 entries and 240,000 serialized characters. Unsupported roles, executable tool names and protocol versions are rejected.

The SDK owns the tool loop. Most integrators need only the component or script, not a custom HTTP loop.

## Screen tools

`get_current_view` input:

```json
{}
```

`use_element` input:

```json
{
  "ref": "e2",
  "action": "fill",
  "requireConfirmation": false,
  "value": "Mina",
  "expectedRevision": "page-token:1",
  "requestId": "fill-1"
}
```

Actions: `click` with `null`, `fill` with a string/number, `select` with an observed option value, and `check` with a boolean. The local call envelope is `{name,argumentsJson:JSON.stringify(input)}`.

`scroll_view` input:

```json
{
  "region": "e1",
  "direction": "down",
  "expectedRevision": "page-token:2",
  "requestId": "scroll-1"
}
```

Region is `page`, `dialog`, or an observed scrollable ref. Directions: `up`, `down`, `top`, `bottom`.

Every tool returns the same result envelope with the fresh screen:

```json
{
  "ok": true,
  "state": {
    "view": {
      "title": "Customers",
      "url": "/customers",
      "revision": "page-token:2",
      "children": [
        {
          "role": "region",
          "name": "Search",
          "children": [
            {
              "role": "textbox",
              "ref": "e2",
              "name": "Customer name",
              "value": "Mina",
              "actions": ["fill"]
            }
          ]
        }
      ],
      "loading": false,
      "truncated": false,
      "alerts": [],
      "scroll": { "page": 0, "dialog": 0 }
    }
  }
}
```

This shortened example omits optional fields. [Full recorded examples](../examples/tool-roundtrip.json) use fictional data. Scrollable nodes also report `scrollTop`, `scrollHeight` and `clientHeight`. Hidden controls and the assistant itself are excluded. Truncated values carry `valueTruncated`; omitted options carry `moreOptions`. The SDK keeps a non-enumerable flat control index internally; it is not part of the wire format.

The revision includes a page-instance token. Use only the latest observed refs/revision. Reusing a request ID with the same input does not click again; changing its input is rejected. This deduplication is bounded and in-memory, not a cross-reload transaction guarantee.

Consequential/unknown clicks wait for a local confirmation card. Approval cannot be supplied through a tool argument. Changed form contents invalidate the confirmation. User cancellation returns `USER_CANCELLED`; do not retry without a new user request.

## Errors and cancellation

HTTP failures: `{error,code,requestId}`. Typical codes: `UNAUTHORIZED`, `ORIGIN_DENIED`, `INVALID_REQUEST`, `REQUEST_TOO_LARGE`, `RATE_LIMITED`, `SERVER_BUSY`, `PROVIDER_NOT_CONFIGURED`, `PROVIDER_ERROR`, `REQUEST_CANCELLED`, `INTERNAL_ERROR`.

Tool failures: `{ok:false,state:{view},error:{code,message}}`. Typical codes: `NEEDS_CONFIRMATION`, `USER_CANCELLED`, `SCREEN_CHANGED`, `SCREEN_CHANGED_OR_INVALID_INPUT`.

`ok:true` means the local operation completed, not that a business transaction succeeded. Inspect `loading`, visible status/errors and fresh form/table contents. If a network operation's outcome is unknown, report uncertainty rather than repeating it automatically.

`use_element.requireConfirmation` is a required boolean decision made by the AI from the user request and visible effects. Use `false` for reading, search, navigation and ordinary editing; use `true` for final saves, deletion, payments, sending, or unclear effects. It requests confirmation, never supplies user approval. `data-agent-action="confirm"` or a `true` result from `screen.requiresConfirmation` overrides an AI `false` for every `use_element` action. There is no `safe`/`preview` bypass setting. Update client and server together.
