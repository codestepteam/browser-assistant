# 설치·설정·프롬프트 사용 안내

[English](guide.md) · [빠른 시작](../README.ko.md)

## 구조와 설치

클라이언트는 웹사이트 안에서 화면을 읽고 도구를 실행합니다. 별도 서버는 AI 요청과 음성 연결을 준비합니다. 여러 사용자가 접속하는 환경에서는 기존 사이트의 인증 경로를 거쳐 서버로 요청을 전달합니다. 글·도구 요청은 HTTP를 사용합니다. 음성과 음성 도구 메시지는 서버의 연결 준비 이후 브라우저와 AI 제공업체 사이에서 WebRTC로 오갑니다.

자체 운영은 코드스텝 서버가 필요 없다는 뜻입니다. 현재 구현은 OpenAI를 호출하므로 AI 제공업체 API 키가 필요합니다. 오프라인 추론은 구현하지 않았습니다.

- 전체 서버·소스·예제: 저장소를 내려받고 `npm ci`를 실행합니다.
- React 프로젝트: `npm install github:codestepteam/browser-assistant#v0.1.1`으로 설치합니다. Git 설치 과정에서 `prepare`가 배포 파일을 빌드합니다.
- 미리 빌드한 패키지: 릴리스의 `.tgz`를 내려받아 `npm install ./codestepteam-browser-assistant-0.1.1.tgz`를 실행합니다.
- HTML: `dist/widget.js`를 자기 서버에서 제공하고 인증 경로를 `data-server-url`로 지정합니다.

운영 설치는 릴리스 태그나 릴리스 파일에 고정하세요. 클라이언트·서버 프로토콜 버전은 1이며 `/health`에서 확인할 수 있습니다. 알파 버전에서는 서로 다른 주요 버전의 호환을 보장하지 않습니다.

## 서버 설정

| 환경 변수               | 기본값                    | 설명                                                                |
| ----------------------- | ------------------------- | ------------------------------------------------------------------- |
| `HOST`                  | `127.0.0.1`               | 백엔드 수신 주소                                                    |
| `PORT`                  | `8796`                    | 백엔드 포트                                                         |
| `OPENAI_API_KEY`        | AI 사용 시 필수           | 서버에만 보관하는 AI 제공업체 API 키                                |
| `OPENAI_MODEL`          | `gpt-5.6-luna`            | 글·도구 모델                                                        |
| `OPENAI_LIVE_MODEL`     | `gpt-live-1`              | 음성 모델                                                           |
| `SERVER_TOKEN`          | 로컬 예제에서는 비어 있음 | 서버 간 인증 토큰                                                   |
| `ALLOWED_ORIGINS`       | 로컬 백엔드 주소          | 허용할 출처의 쉼표 구분 목록                                        |
| `REQUESTS_PER_MINUTE`   | `60`                      | 인증 사용자별 분당 POST 한도. 토큰 인증만 쓰면 서버 전체 한도       |
| `MAX_CONCURRENT`        | `4`                       | 프로세스별 동시 HTTP 요청 한도                                      |
| `VOICE_SESSION_SECONDS` | `600`                     | SDK에 안내하는 음성 연결 유지 시간                                  |
| `VOICE_IDLE_SECONDS`    | `60`                      | 작업·음성 응답·입력이 없는 상태에서 음성 연결을 종료하기까지의 시간 |

본문 최대 크기는 400,000바이트입니다. 음성 유지 시간은 SDK가 연결을 종료하는 협조적 제한이며, 악의적인 클라이언트를 막는 과금 기준은 아닙니다. 음성 연결 생성에는 서버 POST 한도가 적용됩니다. AI 제공업체의 비용 한도와 배포 프록시의 제한도 설정하세요. 요청 제한은 메모리에 보관하므로 서버 프로세스를 여러 개 운영하려면 공유 제한 저장소가 필요합니다.

`NODE_ENV=production` 또는 루프백이 아닌 `HOST`로 실행할 때는 `SERVER_TOKEN`이 필요합니다. 토큰 없는 로컬 서버를 공개 프록시로 노출하지 마세요.

## 기존 로그인 연결과 HTTPS

`sessionKey`, 출처 허용 목록, 프롬프트는 로그인 인증을 대신하지 않습니다. 서버 토큰을 클라이언트 코드에 넣으면 안 됩니다.

