# Cloudflare Pages 배포

Cloudflare Pages는 Vite SPA와 같은 origin에서 동작하는 BFF/OAuth proxy 함수를 배포합니다.

상위 배포 허브는 [README.md](README.md)입니다. 승인된 포트폴리오 데모 URL은 `https://readmates.pages.dev`입니다. 멀티 클럽 도메인 운영 절차는 [multi-club-domains.md](multi-club-domains.md)를 함께 확인합니다.

## 프로젝트 설정

| 항목 | 값 |
| --- | --- |
| Project name | `readmates` |
| Git provider | GitHub |
| 운영 branch | `main` |
| Framework preset | `Vite` 또는 `None` |
| Root directory | `front` |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Build output directory | `dist` |

Cloudflare 프로젝트 root가 `front`이므로 Pages Functions는 `front/functions`에서 배포됩니다.

`https://readmates.pages.dev`는 무료 플랜에서도 항상 유지하는 fallback과 preview origin입니다. 클럽 공개 사이트는 기본적으로 `https://readmates.pages.dev/clubs/<club-slug>`로 접근할 수 있어야 하며, primary domain이나 등록된 club host를 추가해도 이 fallback을 제거하지 않습니다.

## 현재 함수 라우트

- `/api/bff/**`: 브라우저 API 호출을 Spring `/api/**`로 전달합니다.
- `/oauth2/authorization/**`: Google OAuth 시작 요청을 Spring으로 전달합니다.
- `/login/oauth2/code/**`: Google OAuth 콜백을 Spring으로 전달하고 upstream `Set-Cookie` 헤더를 보존합니다.

Pages Functions는 browser가 보낸 `X-Readmates-Club-Slug`, `X-Readmates-Club-Host`를 그대로 신뢰하지 않습니다. `/clubs/<club-slug>` path fallback은 검증된 slug를 `clubSlug` query로 BFF에 전달하고, registered host alias는 request host를 Spring에 전달합니다.

`front/public/_redirects`는 함수 pass-through 규칙을 SPA fallback보다 위에 둬야 합니다. Club path와 registered host alias deep link는 모두 SPA fallback으로 진입해야 합니다.

```text
/api/bff/* /api/bff/:splat 200
/oauth2/authorization/* /oauth2/authorization/:splat 200
/login/oauth2/code/* /login/oauth2/code/:splat 200
/* /index.html 200
```

`front/public/_headers`는 Vite build output으로 복사되어 public asset에 보안 헤더를 붙입니다. 현재 기준은 `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `connect-src 'self'`를 포함한 제한적인 CSP입니다. 새 외부 asset이나 API origin을 추가할 때는 실제 runtime 필요성, BFF 경계, 공개 문서 placeholder 정책을 함께 검토합니다.

## 운영 환경 변수

Cloudflare Pages 운영 환경에는 아래 값을 설정합니다.

| 이름 | 설명 |
| --- | --- |
| `VITE_PUBLIC_PRIMARY_DOMAIN` | Public canonical URL을 만들 primary domain입니다. Primary domain이 없으면 비워두고, `readmates.pages.dev`는 `noindex` fallback으로만 사용합니다. |
| `READMATES_API_BASE_URL` | OCI Spring API의 공개 HTTPS origin, 예: `https://api.example.com` |
| `READMATES_BFF_SECRET` | Spring `READMATES_BFF_SECRET`과 같은 공유 secret |

`READMATES_BFF_SECRET`은 브라우저 번들에 들어가면 안 됩니다. `VITE_` 접두사를 붙이지 말고 Pages Functions 환경 변수 또는 secret으로만 설정합니다.

`VITE_PUBLIC_PRIMARY_DOMAIN`은 Vite build-time public setting입니다. Secret이 아니며, `https://<club-slug>.<primary-domain>/...` canonical link를 Pages fallback route에서도 렌더링하려면 production build 환경에 설정해야 합니다. 실제 운영 primary domain은 공개 문서에 기록하지 않습니다.

Preview 배포에는 운영 BFF secret을 넣지 않습니다. Preview에서 API 접근이 필요하면 별도 preview Spring 환경과 별도 secret을 사용합니다.

프로덕션 secret 값은 Git에 기록하지 않습니다. Cloudflare Pages 환경 변수/secret 저장소와 Spring 운영 환경 파일에만 실제 값을 둡니다.

## Cloudflare Pages GitHub Actions 배포

프론트엔드 정상 배포 경로:

1. GitHub `main`에 변경을 병합하고 필요한 검증을 끝냅니다.
2. `vMAJOR.MINOR.PATCH` 형식의 release tag를 만들고 push합니다. 예: `git push origin v1.2.0`
3. `.github/workflows/deploy-front.yml`이 tag 대상 commit에서 `front`를 빌드합니다.
4. Wrangler가 `front/dist`와 `front/functions`를 Cloudflare Pages production으로 함께 배포합니다.
5. [README.md](README.md)의 smoke check를 실행합니다.

`main` push만으로는 production 배포가 실행되지 않습니다. 수동 workflow 실행과 로컬 deploy hook은 장애 대응용입니다. 직접 업로드를 사용했다면 배포한 commit을 기록하고 GitHub `main`과 release tag가 가리키는 commit을 다시 맞춥니다.

