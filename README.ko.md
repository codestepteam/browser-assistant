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

## 시작하기: 클라이언트와 서버

| 구성       | 설치 위치                      | 역할                            |
| ---------- | ------------------------------ | ------------------------------- |
| 클라이언트 | 도우미를 넣을 웹사이트         | 마이크·대화 화면·현재 화면 조작 |
| 서버       | 별도로 실행하는 Node.js 서비스 | AI 제공업체 API 키 보관·AI 연결 |

**클라이언트에는 서버 주소만 지정합니다.** 예를 들어 웹사이트는 `http://localhost:3000`, 도우미 서버는 `http://localhost:8796`에서 실행합니다. 두 주소의 포트는 달라도 됩니다.

### 1. 서버 주소 준비

이미 실행 중인 서버가 있으면 그 주소를 사용하세요. 없다면 [서버 실행·배포 안내](docs/server.ko.md)를 따라 `http://localhost:8796`에서 서버를 실행하세요. 아래 예시는 같은 컴퓨터에서 개발할 때의 주소입니다.

### 2. 웹사이트에 클라이언트 추가

#### 일반 HTML·JavaScript

웹사이트 HTML에 다음 스크립트를 추가합니다. React 설치나 프로젝트 클론은 필요하지 않습니다.

```html
<script
  src="http://localhost:8796/widget.js"
  data-server-url="http://localhost:8796"
  data-session-key="current-user"
  data-locale="ko-KR"
  data-time-zone="Asia/Seoul"
  defer
></script>
```

`src`는 클라이언트 파일을 받는 주소이고, `data-server-url`은 AI 요청을 보내는 서버 주소입니다. 위 예시에서는 도우미 서버가 두 역할을 함께 제공합니다. 추후 클라이언트를 CDN에 게시하면 `src`만 CDN 주소로 바꿀 수 있습니다.

#### React

기존 웹사이트 프로젝트에서 설치합니다. **현재는 npm 레지스트리 게시 전이므로 GitHub 패키지를 설치합니다.** 직접 클론할 필요는 없습니다.

```sh
npm install github:codestepteam/browser-assistant#main
```

```tsx
import { BrowserAssistant } from "@codestepteam/browser-assistant";

<BrowserAssistant
  serverUrl="http://localhost:8796"
  sessionKey="current-user"
  locale="ko-KR"
  timeZone="Asia/Seoul"
/>;
```

npm 게시 후에는 설치 명령을 `npm install @codestepteam/browser-assistant`로 바꿀 수 있습니다. 이 명령과 npm CDN 주소는 게시 완료 후 사용하세요. 버전을 고정하려면 현재 설치 명령의 `main`을 검증한 커밋 SHA로 바꾸세요. `v0.1.1` 태그는 이전 Realtime 버전입니다.

Next.js 연결, 프롬프트 설정과 로그인 연동은 [상세 사용 안내](docs/guide.ko.md)를 참고하세요. `sessionKey`는 대화 기록을 구분하는 값이며 로그인 인증을 대신하지 않습니다. AI 제공업체 API 키는 서버에만 설정합니다.

### 3. 연결 확인

웹사이트를 열고 마이크 버튼을 누른 채 말해 보세요. 로컬 HTTP 음성 입력은 `localhost`에서 사용할 수 있습니다. 운영 사이트에는 HTTPS가 필요합니다.

서버의 `ALLOWED_ORIGINS`에는 **웹사이트 주소**를 등록합니다. 이 예시에서는 `http://localhost:3000`입니다. 다른 포트라면 그 주소로 바꾸세요. 실제 운영 배포에는 별도 인증 연결이 필요합니다. [서버 안내](docs/server.ko.md)에서 로컬 개발과 운영 구성을 구분해 설명합니다.

## 음성 동작과 모델 설정

| 역할                             | 환경 변수               | 기본값         |
| -------------------------------- | ----------------------- | -------------- |
| 음성 대화                        | `OPENAI_LIVE_MODEL`     | `gpt-live-1`   |
| 작업 판단·화면 도구 선택·글 대화 | `OPENAI_MODEL`          | `gpt-5.6-luna` |
| 유휴 종료 시간                   | `VOICE_IDLE_SECONDS`    | `60`초         |
| 전체 음성 연결 제한              | `VOICE_SESSION_SECONDS` | `600`초        |

누르고 말하기는 첫 버튼 입력에서 음성 세션을 연결합니다. 버튼을 놓으면 마이크 입력을 즉시 차단하고, AI의 작업과 음성 응답은 이어집니다. 페이지를 여는 것만으로는 음성 세션을 만들지 않습니다. 작업과 음성 응답이 끝나고 60초 동안 사용하지 않으면 연결을 종료합니다. 중지 버튼으로 직접 종료할 수도 있습니다.

**마이크가 꺼져 있어도 열린 음성 세션에는 요금이 발생합니다.** GPT-Live는 음성 세션 시간에 과금하고 작업 모델·도구 비용은 별도입니다. WebRTC 생성 시 15초분을 먼저 청구하며 실행 세션의 시간 요금에서 상계합니다. [공식 과금 안내](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live)를 확인하세요.

클라이언트와 서버는 함께 업데이트하세요. 인증과 API 경로 설정은 [서버 안내](docs/server.ko.md)에서 설명합니다.

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

### 채팅창 표시와 마이크 위치

`chatVisibility`의 기본값은 `"session"`입니다. 대기 중에는 마이크 아이콘만 표시하고, 음성 연결을 시작하면 응답 영역이 나타납니다. 실행 확인과 연결 오류는 숨기지 않습니다. 항상 글 입력 진입점을 표시하려면 다음과 같이 지정합니다.

```tsx
<BrowserAssistant serverUrl="/assistant" chatVisibility="always" />
```

스크립트 설치에서는 `data-chat-visibility="always"`를 사용합니다. 마이크는 모달의 포커스 범위를 유지하면서 Popover API의 최상위 레이어에서 화면 오른쪽 아래에 고정됩니다. 모달의 이동·변형 때문에 버튼 위치가 바뀌지 않습니다.

음성을 끄고 글 입력만 쓰려면 `voiceEnabled={false}`를 지정합니다. 오른쪽 아래 버튼이 대화 아이콘으로 바뀌고, 누르면 대화창이 펼쳐지며 입력창에 초점이 갑니다. 마이크 권한과 `/live` 음성 연결은 사용하지 않으며, 화면 작업의 실행 확인과 중지는 그대로입니다. 스크립트에서는 `data-voice-enabled="false"`를 사용합니다.

```tsx
<BrowserAssistant serverUrl="/assistant" voiceEnabled={false} />
```

## 실행 확인 판단

AI가 사용자 요청과 현재 화면을 보고 실행 확인이 필요한지 판단합니다. 조회·검색·이동·일반 입력은 바로 수행하고, 최종 저장·삭제·결제·발송 또는 영향이 불명확한 조작은 확인을 요청합니다. 사이트에서 반드시 확인받을 요소에만 `data-agent-action="confirm"`을 지정하세요. `safe` 설정은 없습니다. AI가 확인을 요청하면 실제 사용자의 확인을 기다립니다. AI의 판단은 사이트 서버의 권한 검사를 대신하지 않습니다.

## npm 자동 게시

`main`과 `production` 푸시에서 전체 검사를 실행하며, 보호된 `production` 푸시가 통과한 경우에만 새 패치 버전을 게시하도록 CI/CD를 구성합니다. 최초 npm 인증과 신뢰 게시 연결이 필요합니다. [게시 설정과 동작](docs/publishing.md#한국어-요약)을 참고하세요.
