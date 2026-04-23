# Cloudflare Pages SPA 상세 참고

현재 기준 문서는 [cloudflare-pages.md](cloudflare-pages.md)입니다. 이 문서는 SPA route, Pages Functions, OAuth proxy 문제를 확인할 때 보는 하위 참고 문서입니다.

## 배포 형태

ReadMates 운영 프론트엔드는 Cloudflare Pages가 `front/dist`의 Vite React SPA를 서빙하고, `front/functions`의 Pages Functions가 같은 origin BFF와 OAuth proxy를 제공합니다. 인증, 멤버십, 현재 세션, 공개 기록, 피드백 문서의 진실은 OCI Spring Boot API와 MySQL에 있습니다.

## Pages 프로젝트 설정

- Framework preset: `Vite` 또는 `None`
- Root directory: `front`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Build output directory: `dist`

Cloudflare UI가 repository root 기준 path를 묻는 경우 root는 `front`, output은 `front/dist`로 해석되도록 설정합니다.

## 함수 route

Cloudflare 프로젝트 root가 `front`이므로 `front/functions`가 Functions directory입니다.

- `/api/bff/**`: `/api/**`로 시작하는 안전한 upstream path만 Spring으로 전달하고, 설정되어 있으면 `X-Readmates-Bff-Secret`을 추가합니다.
- `/oauth2/authorization/**`: Google OAuth 시작 요청을 Spring으로 전달합니다.
- `/login/oauth2/code/**`: Google OAuth callback을 Spring으로 전달하고 `Set-Cookie`를 보존합니다.

`front/public/_redirects`는 Vite build output으로 복사됩니다. function pass-through가 SPA fallback보다 위에 있어야 합니다.

```text
/api/bff/* /api/bff/:splat 200
/oauth2/authorization/* /oauth2/authorization/:splat 200
/login/oauth2/code/* /login/oauth2/code/:splat 200
/* /index.html 200
```

## Cloudflare 환경

운영 환경:

```bash
READMATES_API_BASE_URL=https://api.example.com
READMATES_BFF_SECRET=<shared-secret>
```

`READMATES_API_BASE_URL`은 운영 HTTPS origin이어야 합니다. `READMATES_BFF_SECRET`은 Spring `READMATES_BFF_SECRET`과 같은 값이어야 하며 브라우저에 노출되는 `VITE_` 변수로 만들지 않습니다.

Preview 배포에는 운영 secret을 넣지 않습니다. Preview가 API를 써야 하면 별도 preview 백엔드와 별도 BFF secret을 둡니다.

프로덕션 secret 값은 Git 밖에 둡니다. 이 문서는 변수 이름과 placeholder만 포함합니다.

## Spring 운영 환경

```bash
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev
READMATES_BFF_SECRET=<same-shared-secret>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile
```

Spring property 이름으로 쓰면 아래와 같습니다.

```properties
readmates.app-base-url=https://readmates.pages.dev
readmates.allowed-origins=https://readmates.pages.dev
readmates.bff-secret=<same-shared-secret>
readmates.bff-secret-required=true
readmates.auth.session-cookie-secure=true
spring.security.oauth2.client.registration.google.client-id=<google-oauth-client-id>
spring.security.oauth2.client.registration.google.client-secret=<google-oauth-client-secret>
spring.security.oauth2.client.registration.google.scope=openid,email,profile
```

커스텀 도메인으로 전환하면 Cloudflare, Spring, Google OAuth의 origin을 같은 HTTPS origin으로 동시에 맞춥니다.

## Google OAuth 흐름

Google Cloud OAuth client에 승인된 redirect URI를 등록합니다.

```text
https://readmates.pages.dev/login/oauth2/code/google
```

브라우저는 `/oauth2/authorization/google`에서 로그인을 시작합니다. Pages Functions가 Spring으로 요청을 전달하고, Spring이 Google로 redirect하며, Google callback은 다시 Pages origin의 `/login/oauth2/code/google`로 돌아옵니다.

## 수동 검증 체크리스트

1. `https://readmates.pages.dev`가 공개 홈을 렌더링하는지 확인합니다.
2. `https://readmates.pages.dev/app` 같은 deep route가 404가 아니라 SPA를 렌더링하는지 확인합니다.
3. Google login 클릭 시 `/oauth2/authorization/google` 흐름으로 나가는지 확인합니다.
4. 정식 멤버는 로그인 후 `/app`으로 들어가는지 확인합니다.
5. 초대 없이 들어온 새 Google 사용자는 둘러보기 멤버 상태로 `/app/pending`에 도달하는지 확인합니다.
6. 호스트가 `/app/host/members`에서 둘러보기 멤버를 정식 멤버로 전환할 수 있는지 확인합니다.
7. 정식 멤버가 `/app`을 reload해도 멤버 route에 접근할 수 있는지 확인합니다.
8. 둘러보기 멤버가 피드백 문서 route에 접근할 수 없는지 확인합니다.
9. 피드백 문서 `PDF로 저장` action이 숨겨져 있는지 확인합니다. 현재 `feedbackDocumentPdfDownloadsEnabled=false`라서 print route는 사용자-facing PDF 저장 흐름으로 쓰지 않습니다.

PDF 저장 흐름을 다시 켜는 경우에는 `front/shared/config/readmates-feature-flags.ts`를 변경한 뒤 `/app/feedback/:sessionId/print`가 데이터를 불러오고 browser print를 한 번 호출하는지 별도로 검증합니다.

빠른 path 점검:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
```

## 문제 해결

- Deep link가 404면 `_redirects`가 build output에 없거나 `/* /index.html 200` fallback이 function pass-through보다 위에 있을 가능성이 큽니다.
- 변경 요청의 `/api/bff/**`가 403이면 same-origin 검증, browser origin, Spring `READMATES_ALLOWED_ORIGINS`를 확인합니다.
- API 호출이 401이거나 세션이 유지되지 않으면 cookie 설정, `READMATES_AUTH_SESSION_COOKIE_SECURE`, BFF 우회 여부를 확인합니다.
- `/api/bff/**`가 500이면 `READMATES_API_BASE_URL`이 없거나 Spring origin에 도달할 수 없는 상태일 수 있습니다.
- OAuth redirect mismatch는 Google OAuth client, Spring `READMATES_APP_BASE_URL`, Cloudflare Pages public origin이 서로 다를 때 발생합니다.