이 절차는 Cloudflare Pages의 프론트엔드 배포 흐름입니다. Spring Boot 백엔드 프로덕션 배포가 GitHub Actions로 이미 구성되어 있다고 가정하지 않습니다.

## Google OAuth 설정

Google Cloud OAuth client의 승인된 redirect URI는 OAuth callback이 실제로 도착하는 auth origin마다 등록합니다. 기본 fallback만 운영할 때는 아래 URI가 필요합니다.

```text
https://readmates.pages.dev/login/oauth2/code/google
```

Primary auth domain을 별도로 쓰면 같은 path를 primary origin에도 추가합니다.

```text
https://<primary-domain>/login/oauth2/code/google
```

ReadMates의 기본 전략은 OAuth start는 현재 Pages 또는 registered host에서 시작할 수 있게 두고, Google에 전달하는 callback `redirect_uri`는 `READMATES_AUTH_BASE_URL`의 primary auth origin으로 모으는 방식입니다. 성공 후에는 검증된 `returnTo`가 있는 흐름만 원래 클럽 path나 registered club host로 복귀하고, 일반 로그인은 `/app` smart entry로 이동합니다. 따라서 club별 registered host를 Google redirect URI에 모두 추가하지 않습니다. 단, 운영자가 OAuth callback 자체를 특정 registered host에서 받도록 바꾸는 경우에는 해당 host의 `/login/oauth2/code/google`도 Google Cloud에 등록해야 합니다.

## Spring과 맞춰야 하는 값

Cloudflare origin과 Spring 설정은 같은 browser-facing origin 집합을 바라봐야 합니다. Primary auth origin을 아직 쓰지 않는 배포에서는 `READMATES_AUTH_BASE_URL`을 `READMATES_APP_BASE_URL`과 같은 fallback origin으로 둡니다.

```bash
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_AUTH_BASE_URL=https://readmates.pages.dev
READMATES_AUTH_RETURN_STATE_SECRET='{return-state-signing-secret}'
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev,https://<primary-domain>,https://<registered-club-host>
READMATES_BFF_SECRET=<same-secret-as-cloudflare>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
```

`READMATES_ALLOWED_ORIGINS`에는 실제로 활성화한 primary origin과 registered club host만 넣습니다. 공개 문서나 설정 예시에는 실제 운영 domain, Cloudflare account id, zone id, API token을 적지 않습니다.

`READMATES_API_BASE_URL`은 HTTPS여야 합니다. Cloudflare Pages가 사용자 cookie와 BFF secret을 upstream으로 전달하므로 운영에서 plaintext Spring listener를 직접 가리키지 않습니다. Caddy, Nginx, OCI Load Balancer, 또는 Cloudflare proxy 등으로 TLS를 종료한 뒤 `127.0.0.1:8080`의 Spring으로 넘깁니다.

## 배포 확인

```bash
CLUB_SLUG='{club-slug}'
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
curl -sS "https://readmates.pages.dev/api/bff/api/public/clubs/${CLUB_SLUG}"
```

기대값:

- `/app`은 `200`으로 SPA를 반환하고 로그인 후 가입 클럽이 하나면 해당 클럽으로, 여러 개면 클럽 선택 화면으로 이어집니다.
- `/api/bff/api/auth/me`는 BFF를 통해 Spring에 도달합니다. 로그아웃 상태여도 anonymous auth state를 담은 `200`일 수 있습니다.
- `/oauth2/authorization/google`은 Google 또는 Spring OAuth 흐름으로 redirect됩니다.
- `/api/bff/api/public/clubs/<club-slug>`은 해당 club의 공개 가능한 정보만 반환해야 합니다.
- deep route와 legacy route인 `/clubs/<club-slug>/app/session/current`, `/clubs/<club-slug>/app/host`, `/clubs/<club-slug>/app/host/sessions/new`, `/clubs/<club-slug>/app/host/sessions/<session-id>/edit`, `/clubs/<club-slug>/app/host/members`, `/clubs/<club-slug>/invite/<token>`, `/invite/<token>`, `/reset-password/<token>`, `/app`은 Cloudflare 404가 아니라 SPA fallback으로 진입해야 합니다.

## Registered Club Host 운영

등록형 subdomain 또는 custom domain은 DB의 `club_domains.status` workflow state와 실제 Cloudflare Pages custom domain 연결 상태를 분리해서 관리합니다. Platform admin UI에서 domain을 만들면 초기 상태는 `ACTION_REQUIRED`이며, 운영자가 Cloudflare dashboard 또는 Wrangler에서 Pages custom domain을 연결해야 합니다. Cloudflare 연결과 인증서 상태가 확인되기 전까지 public fallback URL인 `/clubs/<club-slug>`를 사용자에게 안내합니다.

`ACTION_REQUIRED`, `PROVISIONING`, `ACTIVE`, `FAILED`, `DISABLED` 상태의 의미와 수동 처리 절차는 [multi-club-domains.md](multi-club-domains.md#cloudflare-pages-custom-domain-runbook)를 기준으로 운영합니다.

## 비용 상태 확인

Wrangler로 Pages 프로젝트, 배포, secret 이름은 볼 수 있습니다. 계정 요금제 자체는 Cloudflare API Billing Read 권한이 필요할 수 있으므로 Cloudflare dashboard 또는 scoped API token으로 Free 호환 상태를 확인합니다.
