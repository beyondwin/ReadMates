# Multi-club Domains Runbook

모든 클럽은 path fallback URL을 항상 가집니다. 운영자가 연결한 Cloudflare Pages custom domain이나 subdomain alias는 선택 사항입니다. 이 문서는 placeholder만 씁니다. 실제 domain 목록, Cloudflare account/zone id, token, secret, smoke 결과는 Git에 남기지 않습니다.

완료 기준: fallback path가 계속 동작하고, Spring allowed origins, OAuth return 정책, Cloudflare marker, platform admin `ACTIVE` 상태가 같은 host를 가리킵니다. 하나라도 확인되지 않으면 사용자에게는 fallback URL을 안내합니다.

## URL Strategy

항상 동작해야 하는 기본 URL(`https://app.example.com`은 Pages 운영 origin placeholder):

```text
https://app.example.com/clubs/<club-slug>
https://app.example.com/clubs/<club-slug>/app
```

- Cloudflare Pages 기본 host는 `noindex`로 표시합니다. 검색용 canonical origin으로 쓰지 않습니다.
- fallback route에서도 primary domain canonical을 그리려면 production build 환경에 `VITE_PUBLIC_PRIMARY_DOMAIN={primary-domain}`을 설정합니다. secret이 아닌 build-time 값입니다.

primary domain을 운영하면 같은 path fallback을 primary origin에도 둘 수 있습니다.

```text
https://<primary-domain>/clubs/<club-slug>
https://<primary-domain>/clubs/<club-slug>/app
```

등록형 subdomain alias는 Pages custom domain으로 연결하며, canonical 공개 route는 아래 형태가 됩니다.

```text
https://<club-slug>.<primary-domain>/
https://<club-slug>.<primary-domain>/records
https://<club-slug>.<primary-domain>/sessions/<session-id>
```

alias는 무료 플랜의 필수 조건이 아닙니다. 준비되지 않았거나 상태가 불확실하면 fallback path를 안내합니다. `ACTIVE`로 바꾸기 전에는 그 host가 HTTPS로 ReadMates marker를 서빙하고 의도한 클럽 화면을 보여주는지 확인합니다.

## OAuth and Shared Session

로그인 세션은 platform 전체에서 공유합니다.

- OAuth start는 Pages나 registered host 어디서든 시작할 수 있습니다.
- Google에 보내는 callback `redirect_uri`는 primary auth origin(`READMATES_AUTH_BASE_URL`)으로 모읍니다.
- 초대 수락처럼 안전한 relative `returnTo`를 보낸 흐름만 성공 후 signed return state의 클럽 URL로 돌아갑니다. 일반 로그인은 `/app`으로 갑니다.
- absolute URL, protocol-relative URL, login/reset/invite/OAuth/root path, backslash, control character가 든 return target은 프론트엔드가 먼저 버리고, 서버가 signed state와 host/origin 정책으로 다시 막습니다.

Spring 설정:

```text
READMATES_APP_BASE_URL=https://app.example.com
READMATES_AUTH_BASE_URL=https://<primary-domain>
READMATES_AUTH_RETURN_STATE_SECRET='{return-state-signing-secret}'
READMATES_ALLOWED_ORIGINS=https://app.example.com,https://<primary-domain>,https://<registered-club-host>
READMATES_AUTH_SESSION_COOKIE_DOMAIN=.<primary-domain>
```

- primary domain이 없는 fallback-only 운영에서는 `READMATES_AUTH_BASE_URL`을 Pages 운영 origin과 같게 둡니다.
- `READMATES_AUTH_SESSION_COOKIE_DOMAIN`은 subdomain 간 세션 공유가 필요할 때만 설정합니다. cookie domain 밖의 external custom domain은 세션을 공유하지 못하므로 OAuth return 대상에서 빠질 수 있습니다.
- `READMATES_AUTH_RETURN_STATE_SECRET`은 공개 기본값이나 짧은 샘플 문자열을 쓰지 않습니다.

Google OAuth client redirect URI(callback이 도착하는 auth origin마다):

```text
https://app.example.com/login/oauth2/code/google
https://<primary-domain>/login/oauth2/code/google
```

club별 host는 Google redirect URI에 모두 추가하지 않습니다.

초대 링크는 club context를 유지해야 합니다. `/clubs/<club-slug>/invite/<token>`으로 들어온 사용자는 로그인 후 같은 클럽으로 돌아옵니다. `/invite/<token>`은 호환 경로이고, 새 초대 링크는 club-scoped route를 씁니다.

## Allowed Origins

변경 요청의 `Origin`/`Referer`는 두 목록을 합쳐 검증합니다.

- 정적 목록: `READMATES_ALLOWED_ORIGINS`(쉼표 구분). 바꾸려면 `sync-config` 후 `readmates-api` 재시작이 필요합니다.
- 동적 목록: DB `club_domains`에서 `status='ACTIVE'`인 hostname. 60초 캐시라서 재시작 없이 최대 1분 안에 반영됩니다.

새 registered host를 넣는 순서:

1. Cloudflare Pages custom domain을 연결합니다.
2. Admin UI에서 상태 확인을 실행해 `ACTIVE`로 바꿉니다.
3. 최대 1분 뒤, 그 host에서 HTTPS 앱과 BFF 요청이 통과하는지 smoke합니다.
4. (선택) 정적 목록에도 넣으려면 `READMATES_ALLOWED_ORIGINS`를 고치고 재시작합니다.

wildcard origin은 쓰지 않습니다.

## Cloudflare Pages Custom Domain Runbook

