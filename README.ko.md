# Browser Assistant

[English](README.md) · [튜토리얼](docs/tutorial.ko.md) · [설정·프롬프트 안내](docs/guide.ko.md) · [도구 명세](docs/api.ko.md)

웹사이트의 실제 화면을 읽고 조작하는 오픈소스 AI 도우미입니다. 스크립트 또는 React 컴포넌트를 삽입하고 자체 운영 서버를 연결하면 사용할 수 있습니다.

- FAB를 누르는 동안만 GPT-Live로 음성이 전달되고, 놓으면 마이크가 꺼집니다. 첫 입력에 연결하고 60초 동안 사용하지 않으면 연결을 닫습니다.
- 하단 응답 표시를 누르면 전체 대화와 글 입력이 펼쳐집니다.
- 제목·폼·표·버튼 등을 중첩 JSON으로 읽고 관찰한 요소만 조작합니다.
- 확정 작업은 실행 내용을 확인한 뒤 수행하며, 언제든 중지할 수 있습니다.
- 한국어·영어 화면 문구와 음성 인식 기본 언어, 시간대를 설정합니다.
- 자체 운영 서버와 AI 제공업체 API 키를 사용합니다. 코드스텝이 운영하는 서버는 필요하지 않습니다.

**현재 상태: 알파. GPT-Live 지원은 `main`에서 사용할 수 있습니다.** Chromium·Firefox·WebKit 및 모바일 에뮬레이션의 자동 검사를 제공합니다. 실제 iPhone·Android 기기의 마이크 동작은 아직 검증하지 않았습니다. [검증 범위](docs/compatibility.md#한국어)를 확인하세요.

## 실행 영상

[▶ 짧은 실행 영상](docs/media/demo.mp4) · [녹화 설명](docs/media/README.md)

자체 운영 서버에서 실제 AI 요청으로 가상 고객 정보를 수정하고 실행 내용을 확인하는 영상입니다. 글 입력을 사용하며 실제 모바일 음성 검사 영상은 아닙니다.

## 서버 실행

Node.js 22.14 이상과 npm이 필요합니다. CI에서 Node.js 24도 검사합니다.

```sh
git clone https://github.com/codestepteam/browser-assistant.git
cd browser-assistant
npm ci
cp .env.example .env
```

`.env`에 AI 제공업체 API 키인 `OPENAI_API_KEY`를 설정합니다.

```sh
npm start
```

[HTML 예제](http://localhost:8796/demo) 또는 [React 예제](http://localhost:8796/react)를 엽니다. `npm ci`의 `prepare` 과정에서 배포 파일을 빌드합니다. 외부 AI 호출에는 AI 제공업체의 이용 요금이 발생할 수 있습니다.

기본 서버는 루프백 주소에서 실행합니다. 음성은 HTTPS 또는 localhost에서 사용할 수 있습니다. 다른 사용자가 접속할 환경은 [인증·HTTPS 안내](docs/guide.ko.md)를 따르세요.

## 음성 동작과 모델 설정

| 역할                             | 환경 변수               | 기본값         |
| -------------------------------- | ----------------------- | -------------- |
| 음성 대화                        | `OPENAI_LIVE_MODEL`     | `gpt-live-1`   |
| 작업 판단·화면 도구 선택·글 대화 | `OPENAI_MODEL`          | `gpt-5.6-luna` |
| 유휴 종료 시간                   | `VOICE_IDLE_SECONDS`    | `60`초         |
| 전체 음성 연결 제한              | `VOICE_SESSION_SECONDS` | `600`초        |

누르고 말하기는 첫 버튼 입력에서 음성 세션을 연결합니다. 버튼을 놓으면 마이크 입력을 즉시 차단하고, AI의 작업과 음성 응답은 이어집니다. 페이지를 여는 것만으로는 음성 세션을 만들지 않습니다. 작업과 음성 응답이 끝나고 60초 동안 사용하지 않으면 연결을 종료합니다. 중지 버튼으로 직접 종료할 수도 있습니다.

**마이크가 꺼져 있어도 열린 음성 세션에는 요금이 발생합니다.** GPT-Live는 음성 세션 시간에 과금하고 작업 모델·도구 비용은 별도입니다. WebRTC 생성 시 15초분을 먼저 청구하며 실행 세션의 시간 요금에서 상계합니다. [공식 과금 안내](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live)를 확인하세요.

클라이언트와 서버를 함께 업데이트하고 인증 프록시에서 `/live`를 허용하세요. 글 대화는 `/chat`을 사용합니다. `v0.1.1` 태그는 이전 Realtime 버전이며 아래 설치 예시는 GPT-Live가 포함된 `main`을 사용합니다. 검증한 버전을 고정하려면 설치 주소의 `main`을 해당 커밋 SHA로 바꾸세요.

## 스크립트 삽입

서버에서 `dist/widget.js`를 제공하고 `/assistant`에 인증이 적용된 API 경로를 연결합니다.

```html
<script
  src="/widget.js"
  data-server-url="/assistant"
  data-locale="ko-KR"
  data-time-zone="Asia/Seoul"
  data-site-context="/customers에서 고객을 검색하고 수정할 수 있습니다."
  data-instructions="한국어로 짧게 답하고, 조작 후 실제 결과를 확인하세요."
  data-session-key="current-user-id"
  defer
></script>
```

`data-session-key`는 브라우저의 대화 구분에만 사용합니다. 로그인 인증을 대신하지 않습니다. 서버 토큰과 AI 제공업체 API 키를 클라이언트 코드에 넣지 마세요.

## React 삽입

첫 버전은 npm 레지스트리가 아닌 GitHub에서 설치합니다.

```sh
npm install github:codestepteam/browser-assistant#main
```

```tsx
import { BrowserAssistant } from "@codestepteam/browser-assistant";

<BrowserAssistant
  serverUrl="/assistant"
  sessionKey={currentUser.id}
  locale="ko-KR"
  timeZone="Asia/Seoul"
  instructions="짧게 답하고, 조작 후 결과를 확인하세요."
  siteContext="고객과 계약을 관리하는 서비스입니다."
/>;
```

Next.js는 클라이언트 전용 컴포넌트에서 `ssr: false`로 동적 로딩합니다. [사용 안내](docs/guide.ko.md)에 예제가 있습니다. HTML 스크립트는 React를 별도로 설치하지 않아도 동작합니다.

## 문서와 검증

[단계별 튜토리얼](docs/tutorial.ko.md) · [사용·설정·프롬프트 안내](docs/guide.ko.md) · [도구 명세](docs/api.ko.md)

```sh
npm run check
npm test
npx playwright install chromium firefox webkit
npm run test:browser
npm run test:package
```

`npm run dev`는 `http://macmini:4186/tests/browser.html`에서 독립 브라우저 검사 서버를 실행합니다. `npm run dev:api`는 소스에서 백엔드를 실행합니다. 자동 검사는 가상 데이터와 모의 마이크를 사용합니다.

현재 AI 연결은 OpenAI를 지원합니다. 오프라인 추론, 추가 AI 제공업체, 관리형 서비스의 서비스 API 키 발급과 과금은 구현 범위에 포함하지 않습니다.

[기여 안내](CONTRIBUTING.md) · [보안 안내](SECURITY.md) · [변경 기록](CHANGELOG.md) · MIT License.
