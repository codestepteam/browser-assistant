# 프로토콜 1 도구 명세

[English](api.md) · [전체 입력·출력 예제](../examples/tool-roundtrip.json)

## HTTP 연결

본문은 JSON이며 기본 주소는 설정으로 지정합니다. 인증 연결 예제는 `/assistant` 아래에 다음 경로를 제공합니다.

- `GET /health`: `{ok,configured,protocolVersion:1,voiceApi:"live",voiceIdleSeconds,voiceSessionSeconds}`.
- `POST /chat`: `{prompt,context?,history?,continuation?,instructions?,siteContext?,locale?,timeZone?,protocolVersion?:1}`. 응답은 `{reply,calls,responseItems,usage?}`입니다. `calls` 항목은 `{name,argumentsJson,callId}`입니다.
- `POST /live`: `{sdp,context?,instructions?,siteContext?,locale?,timeZone?,protocolVersion?:1}` → `{sdp,sessionId}`. GPT-Live WebRTC 연결을 생성합니다. AI 제공업체 API 키는 서버에서만 사용합니다.
- `POST /realtime`: `{sdp,context?,instructions?,siteContext?,locale?,timeZone?,protocolVersion?:1}`. 응답은 SDP 답변 `{sdp}`입니다.

`locale`는 `en-US` 또는 `ko-KR`, `timeZone`은 유효한 IANA 시간대입니다. 요청 문장 4,000자, 지침 8,000자, 사이트 설명 16,000자, 현재 문맥 직렬화 24,000자까지 허용합니다. 과거 대화는 12항목·30,000자, 이어가기는 100항목·240,000자 제한입니다. 지원하지 않는 역할·도구·프로토콜 버전은 거절합니다.

대부분의 설치자는 SDK가 도구 반복 실행을 처리하므로 HTTP 반복 로직을 직접 작성할 필요가 없습니다.

## 세 도구

`get_current_view` 입력은 빈 객체입니다.

```json
{}
```

`use_element` 입력 예:

```json
{
  "ref": "e2",
  "action": "fill",
  "value": "Mina",
  "expectedRevision": "page-token:1",
  "requestId": "fill-1"
}
```

`click`은 `value:null`, `fill`은 문자열·숫자, `select`는 관찰한 선택지 값, `check`는 불리언을 사용합니다. 로컬 대화 연결부는 `{name,argumentsJson:JSON.stringify(input)}`으로 감싸 전달합니다.

`scroll_view` 입력 예:

```json
{
  "region": "e1",
  "direction": "down",
  "expectedRevision": "page-token:2",
  "requestId": "scroll-1"
}
```

영역은 `page`, `dialog` 또는 관찰한 스크롤 요소의 ref입니다. 방향은 `up`, `down`, `top`, `bottom`입니다.

모든 도구는 `{ok,state:{view}}` 형태로 최신 화면을 반환합니다. `view`에는 제목·URL·화면 버전·중첩된 `children`·로딩 여부·잘림 여부·안내 문구·스크롤 위치가 포함됩니다. 자세한 JSON은 영어 명세와 전체 예제 파일에 있습니다.

스크롤 요소는 `scrollTop`, `scrollHeight`, `clientHeight`도 제공합니다. 일부만 반환한 값은 `valueTruncated`, 일부만 반환한 선택지는 `moreOptions`로 알립니다. 숨김 요소와 도우미 자체는 제외합니다. 내부의 평면 요소 인덱스는 전송 형식에 포함되지 않습니다.

화면 버전은 페이지 인스턴스별 토큰을 포함합니다. 최신 ref와 버전만 사용하세요. 같은 요청 ID와 입력은 중복 클릭하지 않으며, 같은 ID의 입력 변경은 거절합니다. 이 중복 방지는 크기가 제한된 메모리 기록이므로 새로고침을 넘는 트랜잭션 보장은 아닙니다.

확정 작업 또는 판단할 수 없는 클릭은 실행 확인 카드를 기다립니다. 도구 인자로 확인을 대신할 수 없습니다. 확인 중 폼이 바뀌면 실행하지 않습니다. 사용자가 취소하면 `USER_CANCELLED`를 반환합니다.

## 오류와 중지

HTTP 오류는 `{error,code,requestId}`, 도구 오류는 `{ok:false,state:{view},error:{code,message}}`입니다. 인증·출처·입력 오류, 요청 한도, 서버 사용 중, AI 제공업체 오류를 코드로 구분합니다. 자세한 코드 목록은 영어 명세와 소스에 있습니다.

`ok:true`는 로컬 조작의 성공을 뜻합니다. 실제 저장 완료를 뜻하지 않습니다. 로딩 상태, 안내·오류 문구와 최신 입력값·목록으로 결과를 확인해야 합니다. 네트워크 작업의 결과가 불명확하면 자동 반복하지 말고 불확실성을 설명해야 합니다.