DB에 저장한 workflow 상태와 실제 Cloudflare 연결 상태는 다릅니다. UI/API는 `status`, 파생값 `desiredState`, `manualAction`, `errorCode`를 보여줍니다. 상태 확인 action은 `https://<hostname>/.well-known/readmates-domain-check.json`을 확인해 결과를 `ACTIVE` 또는 `FAILED`로 저장합니다.

| 상태 | 의미 |
| --- | --- |
| `REQUESTED` | 요청만 되고 운영 연결은 시작 전입니다. |
| `ACTION_REQUIRED` | 운영자가 Cloudflare에서 Pages custom domain을 연결해야 합니다. (admin 생성 시 초기 상태, manual action `CLOUDFLARE_PAGES_CUSTOM_DOMAIN`) |
| `PROVISIONING` | 연결·인증서 준비 중입니다. Cloudflare API poller는 없고, admin이 실행하는 marker 확인으로 판정합니다. |
| `ACTIVE` | marker 확인에 성공했습니다. |
| `FAILED` | 연결, 인증서, DNS, marker 확인 중 하나가 실패했습니다. |
| `DISABLED` | 더 이상 traffic을 받지 않습니다. |

Cloudflare API로 자동 연결, account/zone id·token 저장, live status poller는 구현 범위가 아닙니다.

marker checker는 secret header 없이 HTTPS `GET`만 합니다. redirect를 따르지 않고, DNS가 private/link-local/loopback/multicast/IPv6 ULA 주소로 풀리거나 응답이 4KB를 넘으면 실패로 처리합니다.

| Error code | 의미 |
| --- | --- |
| `DOMAIN_CHECK_INVALID_HOSTNAME` | hostname으로 HTTPS URL을 만들 수 없습니다. |
| `DOMAIN_CHECK_DNS_FAILED` | DNS resolve 실패 |
| `DOMAIN_CHECK_PRIVATE_ADDRESS` | 내부 주소로 resolve됨 |
| `DOMAIN_CHECK_UNREACHABLE` | timeout, TLS, network 오류 |
| `DOMAIN_CHECK_REDIRECT` | marker endpoint가 3xx를 반환 |
| `DOMAIN_CHECK_RESPONSE_TOO_LARGE` | 응답이 허용 크기 초과 |
| `DOMAIN_CHECK_HTTP_<status>` | `200`이 아닌 HTTP status |
| `DOMAIN_CHECK_MARKER_MISMATCH` | ReadMates marker가 아님 |
| `DOMAIN_CHECK_UNCONFIGURED` | 테스트/fallback checker가 확인 없이 실패를 반환. 운영에서는 HTTP checker 설정을 확인합니다. |

운영 절차:

1. Platform admin이 `/admin`에서 club domain alias를 만듭니다.
2. hostname, desired state, manual action을 확인합니다.
3. Cloudflare Pages project에 custom domain을 연결합니다.
4. DNS와 인증서가 준비될 때까지 fallback URL을 안내합니다.
5. Admin UI에서 상태 확인을 실행합니다. 결과가 `ACTIVE` 또는 `FAILED`로 저장됩니다.
6. HTTPS, SPA fallback, `/api/bff/api/auth/me`, club public API, OAuth start redirect를 smoke합니다.
7. 공개 화면이 의도한 클럽을 보여주고, 로그인 복귀가 같은 cookie 범위에서 동작하는지 확인합니다.
8. 실패하면 `FAILED`와 error code를 보고, 해결 전까지 fallback URL을 유지합니다.

## Public SEO Policy

Cloudflare Pages 기본 host와 preview host는 `noindex`입니다. primary domain이 있으면 canonical은 `https://<club-slug>.<primary-domain>/...`이고 `/clubs/<club-slug>` prefix는 뺍니다. Sitemap은 구현 범위가 아닙니다.

확인할 것:

- fallback path가 모든 클럽에서 200 또는 의도한 public API 상태를 반환합니다.
- Pages preview host에 `noindex`가 있습니다.
- canonical URL에 token, email, private 운영 host, preview deployment id가 없습니다.
- `PUBLIC`으로 발행된 세션만 공개 route/API에 나옵니다.

## Smoke Checks

Fallback path:

```bash
APP_ORIGIN='https://app.example.com'
CLUB_SLUG='{club-slug}'
curl -sS "$APP_ORIGIN/api/bff/api/public/clubs/${CLUB_SLUG}"
curl -sS -o /dev/null -w '%{http_code}\n' "$APP_ORIGIN/clubs/${CLUB_SLUG}"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "$APP_ORIGIN/oauth2/authorization/google"
```

Cloudflare 연결 뒤 registered host:

```bash
REGISTERED_CLUB_HOST='{registered-club-host}'
curl -sS -o /dev/null -w '%{http_code}\n' "https://${REGISTERED_CLUB_HOST}/"
curl -sS "https://${REGISTERED_CLUB_HOST}/.well-known/readmates-domain-check.json"
curl -sS "https://${REGISTERED_CLUB_HOST}/api/bff/api/auth/me"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://${REGISTERED_CLUB_HOST}/oauth2/authorization/google"
```

자동 smoke. `READMATES_SMOKE_AUTH_BASE_URL`은 `redirect_uri`가 모이는 primary auth origin과 맞춥니다.

```bash
READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://app.example.com \
./scripts/smoke-production-integrations.sh

READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://<primary-domain> \
READMATES_SMOKE_CLUB_HOST=https://<registered-club-host> \
./scripts/smoke-production-integrations.sh
```

HTTP status만으로 `ACTIVE`를 판단하지 않습니다. 브라우저로 클럽 이름, canonical/noindex tag, 로그인 후 복귀 URL, app switcher의 현재 클럽을 함께 확인합니다. smoke 출력은 공개 문서에 붙이지 않습니다.
