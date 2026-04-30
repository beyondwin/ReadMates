# Multi-club Domains Runbook

ReadMates는 모든 클럽에 path fallback URL을 보장하고, 운영자가 연결한 Cloudflare Pages custom domain 또는 subdomain alias를 선택적으로 붙입니다. 이 문서는 공개 저장소에 둘 수 있는 placeholder 기준만 설명합니다. 실제 domain 목록, Cloudflare account id, zone id, API token, OAuth secret, DB password, 운영 smoke 결과는 Git에 기록하지 않습니다.

## URL Strategy

항상 동작해야 하는 기본 URL은 아래 형태입니다.

```text
https://readmates.pages.dev/clubs/<club-slug>
https://readmates.pages.dev/clubs/<club-slug>/app
```

`readmates.pages.dev`는 fallback과 preview origin입니다. Public URL policy는 Pages host를 `noindex`로 표시하므로 검색 노출용 canonical origin으로 쓰지 않습니다.

Pages fallback route에서도 owned primary domain canonical link를 렌더링하려면 Cloudflare Pages production build 환경에 `VITE_PUBLIC_PRIMARY_DOMAIN={primary-domain}`을 설정합니다. 이 값은 public canonical host를 만들기 위한 build-time setting이며 secret이 아닙니다.

Primary domain을 운영하면 같은 path fallback을 primary origin에도 둘 수 있습니다.

```text
https://<primary-domain>/clubs/<club-slug>
https://<primary-domain>/clubs/<club-slug>/app
```

등록형 subdomain alias는 Cloudflare Pages custom domain으로 연결합니다. Canonical URL policy는 공개 route를 아래 형태로 만들 수 있습니다.

```text
https://<club-slug>.<primary-domain>/
https://<club-slug>.<primary-domain>/records
https://<club-slug>.<primary-domain>/sessions/<session-id>
```

이 alias는 무료 플랜의 필수 조건이 아닙니다. 운영 중 alias가 준비되지 않았거나 상태가 불확실하면 사용자에게 fallback path URL을 안내합니다.

Registered host를 `ACTIVE`로 전환하기 전에는 해당 host가 ReadMates Cloudflare Pages marker를 HTTPS로 서빙하고, public route가 의도한 club content를 렌더링하는지 확인합니다. 확인되지 않은 host는 canonical 후보로만 취급하고, 실제 사용자 안내는 `https://readmates.pages.dev/clubs/<club-slug>` fallback을 사용합니다.

## OAuth and Shared Session

로그인 세션은 platform 전체에서 공유합니다. Google OAuth start endpoint는 현재 Pages 또는 registered host에서 시작될 수 있지만, Google에 전달하는 callback `redirect_uri`는 primary auth origin으로 모읍니다. 초대 수락처럼 `returnTo`를 함께 보낸 흐름만 성공 후 signed return state에 저장된 클럽 URL로 돌아가고, 일반 로그인은 `/app` smart entry로 이동합니다.

Spring 설정:

```text
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_AUTH_BASE_URL=https://<primary-domain>
READMATES_AUTH_RETURN_STATE_SECRET='{return-state-signing-secret}'
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev,https://<primary-domain>,https://<registered-club-host>
READMATES_AUTH_SESSION_COOKIE_DOMAIN=.<primary-domain>
```

Primary domain을 아직 쓰지 않는 fallback-only 운영에서는 `READMATES_AUTH_BASE_URL`을 `https://readmates.pages.dev`로 둡니다. `READMATES_AUTH_SESSION_COOKIE_DOMAIN`은 subdomain 간 세션 공유가 필요할 때만 설정합니다. Cookie domain 밖의 external custom domain은 같은 browser cookie를 공유하지 못하므로 OAuth return URL 허용 대상에서 제외될 수 있습니다.

`READMATES_AUTH_RETURN_STATE_SECRET`은 OAuth return target 서명에 쓰는 운영 secret입니다. 공개 기본값이나 짧은 샘플 문자열을 production에 사용하지 않습니다.

Google Cloud OAuth client의 redirect URI는 OAuth callback이 실제로 도착하는 auth origin마다 등록합니다.

```text
https://readmates.pages.dev/login/oauth2/code/google
https://<primary-domain>/login/oauth2/code/google
```