`examples/auth-gateway.ts`는 실행 가능한 인증 연결 예제입니다. 예제 비밀번호 로그인, HttpOnly·SameSite 쿠키, 만료, 로그인 요청 제한, 서버 간 전달을 포함합니다. 한 개의 예제 비밀번호와 메모리 세션을 사용하므로, 운영 배포에서는 기존 계정·세션 시스템으로 바꿔야 합니다.

1. `.env`에 무작위 `SERVER_TOKEN`과 별도의 12자 이상 `DEMO_LOGIN_PASSWORD`를 설정합니다.
2. 첫 터미널에서 `npm start`로 백엔드를 실행합니다.
3. 두 번째 터미널에서 `npm run demo:gateway`를 실행합니다.
4. `http://localhost:4188/demo`의 연결 설정에서 로그인합니다.
5. 브라우저는 `/assistant`로 요청하고, 인증 연결 예제가 서버 토큰을 붙여 전달합니다.

인증 연결 예제는 `ASSISTANT_URL`(기본 `http://127.0.0.1:8796`), `GATEWAY_PORT`(기본 `4188`)를 사용합니다. HTTPS 프록시 뒤에서는 `COOKIE_SECURE=1`을 설정하세요. 프록시는 원래 Host 헤더를 보존해야 합니다. 운영 페이지와 API 모두 HTTPS로 제공하고 백엔드는 루프백 또는 사설망에 둡니다.

직접 연결할 때는 서버의 `createApp({ authenticate })`에 기존 세션 조회 함수를 제공할 수도 있습니다.

```ts
import { createApp } from "@codestepteam/browser-assistant/server-app";
const app = createApp({
  authenticate: async (request) => {
    const session = await yourExistingSessionLookup(request);
    return session?.userId ?? null;
  },
  origins: ["https://your-site.example"],
});
```

`yourExistingSessionLookup`은 설치할 사이트의 함수이며 패키지에서 제공하지 않습니다. 브라우저가 보낸 사용자 ID를 그대로 인증 결과로 사용하면 안 됩니다. `token`과 `authenticate`를 함께 지정하면 두 검사 모두 통과해야 합니다.

## 클라이언트 설정

| 설정                          | 의미                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| `serverUrl`                   | 필수 API 기본 주소                                                |
| `sessionKey`                  | 사용자별 대화 구분. 기본 `default`는 단일 사용자 예제용           |
| `locale`                      | `en-US` 기본값 또는 `ko-KR`. 화면·음성 인식 기본값·응답 언어      |
| `timeZone`                    | IANA 시간대. 기본값 `UTC`                                         |
| `title`                       | 도우미 제목                                                       |
| `instructions`                | 선호하는 행동 지침. 실제 권한 정책은 아님                         |
| `siteContext`                 | 사이트 목적·페이지·업무 용어                                      |
| `context`                     | 현재 선택·화면 정보                                               |
| `translations`                | 영어 원문으로 지정하는 문구 재정의                                |
| `screen.root`                 | 수집할 DOM 루트를 반환하는 함수                                   |
| `screen.exclude`              | 추가로 제외할 CSS 선택자                                          |
| `screen.requiresConfirmation` | 강제 확인 조건. true는 확인을 강제하며 false는 AI 판단을 유지     |
| `onReady`                     | 도구 실행기 연결. 검사·진단용 선택 사항                           |
| `chatVisibility`              | 채팅 응답 영역 표시. `session`(기본) 또는 `always`                |
| `voiceEnabled`                | 음성(누르고 말하기) 사용. 기본 `true`. `false`면 대화 버튼만 표시 |

`voiceEnabled={false}`이면 마이크 FAB 대신 대화 아이콘이 나타나고, 버튼을 누르면 대화창과 입력창이 열립니다. 마이크 권한·`/live` 음성 연결은 호출하지 않으며 글 입력은 `/chat`으로 화면 도구를 사용합니다.

스크립트 속성은 `data-server-url`, `data-session-key`, `data-locale`, `data-time-zone`, `data-title`, `data-instructions`, `data-site-context`, `data-chat-visibility`, `data-voice-enabled`를 지원합니다. 함수나 동적인 문맥은 스크립트를 로드한 뒤 `BrowserAssistant.mount(options)`로 전달하세요. 반환 함수는 도우미를 제거하므로 로그아웃 시 호출합니다. 연결 중인 음성의 사이트 지침을 바꾸려면 다시 마운트하세요. 언어·시간대 변경은 연결을 다시 준비하고 현재 화면부터 읽습니다.

