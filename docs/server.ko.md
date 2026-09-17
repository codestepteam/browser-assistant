# 서버 실행·배포

[클라이언트 설치로 돌아가기](../README.ko.md) · [English](server.md)

이 문서는 도우미 서버를 운영하는 사람을 위한 안내입니다. 클라이언트를 설치하는 사람은 서버 주소만 받으면 됩니다. 현재 서버는 소스에서 실행하며 npm 실행 명령이나 관리형 서비스는 아직 제공하지 않습니다.

## 로컬 개발

예시는 웹사이트 `http://localhost:3000`과 도우미 서버 `http://localhost:8796`을 같은 컴퓨터에서 실행하는 구성입니다. Node.js 22.14 이상과 npm이 필요합니다.

```sh
git clone https://github.com/codestepteam/browser-assistant.git
cd browser-assistant
npm ci
cp .env.example .env
```

`npm ci`가 배포 파일을 빌드합니다. `.env`에서 다음 값을 설정하세요.

```dotenv
HOST=127.0.0.1
PORT=8796
OPENAI_API_KEY=여기에_발급받은_API_키
OPENAI_LIVE_MODEL=gpt-live-1
OPENAI_MODEL=gpt-5.6-luna
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8796,http://127.0.0.1:8796
SERVER_TOKEN=
```

`ALLOWED_ORIGINS`는 도우미를 삽입할 웹사이트 주소입니다. 웹사이트가 다른 포트에서 실행된다면 그 주소로 바꾸세요. `SERVER_TOKEN`을 비워 두는 예시는 자기 컴퓨터의 루프백 개발 전용입니다.

```sh
npm start
```

- 상태 확인: [http://localhost:8796/health](http://localhost:8796/health)
- 클라이언트 스크립트: [http://localhost:8796/widget.js](http://localhost:8796/widget.js)
- 동작 예제: [http://localhost:8796/demo](http://localhost:8796/demo)

클라이언트에는 `serverUrl="http://localhost:8796"` 또는 `data-server-url="http://localhost:8796"`을 지정합니다. 별도의 프록시 경로를 만들지 않아도 로컬 연결을 시험할 수 있습니다.

## 운영 배포

클라이언트 배포와 서버 배포는 별개입니다. 서버는 Node.js를 실행할 수 있는 환경에서 빌드한 뒤 `npm start`로 실행합니다. 서버의 환경 변수에 AI 제공업체 API 키를 설정하고, 브라우저나 공개 저장소에 포함하지 마세요.

현재 제공되는 운영 구성은 사이트의 로그인 서버 또는 인증 프록시가 `SERVER_TOKEN`을 붙여 도우미 서버로 전달하는 방식입니다. `NODE_ENV=production` 또는 외부 인터페이스로 서버를 실행할 때는 `SERVER_TOKEN`이 필요합니다. 백엔드는 루프백 또는 사설망에 두고 공개 진입점에는 HTTPS와 사용자 인증을 적용하세요.

예를 들어 웹사이트의 인증된 API 주소가 `https://your-site.example/assistant`이면 클라이언트의 `serverUrl`에 **그 전체 주소**를 지정합니다. 이 주소는 예시이며 실제 배포한 주소로 바꿔야 합니다. 프록시는 `/health`, `/chat`, `/live` 요청을 도우미 서버로 전달합니다.

별도 API 도메인으로 브라우저를 직접 연결하는 운영 인증은 현재 기본 SDK에 완성되어 있지 않습니다. 기본 요청은 같은 출처의 자격 증명만 전달하므로, 별도 도메인에 주소만 넣어도 로그인 연동이 된다고 가정하면 안 됩니다. `ALLOWED_ORIGINS`는 로그인 인증을 대신하지 않으며 `SERVER_TOKEN`을 클라이언트에 노출해서도 안 됩니다.

인증 프록시 예제, 요청 제한, HTTPS 설정은 [상세 운영 안내](guide.ko.md)를 참고하세요. npm·CDN에 클라이언트를 게시하더라도 서버 배포와 인증 설정은 별도로 필요합니다.