기본 전략에서는 club별 registered host를 Google redirect URI에 모두 추가하지 않습니다. Callback은 `READMATES_AUTH_BASE_URL`로 모으고, `returnTo` 검증이 통과한 club path 또는 active registered host로 복귀합니다.

초대 링크는 club context를 보존해야 합니다. `https://readmates.pages.dev/clubs/<club-slug>/invite/<token>`로 들어온 사용자는 로그인 후 같은 club의 app 또는 초대 수락 결과 화면으로 돌아와야 합니다. Unscoped `/invite/<token>`은 호환 경로이지만, 새 초대 링크는 club-scoped route를 우선합니다.

## Allowed Origins

`READMATES_ALLOWED_ORIGINS`는 mutating request의 `Origin` 또는 `Referer` 검증에 쓰는 정적 comma-separated 목록입니다. 현재 구현은 DB의 active `club_domains`를 runtime allowlist로 자동 반영하지 않습니다.

새 registered host를 운영에 넣을 때는 아래 순서를 지킵니다.

1. Cloudflare Pages custom domain 연결을 준비합니다.
2. Spring 환경 파일의 `READMATES_ALLOWED_ORIGINS`에 browser-facing origin을 추가합니다.
3. Spring을 재시작해 allowlist를 반영합니다.
4. Host가 HTTPS로 Pages 앱을 서빙하고 BFF 요청이 통과하는지 smoke test합니다.
5. 확인된 host만 `ACTIVE`로 운영합니다.

Wildcard origin은 사용하지 않습니다. Placeholder 문서에는 실제 운영 domain 목록을 적지 않습니다.

## Cloudflare Pages Custom Domain Runbook

Domain provisioning은 DB에 저장된 desired workflow와 실제 Cloudflare 연결 상태를 구분합니다. UI/API는 저장된 `status`, status에서 파생한 `desiredState`, `manualAction`, `errorCode`를 노출합니다. Platform admin의 상태 확인 action은 `https://<hostname>/.well-known/readmates-domain-check.json` marker를 확인해 실제 연결 결과를 `ACTIVE` 또는 `FAILED`로 저장합니다.

| 상태 | 의미 |
| --- | --- |
| `REQUESTED` | 사용자가 domain alias를 요청했지만 운영 연결이 아직 시작되지 않았습니다. |
| `ACTION_REQUIRED` | 운영자가 Cloudflare dashboard 또는 Wrangler에서 Pages custom domain 연결을 수행해야 합니다. |
| `PROVISIONING` | 연결 또는 인증서 준비가 진행 중입니다. 현재 구현은 Cloudflare API poller가 아니라 admin-triggered marker check로 실제 연결을 확인합니다. |
| `ACTIVE` | 상태 확인 action이 ReadMates Pages marker를 확인한 상태입니다. |
| `FAILED` | 연결, 인증서, DNS, smoke test 중 하나가 실패했습니다. |
| `DISABLED` | 더 이상 traffic을 받지 않는 domain alias입니다. |

현재 platform admin create flow는 domain row를 `ACTION_REQUIRED`로 만듭니다. Admin UI와 API는 `status`, `desiredState`, `manualAction`, `errorCode`를 보여주며, `ACTION_REQUIRED`의 manual action은 `CLOUDFLARE_PAGES_CUSTOM_DOMAIN`입니다. 상태 확인 action이 marker를 찾지 못하면 `FAILED`와 `DOMAIN_CHECK_*` error code를 남깁니다. 실제 Cloudflare API provisioning, account id/zone id/token 저장, live status poller는 1차 구현 범위가 아닙니다.

Domain marker checker는 HTTPS `GET`만 사용하고 secret header를 보내지 않습니다. Redirect는 따르지 않으며, DNS가 private/link-local/loopback/multicast/IPv6 ULA address로 resolve되거나 marker body가 4KB를 넘으면 fail-closed로 처리합니다.

대표 error code:

