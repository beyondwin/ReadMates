# Cloudflare Pages 배포

Cloudflare Pages는 Vite SPA와, 같은 origin에서 동작하는 BFF/OAuth proxy 함수(`front/functions`)를 함께 배포합니다.

상위 문서는 [README.md](README.md), 멀티 클럽 도메인은 [multi-club-domains.md](multi-club-domains.md)입니다. 예시의 `https://app.example.com`은 Pages 운영 origin placeholder입니다.

완료 기준: Pages project 설정, Functions routing, Spring origin 설정, Google OAuth redirect URI가 서로 맞고, 배포 후 SPA deep route, `/api/bff/api/auth/me`, OAuth start redirect, domain marker, club public API가 확인됩니다.

Cloudflare 계정 ID, API token, custom domain 목록, secret 값은 문서에 쓰지 않습니다. Cloudflare UI나 plan 한도는 바뀔 수 있으니 설정 전에 현재 문서를 확인합니다.

## 프로젝트 설정

| 항목 | 값 |
| --- | --- |
| Project name | `readmates` |
| 운영 branch | `main` |
| Framework preset | `Vite` 또는 `None` |
| Root directory | `front` |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Build output directory | `dist` |

- Production 배포는 `Deploy Front` workflow가 Wrangler로 직접 올립니다(`wrangler pages deploy dist --project-name readmates --branch main`). 위 build 설정은 Pages 쪽 build(deploy hook 등)를 쓸 때의 기준입니다.
- Root가 `front`이므로 Pages Functions는 `front/functions`에서 배포됩니다.
- Cloudflare Pages 기본 host는 무료 플랜에서도 유지되는 path fallback입니다. 모든 클럽은 `<pages-origin>/clubs/<club-slug>`로 접근할 수 있어야 하고, primary domain이나 club host를 추가해도 이 fallback을 없애지 않습니다.

## 현재 함수 라우트

- `/api/bff/**`: 브라우저 API 호출을 Spring `/api/**`로 전달합니다.
- `/oauth2/authorization/**`: Google OAuth 시작 요청을 Spring으로 전달합니다.
- `/login/oauth2/code/**`: OAuth callback을 Spring으로 전달하고 upstream `Set-Cookie`를 보존합니다.
- `/api/bff/__internal/secret-status`: BFF secret rotation 진단용 route입니다.

신뢰 규칙:

- 브라우저가 보낸 `X-Readmates-Club-Slug`, `X-Readmates-Club-Host`는 그대로 믿지 않습니다. `/clubs/<club-slug>` fallback은 검증된 slug를 `clubSlug` query로, registered host는 request host를 Spring에 넘깁니다.
- 변경성 `/api/host/**` 요청은 browser bundle이 `X-Readmates-Client-Contract: v2`를 보내야 합니다. 정확한 값만 upstream으로 다시 만들고, 없거나 다르면 upstream 호출 전에 `409 HOST_CLIENT_UPGRADE_REQUIRED`로 거절합니다. 값을 무조건 주입하면 열려 있는 구버전 탭이 새 contract를 잘못 부를 수 있어 금지합니다.

`front/public/_redirects`는 함수 pass-through를 SPA fallback보다 위에 둡니다.

```text
/api/bff/* /api/bff/:splat 200
/oauth2/authorization/* /oauth2/authorization/:splat 200
/login/oauth2/code/* /login/oauth2/code/:splat 200
/* /index.html 200
```

`front/public/_headers`는 build output에 복사되어 보안 header를 붙입니다. CSP는 `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`를 포함합니다. 새 외부 asset이나 API origin을 추가할 때는 BFF 경계와 함께 검토합니다.

## 운영 환경 변수

| 이름 | 설명 |
| --- | --- |
| `VITE_PUBLIC_PRIMARY_DOMAIN` | public canonical URL용 primary domain. build-time 공개 값이며 secret이 아닙니다. 없으면 비워 두고, Pages 기본 host는 `noindex` fallback으로만 씁니다. |
| `READMATES_API_BASE_URL` | Spring API의 HTTPS origin, 예: `https://api.example.com`. origin만 넣고 query/fragment는 붙이지 않습니다. |
| `READMATES_BFF_SECRET` | 공유 secret(fallback). `READMATES_BFF_SECRETS`가 없을 때 씁니다. |
| `READMATES_BFF_SECRETS` | rotation 중 쓰는 쉼표 구분 목록. 첫 non-blank 값이 Spring으로 보내는 primary이고, 설정되면 `READMATES_BFF_SECRET`보다 우선합니다. |
| `BFF_SECRET_ROTATION_STAGE` | 진단 route에 보이는 rotation 단계. `stable`(기본) 또는 `staging`. |

- BFF secret에는 `VITE_` 접두사를 붙이지 않습니다. Pages Functions 환경 변수/secret으로만 설정합니다.
- `VITE_PUBLIC_PRIMARY_DOMAIN`은 fallback route에서도 `https://<club-slug>.<primary-domain>/...` canonical을 그리려면 production build 환경에 있어야 합니다.
- Preview 배포에는 운영 BFF secret을 넣지 않습니다. 필요하면 별도 preview Spring과 별도 secret을 씁니다.

