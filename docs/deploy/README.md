# ReadMates 배포 문서

검토일: 2026-04-30

이 디렉터리는 ReadMates의 공개 안전 배포 문서 허브입니다. 운영 환경의 목표 구조, 신뢰 경계, secret 보관 원칙, 공개 릴리즈 후보 검증 흐름을 설명하되 계정별 값과 private deployment state는 Git에 두지 않습니다.

승인된 포트폴리오 데모 URL: [https://readmates.pages.dev](https://readmates.pages.dev)

## 배포 문서 사용 기준

배포 문서는 운영자가 안전하게 재현할 수 있는 공개 runbook이어야 합니다. 실제 배포를 완료했다고 보려면 frontend Pages 배포, Spring API health, BFF/OAuth smoke, public release safety check가 변경 범위에 맞게 확인되어야 합니다.

Cloudflare, OCI, Google Cloud, GitHub의 UI, 가격, 한도, 권한 모델은 바뀔 수 있습니다. 계정 설정이나 비용 결정을 실행하기 전에는 현재 provider 콘솔 또는 공식 문서로 재확인하고, 재확인하지 않은 내용을 현재 사실처럼 단정하지 않습니다.

실제 운영 domain 목록, IP, OCID, provider token, OAuth secret, DB password, smoke 결과 전문은 이 디렉터리에 기록하지 않습니다. 그런 값이 필요한 작업은 Git 밖의 운영 채널에서 처리합니다.

관련 상위 문서:

- [루트 README](../../README.md)
- [개발자 문서 허브](../development/README.md). clean 공개 릴리즈 후보에는 루트 README, `docs/deploy` 배포 문서 subset, `docs/development` 개발 문서 subset이 포함됩니다.

## 문서 지도

| 목적 | 문서 |
| --- | --- |
| Cloudflare Pages와 Pages Functions 배포 | [cloudflare-pages.md](cloudflare-pages.md) |
| 멀티 클럽 domain alias와 OAuth origin 운영 | [multi-club-domains.md](multi-club-domains.md) |
| SPA fallback, OAuth proxy, deep route 점검 | [cloudflare-pages-spa.md](cloudflare-pages-spa.md) |
| 최종 OCI backend Docker Compose stack 운영 | [compose-stack.md](compose-stack.md) |
| Spring Boot API와 OCI backend 운영 기준 | [oci-backend.md](oci-backend.md) |
| OCI MySQL HeatWave와 백업 참고 | [oci-mysql-heatwave.md](oci-mysql-heatwave.md) |
| 공개 저장소 보안과 공개 릴리즈 후보 검증 | [security-public-repo.md](security-public-repo.md) |
| 2026-04-25 프론트/서버 배포 불일치 리포트 | [2026-04-25-production-version-skew-report.md](2026-04-25-production-version-skew-report.md) |

## 배포 형태

| 계층 | Runtime | 설명 |
| --- | --- | --- |
| Frontend SPA | Cloudflare Pages | Vite 앱을 빌드한 `front/dist`를 서빙합니다. |
| BFF와 OAuth proxy | Cloudflare Pages Functions | `front/functions`의 함수가 같은 origin API 경계를 제공합니다. |
| Backend stack | OCI Compute 또는 동등한 VM | 최종 OCI runtime은 Caddy, Spring API, Redis, Redpanda를 Docker Compose stack으로 실행합니다. |
| Reverse proxy | Caddy | Compose stack 안에서 직접 API origin의 HTTPS를 종료하고 Spring API container로 전달합니다. |
| Database | MySQL 8 compatible service | 문서화된 운영 대상은 OCI MySQL HeatWave입니다. |
| Cache/broker | Redis, Redpanda | Compose internal network에서 cache/rate-limit와 Kafka-compatible notification fan-out에 사용하며 MySQL source of truth를 대체하지 않습니다. |
| Migrations | Flyway | Spring 시작 시 migration을 적용합니다. |

프로덕션 secret 실제 값은 Git 밖에 둡니다. 공개 문서는 환경 변수 이름과 placeholder만 사용합니다. 실제 값은 Cloudflare Pages secret, 서버 런타임 환경 파일, Google Cloud, OCI 콘솔, 또는 운영자가 관리하는 ignored 파일에만 저장합니다.

## BFF 신뢰 경계

```text
Browser
  |
  | same-origin /api/bff/**
  v
Cloudflare Pages Functions
  |
  | X-Readmates-Bff-Secret + forwarded cookies
  v
Spring Boot /api/**
```

브라우저가 신뢰하는 공개 경계는 직접 Spring API origin이 아니라 Cloudflare Pages입니다. 브라우저는 같은 origin의 `/api/bff/**`를 호출하고, Pages Functions가 Spring으로 전달하면서 `X-Readmates-Bff-Secret`을 붙입니다. Spring은 API 요청에서 이 header를 검증하며, 운영에서는 `READMATES_BFF_SECRET`이 없으면 시작 실패가 맞습니다.

BFF secret은 `VITE_*`, `NEXT_PUBLIC_*`, 정적 asset, 브라우저 로그, screenshot, 공개 문서에 노출하면 안 됩니다.

변경 요청은 허용된 앱 origin의 `Origin` 또는 `Referer`도 확인합니다.

## 세션 Cookie 기준

Google OAuth 로그인 성공 후 Spring은 `readmates_session` cookie를 발급합니다.

- `HttpOnly`: 브라우저 JavaScript가 token을 읽지 못합니다.
- `SameSite=Lax`: 일반 로그인과 탐색을 유지하면서 cross-site request 위험을 줄입니다.
- 운영 `Secure`: `READMATES_AUTH_SESSION_COOKIE_SECURE=true`로 HTTPS에서만 cookie가 전송되게 합니다.
- 세션 token 원문은 저장하지 않고 `auth_sessions`의 hash 기록과 대조합니다.

## 멤버십과 권한

ReadMates는 제품 수준에서 invite-only 흐름을 사용합니다.

- 게스트는 공개 홈과 공개 기록만 볼 수 있습니다.
- 초대 없이 Google로 로그인한 사용자는 둘러보기 멤버가 될 수 있고, 멤버 공개 예정 세션 같은 읽기 전용 멤버 화면 일부를 볼 수 있습니다.
- 호스트는 둘러보기 멤버를 정식 멤버로 전환하거나, 정식 멤버를 현재 세션에서 제외/복구/비활성화/삭제하고 같은 클럽 멤버의 표시 이름을 정리할 수 있습니다.
- 호스트는 여러 `DRAFT` 예정 세션을 준비하고 `HOST_ONLY`, `MEMBER`, `PUBLIC` 공개 범위를 지정할 수 있지만, 같은 클럽에서 현재 `OPEN` 세션은 하나만 시작할 수 있습니다. 진행이 끝난 세션은 `CLOSED`로 닫고, 공개 요약과 `MEMBER` 또는 `PUBLIC` 범위가 준비된 닫힌 기록만 `PUBLISHED`로 발행합니다.
- 호스트는 `/app/host/notifications`에서 notification event publication row와 channel delivery row를 보고, pending/failed email delivery 처리, `DEAD` delivery 복구, 고정 템플릿 테스트 메일 audit 확인을 수행할 수 있습니다.
- 호스트 API는 활성 `host` role을 요구합니다.
- 멤버 API는 허용된 `member` 상태를 요구하며, 현재 세션 쓰기는 해당 세션 참여 상태도 확인합니다. `/api/sessions/upcoming`은 `DRAFT`이면서 `MEMBER` 또는 `PUBLIC`인 세션만 반환합니다.
- 멤버 알림 설정은 기존 운영 알림을 기본 켜짐으로, 서평 공개 알림을 기본 꺼짐으로 시작합니다. 멤버 알림함은 `/app/notifications`에서 unread count, 개별 읽음, 전체 읽음 처리를 제공합니다.
- 본인 프로필 수정은 인증된 멤버 앱 읽기 가능 상태에서만 허용하고, 같은 클럽 안의 표시 이름 중복과 예약어는 서버에서 막습니다.
- Public API는 `sessions.state=PUBLISHED`이고 `public_session_publications.visibility=PUBLIC`인 공개 기록만 반환합니다.
- 피드백 문서는 권한과 참석 여부를 통과한 정식 멤버 또는 호스트에게만 노출합니다.
- Platform admin은 club 생성과 domain alias 상태 확인을 관리하는 별도 권한입니다. Platform `OPERATOR`라도 특정 클럽의 호스트 도구를 쓰려면 해당 club membership의 `HOST` 권한을 별도로 가져야 합니다.

## 환경 변수

Cloudflare Pages Functions:

```text
VITE_PUBLIC_PRIMARY_DOMAIN={primary-domain}
READMATES_API_BASE_URL=https://api.example.com
READMATES_BFF_SECRET=<bff-secret>
```

Spring:

```text
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=<jdbc-mysql-url>
SPRING_DATASOURCE_USERNAME=<db-user>
SPRING_DATASOURCE_PASSWORD=<db-password>
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_AUTH_BASE_URL=https://readmates.pages.dev
READMATES_AUTH_RETURN_STATE_SECRET={return-state-signing-secret}
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev
READMATES_BFF_SECRET=<same-bff-secret-as-pages-functions>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile
```

직접 API origin 예시는 공개 문서에서 `https://api.example.com` 같은 placeholder만 사용합니다. 실제 운영 secret, DB password, OAuth secret, OCI OCID, private IP, DB dump는 문서와 Git에 넣지 않습니다.

배포 후 공개 연동 최소 smoke는 `./scripts/smoke-production-integrations.sh`로 실행합니다. 이 script는 Cloudflare Pages marker와 Google OAuth `redirect_uri`를 확인하지만, 실제 운영 결과나 domain 목록은 Git에 기록하지 않습니다. Registered club host의 `ACTIVE` 전환은 Platform admin 상태 확인 action이 `/.well-known/readmates-domain-check.json` marker를 확인한 뒤에만 진행합니다.

## Redis Feature Flags

Redis는 선택 계층입니다. 런타임 환경에 관리형 Redis URL을 placeholder-safe 값으로 설정한 뒤, 기능 flag를 단계적으로 켭니다.

```text
READMATES_REDIS_URL=<managed-redis-url>
```

권장 순서:

1. `READMATES_REDIS_ENABLED=true`
2. `READMATES_RATE_LIMIT_ENABLED=true`
3. `READMATES_AUTH_SESSION_CACHE_ENABLED=true`
4. `READMATES_PUBLIC_CACHE_ENABLED=true`
5. `READMATES_NOTES_CACHE_ENABLED=true`

Redis-backed 동작을 되돌릴 때는 MySQL 데이터를 바꾸지 않고 영향을 받은 기능 flag만 `false`로 내립니다. Rate limit은 필요할 때만 `READMATES_RATE_LIMIT_FAIL_CLOSED_SENSITIVE=true`로 민감 요청 장애 정책을 강화합니다.

## 배포 절차 요약

Cloudflare Pages:

1. Root directory를 `front`로 설정합니다.
2. Install command를 `pnpm install --frozen-lockfile`로 설정합니다.
3. Build command를 `pnpm build`로 설정합니다.
4. Output directory를 `dist`로 설정합니다.
5. Pages Functions secret으로 `READMATES_API_BASE_URL`과 `READMATES_BFF_SECRET`을 설정합니다.

OCI backend Compose stack:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP=VM_PUBLIC_IP CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
```

자세한 절차와 rollback은 [compose-stack.md](compose-stack.md)를 기준으로 합니다.

Legacy JAR path는 compose 전환 검증과 rollback 전용입니다.

```bash
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

OCI helper script는 placeholder 기반이며 운영자가 값을 주입하는 전제를 둡니다. script와 문서에는 실제 tenancy ID, API key, database password, private IP, 배포 상태 값을 넣지 않습니다.

백엔드 프로덕션 배포는 현재 수동 운영 기준입니다. GitHub Actions 기반 프로덕션 배포 자격 증명이나 runner가 이미 구성되어 있다고 가정하지 않습니다.

## Smoke Check

승인된 포트폴리오 배포는 공개 데모 origin으로 확인합니다.

```bash
CLUB_SLUG='{club-slug}'
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
curl -sS "https://readmates.pages.dev/api/bff/api/public/clubs/${CLUB_SLUG}"
```

직접 API 확인 예시는 공개 문서에서 placeholder만 사용합니다.

```bash
curl -sS https://api.example.com/internal/health
```

## 비용 기준

별도 유료 전환 결정이 없다면 아래 free 또는 low-cost 호환 범위를 기준으로 문서화합니다.

- Cloudflare Pages와 Workers-compatible free usage
- OCI A1 Compute free-tier 범위
- OCI boot/block volume free-tier 범위
- OCI MySQL HeatWave `MySQL.Free`가 가능한 region

프로덕션 배포 credential을 GitHub Actions에 추가하는 일은 자동화된 백엔드 배포를 별도로 승인한 뒤에만 검토합니다.

## 공개 릴리즈 후보 점검

공개 저장소로 내보내기 전에는 clean 공개 릴리즈 후보를 만들고 검사합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

공개 릴리즈 후보에는 local env files, provider state, database dump, key material, generated design artifacts, private planning docs, 실제 데이터가 담긴 screenshot, private deployment state가 없어야 합니다.