| Error code | 의미 |
| --- | --- |
| `DOMAIN_CHECK_INVALID_HOSTNAME` | hostname으로 HTTPS marker URL을 만들 수 없습니다. |
| `DOMAIN_CHECK_DNS_FAILED` | DNS resolve에 실패했습니다. |
| `DOMAIN_CHECK_PRIVATE_ADDRESS` | DNS가 private, loopback, link-local, multicast, IPv6 ULA address로 resolve되었습니다. |
| `DOMAIN_CHECK_UNREACHABLE` | HTTPS marker 요청이 timeout, TLS, network 오류 등으로 실패했습니다. |
| `DOMAIN_CHECK_REDIRECT` | Marker endpoint가 3xx redirect를 반환했습니다. |
| `DOMAIN_CHECK_RESPONSE_TOO_LARGE` | Marker 응답이 허용 크기를 넘었습니다. |
| `DOMAIN_CHECK_HTTP_<status>` | Marker endpoint가 `200`이 아닌 HTTP status를 반환했습니다. |
| `DOMAIN_CHECK_MARKER_MISMATCH` | Marker JSON이 ReadMates Cloudflare Pages marker가 아닙니다. |
| `DOMAIN_CHECK_UNCONFIGURED` | 테스트 또는 fallback checker가 실제 확인 없이 실패 상태를 반환했습니다. 운영에서는 HTTP checker 설정을 확인합니다. |

운영 절차:

1. Platform admin이 `/admin`에서 club domain alias를 생성합니다.
2. Admin UI에서 hostname, desired state, manual action을 확인합니다.
3. 운영자가 Cloudflare Pages project에 custom domain을 연결합니다.
4. DNS와 인증서가 준비될 때까지 fallback URL을 안내합니다.
5. Admin UI에서 상태 확인을 실행합니다. Spring은 `/.well-known/readmates-domain-check.json` marker를 확인해 `ACTIVE` 또는 `FAILED`로 갱신합니다.
6. HTTPS, SPA fallback, `/api/bff/api/auth/me`, club-scoped public API, OAuth start redirect를 smoke test합니다.
7. Public route가 의도한 club content를 렌더링하고 app/OAuth return flow가 같은 session cookie 범위에서 동작하는지 확인합니다.
8. 실패하면 `FAILED`와 error code를 확인하고, 해결 전까지 fallback URL을 유지합니다.

## Public SEO Policy

`readmates.pages.dev`와 `*.pages.dev` host는 `noindex` 대상입니다. Public canonical은 primary domain이 설정된 경우 `https://<club-slug>.<primary-domain>/...` 형태로 생성하고, `/clubs/<club-slug>` prefix를 canonical path에서 제거합니다.

Canonical/noindex 정책을 검증할 때는 아래를 확인합니다. Sitemap generation은 현재 1차 구현 범위가 아닙니다.

- Fallback path가 모든 클럽에 대해 200 또는 의도한 public API 상태를 반환합니다.
- Pages preview host에는 `noindex`가 있습니다.
- Canonical URL에는 token, email, private 운영 host, preview deployment id가 들어가지 않습니다.
- `PUBLIC`으로 발행된 세션만 public route/API에 노출됩니다.

## Smoke Checks

Fallback path:

```bash
CLUB_SLUG='{club-slug}'
curl -sS "https://readmates.pages.dev/api/bff/api/public/clubs/${CLUB_SLUG}"
curl -sS -o /dev/null -w '%{http_code}\n' "https://readmates.pages.dev/clubs/${CLUB_SLUG}"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
```

Registered host after Cloudflare 연결:

```bash
REGISTERED_CLUB_HOST='{registered-club-host}'
curl -sS -o /dev/null -w '%{http_code}\n' "https://${REGISTERED_CLUB_HOST}/"
curl -sS "https://${REGISTERED_CLUB_HOST}/.well-known/readmates-domain-check.json"
curl -sS "https://${REGISTERED_CLUB_HOST}/api/bff/api/auth/me"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://${REGISTERED_CLUB_HOST}/oauth2/authorization/google"
```

자동화된 최소 smoke는 아래 script로 실행합니다. `READMATES_SMOKE_AUTH_BASE_URL`은 Google OAuth `redirect_uri`가 모이는 primary auth origin과 맞춥니다.

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh

READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://<primary-domain> \
READMATES_SMOKE_CLUB_HOST=https://<registered-club-host> \
./scripts/smoke-production-integrations.sh
```

HTTP status만으로 `ACTIVE` 전환을 판단하지 않습니다. Browser smoke로 rendered club name, canonical/noindex tag, 로그인 후 return URL, app switcher의 현재 club을 함께 확인합니다. Smoke output은 운영 상태일 수 있으므로 공개 문서에 붙이지 않습니다. 필요한 경우 내부 운영 기록에만 보관합니다.