문구 재정의 예: `translations={{'Hold to talk':'눌러서 말씀하세요'}}`.

## React와 Next.js

애플리케이션 상단에 한 번 배치하고 로그인 계정별 `sessionKey`를 지정합니다. React 18 이상을 피어 의존성으로 선언하며, 자동 예제 검사는 React 19를 사용합니다. 컴포넌트는 브라우저 DOM을 사용하므로 서버 렌더링하면 안 됩니다.

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
      locale="ko-KR"
      timeZone="Asia/Seoul"
    />
  );
}
```

Next.js 코드는 클라이언트 전용 로딩 예제이며 현재 자동 브라우저 검사 대상에는 포함되지 않습니다. 스타일은 Shadow DOM 안에 격리합니다. 인라인 스타일을 금지하는 CSP 환경은 배포 정책 또는 번들 구성을 조정해야 합니다. nonce 기반 CSP 연동은 아직 구현하지 않았습니다.

## 프롬프트 작성 팁

세 입력을 구분하세요.

- `instructions`: 어떻게 행동하고 답할지. 예: “짧게 답하고 실제 결과를 확인하세요. 대상이 여러 개면 사용자에게 물어보세요.”
- `siteContext`: 사이트 목적, 페이지, 업무 용어, 작업 순서. 예: “/customers에서 이름을 검색한 뒤 수정창을 엽니다. 메모는 저장 전까지 초안입니다.”
- `context`: 현재 바뀌는 사실. 예: `{section:'customers',selectedCustomerId:'demo-1'}`.

소스 코드 전체, 비밀값, 전체 고객 자료를 붙이지 마세요. 보이지 않는 버튼이 있다고 단정하거나, 실행 확인을 건너뛰게 하거나, 없는 기록을 추측하게 하지 마세요. 화면 텍스트와 사이트 설명은 참고 데이터이며 기본 지침을 대체하지 않습니다. 실제 업무 권한은 설치한 사이트의 서버에서 검사해야 합니다.

한국어 설정 예:

```js
{locale:'ko-KR', timeZone:'Asia/Seoul',
 instructions:'짧게 답하고 실제 결과를 확인하세요. 대상이 여러 개면 물어보세요.',
 siteContext:'/customers에서 고객 이름을 검색하고 수정창을 엽니다. 저장 완료 문구가 나오기 전까지 입력값은 초안입니다.'}
```

영어 설정 예:

```js
{locale:'en-US', timeZone:'America/New_York',
 instructions:'Keep answers brief. Verify visible outcomes. Ask when the target is ambiguous.',
 siteContext:'Search customers by name on /customers, then open Edit. Notes remain drafts until Save succeeds.'}
