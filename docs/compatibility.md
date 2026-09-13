# Compatibility and verification

## Release scope

Version 0.1.0 is an alpha for semantic HTML controls and browser-rendered React applications. It supports observed buttons, links, text inputs, native select/checkbox controls, common dialog flows, and scrolling. The SDK is browser-only; Next.js client-only loading is documented but not in the automated example matrix.

| Environment                | Automated coverage                          | Physical-device microphone check   |
| -------------------------- | ------------------------------------------- | ---------------------------------- |
| Chromium desktop           | screen tools, UI, mocked voice, resume/stop | Not performed                      |
| Firefox desktop            | screen tools, UI, mocked voice, resume/stop | Not performed                      |
| WebKit desktop             | screen tools, UI, mocked voice, resume/stop | Not performed                      |
| Android Chromium emulation | mobile layout and the same regressions      | Not performed on an Android device |
| iPhone WebKit emulation    | mobile layout and the same regressions      | Not performed on an iPhone         |

These are Playwright-managed engines, not claims of certification for every branded browser/version. CI installs engines matching the locked Playwright version. Mock microphone checks prove SDK lifecycle behavior, not physical capture quality or browser permission UX.

Known boundaries: iframe content, canvas controls, closed or site-owned Shadow DOM, unlabelled custom clickable elements, native OS dialogs, browser chrome, arbitrary JavaScript evaluation, external-site tab control and guaranteed exactly-once execution across reloads are outside the release scope. Content extraction is bounded and can return `truncated:true`. Long asynchronous operations should expose `aria-busy` and visible status/error text.

## Manual device checklist

Before relying on voice on a target device, record its model, OS version, browser version, URL scheme and test date. Check: first permission grant; repeated holds without unnecessary re-acquisition; no captured speech while released; touch cancellation; switching apps/tabs; reconnect; playback after a user gesture; and stop. Do not mark this checklist complete based only on emulation.

## 한국어

0.1.0은 표준 HTML과 브라우저에서 렌더링한 React 화면을 대상으로 하는 알파 버전입니다. Chromium·Firefox·WebKit과 Android·iPhone 화면 에뮬레이션에서 화면 조작·언어·배치·모의 음성·재개·중지를 자동 검사합니다.

**실제 iPhone·Android 기기의 마이크 검사는 아직 수행하지 않았습니다.** 자동 엔진 검사를 모든 실제 브라우저의 인증이나 음성 품질 보장으로 해석하면 안 됩니다. 실제 배포 기기에서 첫 권한 허용, 반복 누르기, 손을 뗀 동안의 음성 차단, 터치 취소, 앱 전환, 재연결, 음성 재생과 중지를 확인해야 합니다.

iframe 내부, canvas, 사이트 자체 Shadow DOM, 라벨 없는 비표준 요소, 운영체제 대화상자, 브라우저 자체 UI, 다른 사이트의 탭 제어와 새로고침을 넘는 정확히 한 번 실행은 지원 범위 밖입니다. 오래 걸리는 작업은 `aria-busy`와 완료·오류 문구를 표시하세요.
