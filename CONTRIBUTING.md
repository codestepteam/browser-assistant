# Contributing

1. Fork the repository and create a focused branch.
2. Use Node.js 22.14+; run `npm ci`.
3. Keep changes domain-independent. Add site-specific rules to an example or the consuming application.
4. Run `npm run check`, `npm test`, `npm run test:browser`, `npm run build`, and `npm run test:package`.
5. Update English and Korean documentation together when public behavior changes.
6. Describe the concrete before/after behavior, verification and limitations in the pull request.

`npm run dev` serves isolated browser checks on port 4186. `npm run dev:api` runs the backend from source. Browser binaries are installed with `npx playwright install chromium firefox webkit`. No AI provider credentials are needed for the automated tests. `npm run record:demo` is an explicit real-provider smoke test and may incur provider usage.

Keep new UI strings in `src/i18n.ts`. English source phrases can be overridden through the client's `translations` option. Never translate host-page content as if it were a UI label owned by this package. Locale selection does not translate the host website.

Do not commit `.env`, credentials, real customer data, traces with private data, `node_modules` or generated `dist` files. Record examples with fictional data. Keep dependencies small; reuse native browser controls and installed libraries.

## 한국어

변경 전후의 동작을 분명하게 설명하고 관련 검사를 실행하세요. 공통 기능은 이 저장소에서, 특정 사이트의 업무 규칙은 예제 또는 해당 사이트에서 관리합니다. 공개 동작을 바꾸면 한국어·영어 문서를 함께 수정합니다. 새 화면 문구는 `src/i18n.ts`에 추가하고 개인정보·비밀값·실제 고객 자료를 커밋하지 마세요.
