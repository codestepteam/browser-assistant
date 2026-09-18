# npm publishing

Package: `@codestepteam/browser-assistant`. Registry: `https://registry.npmjs.org/`.

## Automatic updates

`.github/workflows/ci.yml` verifies pushes to `main` and `production`. After a protected `production` push passes verification, its `publish` job builds the package and publishes with npm trusted publishing (OIDC).

- Pull requests never publish.
- `main` is the development branch and never publishes.
- Only the current `production` commit is eligible; older runs skip publication.
- The publish job uses the `production` GitHub environment, which must allow only the protected `production` branch.
- The source version is a release baseline. The first release uses `0.2.0`; later pushes use the next unused patch version, unless the source specifies a higher version.
- The generated version is written only in CI, avoiding release commits that trigger another release.
- A rerun skips a commit already present in npm `gitHead` metadata.
- Publishing jobs run one at a time. After publishing, the job verifies the version's `gitHead` against the source commit.
- The `latest` npm tag follows successful publications. Installed applications still need `npm update` and a rebuild. A pinned CDN URL stays pinned.

## First publication and trust setup

The npm account needs write access to the `@codestepteam` scope. GitHub organization membership alone does not grant npm scope access.

1. Log in with `npm login --auth-type=web` and complete npm's authentication prompts.
2. Commit the tested release source so published `gitHead` identifies it.
3. Run the checks, build and package verification, then publish the initial package with `npm publish --access public --ignore-scripts`.
4. Configure the package's trusted publisher on npm:
   - GitHub organization: `codestepteam`
   - Repository: `browser-assistant`
   - Workflow filename: `ci.yml`
   - Environment: `production`
   - Allow direct publishing with `npm publish`.
5. Merge a tested release PR into `production` and inspect the Verify workflow's `publish` job. A commit already published manually is skipped; the next new production commit exercises automatic publishing.

With npm 11.15+ you can also configure trust using the CLI; npm may request two-factor authentication:

```sh
npm trust github @codestepteam/browser-assistant \
  --repo codestepteam/browser-assistant \
  --file ci.yml \
  --env production \
  --allow-publish \
  --yes
```

No `NPM_TOKEN` repository secret is needed. Authentication and npm ownership must be configured before publishing can succeed. [Official trusted-publisher instructions](https://docs.npmjs.com/trusted-publishers/).

## Verification commands

```sh
npm ci
npm run check
npm run format:check
npm test
npm run test:gateway
npm run test:package
npm run check:publication
npx playwright install chromium firefox webkit
npm run test:browser
```

The package contains `dist/widget.js`, so a pinned CDN script URL after publication is:

```text
https://cdn.jsdelivr.net/npm/@codestepteam/browser-assistant@0.2.0/dist/widget.js
```

This URL becomes usable only after that version is public. The CDN serves the client; it does not provide an assistant API server. See [Server setup](server.md).

## 한국어 요약

`main`과 `production`에 푸시하면 전체 검사를 실행합니다. `main`은 개발용 검사만 실행하며, 보호된 `production`에 반영된 커밋만 전체 검사 성공 후 npm에 새 버전을 자동 게시합니다. 원격 `production`의 최신 커밋이 실행 커밋과 다르면 게시를 건너뜁니다. 같은 버전은 덮어쓰지 않고 패치 번호를 증가시키며, 같은 커밋의 재실행도 건너뜁니다. 버전 변경을 저장소에 다시 커밋하지 않아 무한 배포가 발생하지 않습니다.

최초 게시에는 npm 로그인과 `@codestepteam` 게시 권한이 필요합니다. 최초 게시 후 npm의 신뢰 게시 설정에 `codestepteam/browser-assistant`, `ci.yml`, `production` 환경, 직접 게시 허용을 등록합니다. 이후 GitHub Actions는 장기 토큰 없이 게시합니다.

npm 게시와 서버 배포는 별개입니다. 설치된 npm 패키지는 새 버전 게시만으로 자동 교체되지 않으므로 사용하는 프로젝트에서 업데이트와 빌드가 필요합니다. CDN URL의 버전을 고정하면 해당 버전을 계속 사용합니다.