## Cloudflare Pages GitHub Actions 배포

정상 production 경로:

1. `main`에 변경을 병합하고 검증을 끝냅니다.
2. annotated release tag `vX.Y.Z`를 push합니다. 이것은 server image만 build/scan/promote합니다.
3. 서버/API 변경이 있으면 OCI backend를 같은 tag로 올리고 Flyway/health/BFF를 확인합니다.
4. `Deploy Front`를 수동 실행합니다.

   ```bash
   gh workflow run "Deploy Front" --ref main -f release_tag=vX.Y.Z
   ```

5. workflow가 tag와 checkout commit이 같은지 확인하고, lint/test/build 후 `front/dist`와 `front/functions`를 production에 올립니다.
6. [배포 확인](#배포-확인)을 실행합니다.

- `main` push나 tag push만으로는 frontend production 배포가 일어나지 않습니다.
- Wrangler로 직접 업로드했다면 배포한 commit을 기록하고, `main`과 release tag가 같은 commit을 가리키게 맞춥니다.
- Major host-write contract 릴리즈에서는 backend promotion부터 frontend 배포 완료까지 구 BFF의 host mutation이 409로 막히는 것이 정상입니다. 같은 tag의 SPA와 Functions가 배포되면 쓰기가 다시 됩니다. frontend만 이전 tag로 되돌리면 host write는 계속 막히므로, 호환 frontend를 다시 배포하거나 backend를 rollback/forward-fix합니다.

실행 방법의 세부 사항은 [Cloudflare 프론트 배포 보조 절차](../../deploy/cloudflare/README.md)를 봅니다.

## Google OAuth 설정

Google Cloud OAuth client에는 callback이 실제로 도착하는 auth origin마다 redirect URI를 등록합니다.

```text
https://app.example.com/login/oauth2/code/google
https://<primary-domain>/login/oauth2/code/google
```

- OAuth start는 Pages나 registered host 어디서든 시작할 수 있습니다. Google에 보내는 `redirect_uri`는 `READMATES_AUTH_BASE_URL`의 primary auth origin으로 모읍니다.
- 성공 후에는 signed return state로 검증된 경우에만 원래 클럽 path나 club host로 돌아갑니다. 일반 로그인은 `/app`으로 갑니다.
- 그래서 club host를 Google redirect URI에 모두 추가하지 않습니다. callback 자체를 특정 host에서 받도록 바꿀 때만 그 host를 추가합니다.

OAuth proxy는 HTML navigation 실패를 `/auth/error?kind=...`(`Cache-Control: no-store`)로 바꿉니다. upstream body, 내부 host, secret은 보여주지 않고, `/auth/error`로의 재귀 복귀는 거절합니다. Non-HTML 요청은 JSON status를 그대로 받습니다.

## Spring과 맞춰야 하는 값

Cloudflare origin과 Spring 설정은 같은 브라우저 origin 집합을 봐야 합니다. primary auth origin이 아직 없으면 `READMATES_AUTH_BASE_URL`을 `READMATES_APP_BASE_URL`과 같게 둡니다.

```bash
READMATES_APP_BASE_URL=https://app.example.com
READMATES_AUTH_BASE_URL=https://app.example.com
READMATES_AUTH_RETURN_STATE_SECRET='{return-state-signing-secret}'
READMATES_ALLOWED_ORIGINS=https://app.example.com,https://<primary-domain>,https://<registered-club-host>
READMATES_BFF_SECRET=<shared-bff-secret>
# 무중단 rotation 중에만 설정. 있으면 READMATES_BFF_SECRET보다 우선합니다.
READMATES_BFF_SECRETS=<new-secret>,<old-secret>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED=true
READMATES_IP_HASH_BASE_SECRET=<openssl rand -base64 32으로 생성>
READMATES_AUTH_SESSION_COOKIE_SECURE=true
```

- `READMATES_ALLOWED_ORIGINS`에는 실제로 쓰는 origin만 넣습니다. `ACTIVE` club domain은 DB에서 자동으로 더해집니다([multi-club-domains.md](multi-club-domains.md#allowed-origins)).
- `READMATES_API_BASE_URL`은 HTTPS여야 합니다. Pages가 cookie와 BFF secret을 upstream으로 보내므로 plaintext Spring listener를 직접 가리키지 않습니다. 운영에서는 compose 안의 Caddy가 TLS를 종료합니다.

## 배포 확인

```bash
APP_ORIGIN='https://app.example.com'
CLUB_SLUG='{club-slug}'
curl -sS -o /dev/null -w '%{http_code}\n' "$APP_ORIGIN/app"
curl -sS -o /dev/null -w '%{http_code}\n' "$APP_ORIGIN/api/bff/api/auth/me"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "$APP_ORIGIN/oauth2/authorization/google"
curl -sS "$APP_ORIGIN/.well-known/readmates-domain-check.json"
curl -sS "$APP_ORIGIN/api/bff/api/public/clubs/${CLUB_SLUG}"
READMATES_SMOKE_BASE_URL="$APP_ORIGIN" \
READMATES_SMOKE_AUTH_BASE_URL="$APP_ORIGIN" \
./scripts/smoke-production-integrations.sh
```

기대값:

- `/app`: `200`. 로그인 후 가입 클럽이 하나면 그 클럽, 여럿이면 클럽 선택 화면으로 갑니다.
- `/api/bff/api/auth/me`: Spring까지 도달합니다. 로그아웃 상태여도 anonymous `200`일 수 있습니다.
- `/oauth2/authorization/google`: Google OAuth로 redirect됩니다.
- `/.well-known/readmates-domain-check.json`: ReadMates Pages marker를 반환합니다.
- `/api/bff/api/public/clubs/<club-slug>`: 그 클럽의 공개 가능한 정보만 반환합니다.
- `/clubs/<club-slug>/app/...`, `/clubs/<club-slug>/invite/<token>`, `/invite/<token>`, `/reset-password/<token>` 같은 deep route는 Cloudflare 404가 아니라 SPA로 들어갑니다.

## Registered Club Host 운영

등록형 subdomain이나 custom domain은 DB의 `club_domains.status`와 실제 Cloudflare 연결 상태를 따로 관리합니다.

1. Platform admin UI에서 domain을 만들면 `ACTION_REQUIRED` 상태가 됩니다.
2. 운영자가 Cloudflare dashboard나 Wrangler로 Pages custom domain을 연결합니다. 연결과 인증서가 확인될 때까지 사용자에게는 `/clubs/<club-slug>` fallback을 안내합니다.
3. Admin UI에서 상태 확인을 실행하면 Spring이 그 host의 `/.well-known/readmates-domain-check.json`을 HTTPS로 확인해 `ACTIVE` 또는 `FAILED`로 바꿉니다. redirect는 따르지 않고, private/loopback 등 내부 주소나 너무 큰 응답은 실패로 처리합니다.

상태별 의미와 처리는 [multi-club-domains.md](multi-club-domains.md#cloudflare-pages-custom-domain-runbook)를 따릅니다.

## 수동 검증 체크리스트

curl smoke 외에 사용자 흐름까지 볼 때 씁니다.

1. 공개 홈이 렌더링됩니다.
2. `/app` 같은 deep route가 404가 아니라 SPA를 렌더링합니다.
3. Google login 클릭 시 `/oauth2/authorization/google`로 나갑니다.
4. 정식 멤버는 로그인 후 `/app`으로 들어갑니다.
5. 초대 없이 들어온 새 사용자는 `/app`으로 가서 둘러보기 멤버 안내와 읽기 전용 화면을 봅니다. `/app/pending`도 호환 route로 열립니다.
6. 호스트가 `/app/host/members`에서 둘러보기 멤버를 정식 멤버로 바꾸고 표시 이름을 고칠 수 있습니다.
7. 호스트가 `/app/host/sessions/new`에서 `DRAFT` 세션을 만들고, 편집 화면에서 공개 범위를 `MEMBER`/`PUBLIC`으로 바꾼 뒤 시작할 수 있습니다.
8. 호스트가 `OPEN` 세션을 `CLOSED`로 닫고 공개 요약 저장 후 `PUBLISHED`로 발행할 수 있습니다.
9. 정식 멤버가 `/app`을 reload해도 멤버 route에 머뭅니다.
10. 둘러보기 멤버는 피드백 문서 route에 들어갈 수 없습니다.
11. 피드백 문서의 `PDF로 저장` action은 숨겨져 있습니다(`feedbackDocumentPdfDownloadsEnabled=false`).
12. domain marker가 fallback host와 registered host 모두에서 나옵니다.

PDF 저장을 다시 켜려면 `front/shared/config/readmates-feature-flags.ts`를 바꾸고 `/app/feedback/:sessionId/print`가 데이터를 불러와 browser print를 한 번 호출하는지 따로 검증합니다.

## 문제 해결

| 증상 | 먼저 볼 것 |
| --- | --- |
| deep link가 404 | `_redirects`가 build output에 있는지, `/* /index.html 200`이 함수 규칙보다 아래인지 |
| 변경 요청 `/api/bff/**`가 403 | same-origin 검증, browser origin, Spring `READMATES_ALLOWED_ORIGINS` |
| 401 또는 세션 유지 안 됨 | cookie 설정, `READMATES_AUTH_SESSION_COOKIE_SECURE`, BFF 우회 여부 |
| `/api/bff/**`가 500 | `READMATES_API_BASE_URL` 누락 또는 Spring 도달 불가 |
| OAuth redirect mismatch | Google OAuth client, `READMATES_AUTH_BASE_URL`, Pages origin 불일치 |
| host 쓰기가 409 | frontend와 backend의 host-write contract 버전 차이 |

## 비용 상태 확인

Wrangler로 Pages 프로젝트, 배포, secret 이름은 볼 수 있습니다. 요금제는 Billing Read 권한이 필요할 수 있으므로 Cloudflare dashboard나 권한을 좁힌 API token으로 확인합니다.
