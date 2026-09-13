# 첫 작업을 실행하는 튜토리얼

[English](tutorial.md) · [사용 안내](guide.ko.md)

## 1. 백엔드 실행

README 순서대로 저장소를 내려받고 `npm ci`, `.env.example` 복사, `OPENAI_API_KEY` 설정 후 `npm start`를 실행합니다. 이 루프백 전용 튜토리얼에서는 `SERVER_TOKEN`을 비워 둘 수 있습니다. `http://localhost:8796/demo`를 엽니다.

가상 고객 표, 하단 응답 표시, 마이크 버튼이 보여야 합니다. 코드스텝 계정은 필요하지 않습니다.

## 2. 글로 요청

하단 **How can I help?**를 눌러 대화를 펼치고 입력합니다.

> Find Mina, open her profile, and change the note to Follow up Friday. Do not save yet.

AI가 화면을 읽고 필요한 경우 검색한 뒤 Edit를 눌러 메모를 입력해야 합니다. 수정창이 열린 상태로 남고 아직 저장 완료 문구가 나오면 안 됩니다.

## 3. 저장 확인

**Save the change.**를 입력합니다. 실행 확인 카드의 대상과 입력 내용을 읽고 **Confirm and run**을 누릅니다. 화면에 **Saved for Mina Kim**이 표시돼야 합니다. 실제 고객 시스템이 아니라 현재 페이지의 가상 데이터만 변경합니다.

다른 메모로 다시 시도하면서 **Cancel**을 선택해 취소도 확인하세요. 확인 카드가 열린 동안 폼을 변경하면 기존 내용에 대한 확인은 거절됩니다.

## 4. 음성 요청

마이크 버튼을 누르고 필요한 경우 브라우저 권한을 허용합니다. 누르는 동안 말하고 놓으면 전송합니다. 손을 뗀 동안에는 오디오 트랙이 비활성화되고 송신에서 분리되며, AI 작업은 계속됩니다. 하단 응답을 누르면 전체 대화가 펼쳐지고 Stop으로 이후 작업을 중지할 수 있습니다.

HTTPS 또는 localhost를 사용하세요. 자동 마이크 검사는 모의 검사이므로 실제 기기 동작은 별도로 확인해야 합니다. 브라우저 권한 표시는 브라우저가 관리합니다.

## 5. 한국어로 변경

**Assistant connection**에서 한국어를 선택하고 **Connect assistant**를 누릅니다. 도우미 문구가 한국어로 바뀝니다. 예제 고객 웹사이트의 영어 문구는 그대로입니다. “Mina의 수정창을 열어줘.”라고 요청해 보세요.

언어 설정은 도우미에 적용되며 설치한 웹사이트 자체를 번역하는 기능이 아닙니다.

## 6. React 확인

`/react`를 열고 **Change the customer name to Alex and save.**라고 요청합니다. React 입력값이 바뀌고 저장 전에 실행 확인을 요구해야 합니다. 이 예제는 스크립트 대신 `<BrowserAssistant>`를 사용합니다.

## 7. 자기 사이트 연결

앱 상단에 컴포넌트를 한 번 배치하거나 `widget.js`를 제공합니다. `serverUrl`, 계정별 `sessionKey`, `locale`, `timeZone`, 짧은 `siteContext`를 지정합니다. 민감한 영역은 `data-agent-exclude`로 제외합니다.

다른 사용자가 접속하게 하기 전에는 사용 안내의 인증 연결 예제를 완료하세요. 서버 토큰과 AI 제공업체 API 키는 클라이언트 코드에 넣지 않습니다.

## 8. 실행 영상 재현

녹화 스크립트는 인증 연결 예제와 실제 AI 요청을 사용합니다. 자격 증명을 녹화하거나 실제 고객 자료를 수정하지 않습니다.

```sh
# 먼저 .env에 SERVER_TOKEN과 DEMO_LOGIN_PASSWORD를 설정합니다.
npm start
# 두 번째 터미널:
npm run demo:gateway
# 세 번째 터미널, Chromium 설치 후:
npm run record:demo
```

`.local/recording/`에 WebM을 저장합니다. FFmpeg가 설치돼 있으면 `docs/media/demo.mp4`도 생성합니다. 모델 응답과 소요 시간은 달라질 수 있습니다. 스크립트는 실제 화면 결과를 기다리고 시간 초과 시 실패하며, AI 응답을 가짜로 대체하지 않습니다.
