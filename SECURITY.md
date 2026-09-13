# Security

This alpha operates the website with the current browser user's privileges. Keep authorization and business validation on the host application's server.

- Keep provider credentials and `SERVER_TOKEN` server-side. `sessionKey`, CORS and prompts are not authentication.
- Use an authenticated gateway or `createApp({authenticate})`, HTTPS, exact origins and bounded request rates. A tokenless local demo must not be exposed through a public proxy.
- Page contents and site instructions are untrusted input. The model receives only three allowlisted screen tools; arbitrary code execution is not exposed. Confirmation cards are local safeguards, not a replacement for server authorization.
- Audit excluded content for your domain. Default redaction is limited; use `data-agent-exclude`, a restricted root or an exclusion selector. Do not log raw screen contents, conversations, SDP or credentials.
- History is stored in same-origin sessionStorage and is readable by other scripts from that origin. It is not a secret vault.
- Stop prevents further SDK tool calls and attempts transport cancellation. It cannot roll back a committed host-application operation or erase provider charges.
- Rate limits and gateway sessions are in-memory per process. The example password login is for demonstration; replace it with the site's real authentication.
- The voice duration setting is enforced by the SDK, not a trusted billing mechanism for adversarial clients.

Please use GitHub's **Report a vulnerability** feature if it is enabled for this repository. Otherwise contact the CodeStep organization maintainers privately through their published organization contact. Do not post secrets or exploitable details in a public issue.

## 한국어

실제 권한 검사는 설치한 사이트의 서버에서 수행해야 합니다. 서버 토큰·AI 제공업체 API 키를 브라우저에 넣지 마세요. 공개 환경에는 인증 연결·HTTPS·출처 제한·요청 제한을 적용합니다. 화면의 실행 확인은 서버 권한 검사를 대신하지 않습니다. 제외할 개인정보는 사이트별로 지정해야 하며 로그에 원문·비밀값을 남기면 안 됩니다.

보안 문제는 공개 이슈에 비밀값이나 악용 절차를 올리지 말고 저장소의 비공개 취약점 신고 기능 또는 조직의 공개된 연락 경로로 전달하세요.