```

구체적인 요청 세 개와 대상이 모호한 요청 하나로 시작하세요. 실패한 화면의 라벨과 사이트 설명을 보완하고 서로 충돌하는 지침을 계속 추가하지 마세요.

## 개인정보와 실행 상태

화면 텍스트와 허용된 입력값이 AI 제공업체에 전달됩니다. 비밀번호·숨김·파일 입력과 일부 민감한 자동완성 항목을 제외하며 제한된 식별번호 패턴을 가립니다. 이것만으로 모든 개인정보를 식별하지는 못합니다. `data-agent-exclude`, `screen.exclude`, 수집 루트 제한을 해당 사이트에 맞게 설정하세요.

대화와 진행 중 요청은 같은 탭의 `sessionStorage`에 보관합니다. 기기나 탭 간에 동기화하지 않습니다. 새로고침 후에는 최신 화면을 읽고 재개합니다. 저장소가 막히면 현재 페이지 메모리만 사용합니다. 같은 출처의 스크립트가 저장소를 읽을 수 있으므로 비밀 저장소로 취급하지 마세요. 로그아웃 시 도우미를 제거하고 계정별 대화 키를 사용하세요. 브라우저의 탭 복원 정책에 따라 저장소가 복원될 수 있으며, 제품은 장기 보관·삭제 서비스를 제공하지 않습니다.

중지는 이후 도구 실행을 막고 음성 연결을 닫습니다. HTTP 취소는 전송 계층이 지원하는 범위에서 AI 제공업체로 전달합니다. 이미 전달된 웹사이트 저장이나 AI 요청이 완료되거나 비용이 발생할 수 있습니다. 중지는 되돌리기가 아닙니다. 임의의 웹사이트에서 새로고침을 넘는 정확히 한 번 실행을 보장하지 않습니다.

## 문제 해결

- 401: 기존 로그인과 서버 토큰을 확인합니다. 브라우저에 서버 토큰을 넣어 해결하면 안 됩니다.
- 403: 허용 출처의 프로토콜·호스트·포트를 확인합니다.
- 429 또는 동시 요청 503: 잠시 기다리거나 운영 한도를 조정합니다.
- 마이크 사용 불가: HTTPS 또는 localhost, 브라우저 권한을 확인합니다.
- 반복 권한 안내: 같은 연결에서는 트랙을 재사용하지만, 연결 종료·권한 만료·브라우저 설정에 따라 안내가 다시 나올 수 있습니다.
- 요소를 못 찾음: 표준 HTML·ARIA와 실제 라벨을 사용합니다. canvas·iframe 내부·사이트 자체 Shadow DOM은 지원 범위 밖입니다.
- 느린 저장 결과가 불명확함: 처리 중 `aria-busy="true"`와 완료·오류 문구를 표시합니다.
- 버전 불일치: 프로토콜 버전 1의 클라이언트·서버를 함께 배포합니다.

서버 로그는 요청 식별자·메서드·경로·상태·소요 시간만 포함합니다. `X-Request-Id` 또는 응답 JSON의 `requestId`로 조회하세요. 인증 헤더, SDP, 대화 본문, 화면 전체를 운영 로그에 추가하지 마세요.

## GPT-Live 음성 연결

페이지를 열거나 네트워크가 복구되어도 음성 연결을 자동 생성하지 않습니다. 첫 버튼 입력에서 마이크 권한을 확인한 뒤 연결합니다. 권한을 기다리다가 버튼을 놓으면 유료 연결을 생성하지 않습니다. 연결 요청이 이미 전달된 경우 초기 요금이 발생할 수 있습니다.

버튼을 누르는 동안만 마이크 트랙을 활성화합니다. 놓으면 즉시 마이크 트랙을 비활성화하고 WebRTC에는 무음만 전달합니다. 발화 종료를 수동 확정하는 Realtime 명령은 사용하지 않으며 GPT-Live가 응답 시점을 판단합니다. 터치 취소·창 이탈은 마이크를 끄고 세션을 닫습니다. 글 입력은 기존 `/chat`을 사용하며 음성 세션은 닫습니다.

음성 대화는 GPT-Live가 담당하고, 화면 도구 선택은 `OPENAI_MODEL`의 Responses 모델에 위임합니다. 실제 조작과 사용자 확인은 기존 브라우저 도구가 수행합니다. 새로운 버튼 입력은 이전 작업의 후속 조작을 무효화합니다. 이미 실행한 조작을 되돌리지는 않습니다.

기본 유휴 시간은 60초입니다. 버튼 입력, 수신 음성, 자막, 작업 진행이 있으면 유휴 시간을 다시 계산합니다. 도구 실행과 사용자 확인을 기다리는 동안은 유휴 종료를 미룹니다. `VOICE_SESSION_SECONDS`의 전체 연결 제한은 별도로 적용합니다. 중지 버튼으로 즉시 종료할 수도 있습니다. 종료 시 `session.close`를 보내고 최종 사용량 이벤트를 기다린 뒤 연결을 해제합니다.

GPT-Live는 마이크가 꺼져 있어도 열린 세션 시간에 과금합니다. 현재 분당 $0.05이며 작업 모델·도구 비용은 별도입니다. WebRTC 생성 시 15초분을 청구하고 실행 세션의 시간 요금에서 상계합니다. [공식 과금 안내](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live)를 확인하세요.

새 클라이언트에는 `/live`를 지원하는 서버가 필요합니다. 인증 프록시의 허용 경로에 `/live`를 추가하세요. 기존 `/realtime` 엔드포인트와 `OPENAI_REALTIME_MODEL`은 이전 클라이언트 호환용으로 남아 있습니다.
