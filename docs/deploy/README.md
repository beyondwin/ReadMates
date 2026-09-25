# ReadMates 배포 문서

검토일: 2026-09-25 (기준: `main` = `v2.5.1`)

ReadMates 배포 문서의 시작점입니다. 운영 구조, 신뢰 경계, secret 원칙, 릴리즈 흐름을 공개해도 안전한 형태로 설명합니다.

## 배포 문서 사용 기준

- 이 디렉터리에는 placeholder만 씁니다. 실제 domain, IP, OCID, token, OAuth secret, DB password, smoke 결과 전문은 Git 밖 운영 채널에서만 다룹니다.
- 예시의 `https://app.example.com`은 브라우저가 접속하는 Pages 운영 origin, `https://api.example.com`은 Caddy가 받는 직접 API origin입니다.
- 배포가 끝났다고 보려면 변경 범위에 맞게 frontend Pages 배포, Spring API health, BFF/OAuth smoke, 공개 릴리즈 안전 검사를 확인해야 합니다.
- 저장소 설정은 "운영이 지금 이렇게 돌고 있다"는 증거가 아닙니다. 운영 상태는 운영 채널에서 따로 확인합니다.
- Cloudflare, OCI, Google Cloud, GitHub의 UI·가격·한도는 바뀔 수 있습니다. 계정 설정이나 비용 결정 전에는 현재 콘솔이나 공식 문서로 다시 확인합니다.

관련 문서: [루트 README](../../README.md), [개발자 문서 허브](../development/README.md). 과거 배포 사후 보고서는 [`docs/reports`](../reports/README.md)에 있습니다.

## 문서 지도

| 하고 싶은 일 | 문서 |
| --- | --- |
| 새 버전 발행과 운영 배포 (처음 볼 문서) | [release-publish-runbook.md](release-publish-runbook.md) |
| Cloudflare Pages, Pages Functions, OAuth proxy | [cloudflare-pages.md](cloudflare-pages.md) |
| OCI backend Docker Compose stack 배포·rollback | [compose-stack.md](compose-stack.md) |
| Spring 운영 환경 변수, 알림, BFF secret rotation | [oci-backend.md](oci-backend.md) |
| 멀티 클럽 domain alias와 OAuth origin | [multi-club-domains.md](multi-club-domains.md) |
| MySQL HeatWave, 백업, 복구 rehearsal | [oci-mysql-heatwave.md](oci-mysql-heatwave.md) |
| 공개 저장소 보안, 공개 릴리즈 후보 검사 | [security-public-repo.md](security-public-repo.md) |

## 배포 형태

| 계층 | Runtime | 설명 |
| --- | --- | --- |
| Frontend SPA | Cloudflare Pages | `front/dist`를 서빙합니다. |
| BFF와 OAuth proxy | Cloudflare Pages Functions | `front/functions`가 같은 origin API 경계를 만들고 Spring에 BFF secret을 붙여 전달합니다. |
| Backend stack | OCI Compute VM | Docker Compose로 Caddy, Spring API, Redis, Redpanda를 실행합니다. |
| Reverse proxy | Caddy (compose 안) | 직접 API origin의 HTTPS를 종료하고 `readmates-api:8080`으로 넘깁니다. |
| Database | MySQL 8 호환 | 운영 대상은 OCI MySQL HeatWave입니다. |
| Cache/broker | Redis, Redpanda | compose 내부 network 전용입니다. MySQL source of truth를 대체하지 않습니다. |
| Migration | Flyway | Spring 시작 시 적용합니다. |

실제 secret 값은 Cloudflare Pages secret, VM의 `/etc/readmates/readmates.env`, GitHub Secrets, Google Cloud/OCI 콘솔에만 둡니다.

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

- 브라우저는 Spring origin이 아니라 같은 origin의 `/api/bff/**`만 호출합니다.
- Pages Functions가 Spring으로 넘길 때 `X-Readmates-Bff-Secret`을 붙이고, Spring이 검증합니다.
- 운영에서 `READMATES_BFF_SECRET`과 `READMATES_BFF_SECRETS`가 모두 비어 있으면 Spring은 시작에 실패합니다. 정상 동작입니다.
- 변경 요청은 허용된 앱 origin의 `Origin` 또는 `Referer`도 확인합니다.
- BFF secret은 `VITE_*` 변수, 정적 asset, 브라우저 로그, screenshot, 공개 문서에 넣지 않습니다.

## 세션 Cookie 기준

Google OAuth 로그인에 성공하면 Spring이 `readmates_session` cookie를 발급합니다.

- `HttpOnly`: JavaScript가 token을 읽지 못합니다.
- `SameSite=Lax`: 일반 탐색은 유지하고 cross-site 요청 위험을 줄입니다.
- 운영 `Secure`: `READMATES_AUTH_SESSION_COOKIE_SECURE=true`.
- DB에는 token 원문이 아니라 hash만 저장합니다(`auth_sessions`).

`returnTo`는 같은 origin의 안전한 relative path만 씁니다. 서버는 signed return state와 허용 origin/host 정책으로 다시 검증합니다.

OAuth start/callback의 HTML navigation이 실패하면 Pages Functions는 upstream 오류 body를 보여주지 않고 `Cache-Control: no-store`인 `/auth/error?kind=...`로 보냅니다. `fetch` 같은 non-HTML 요청은 JSON status를 그대로 받습니다. 그래서 smoke는 document navigation과 API 응답을 나눠 확인합니다.

## 멤버십과 권한

배포 확인에 필요한 권한 경계만 요약합니다. 자세한 기준은 [architecture.md](../development/architecture.md)를 따릅니다.

- 게스트: 공개 홈과 공개 기록만 봅니다. Public API는 `PUBLISHED`이면서 `PUBLIC`인 기록만 반환합니다.
- 초대 없이 Google로 로그인한 사용자: 둘러보기 멤버로 읽기 전용 화면 일부를 봅니다.
- 정식 멤버: 멤버 API를 쓰고, 현재 세션 쓰기는 참여 상태도 확인합니다. 피드백 문서는 권한과 참석을 통과한 정식 멤버 또는 호스트만 봅니다.
- 호스트: 활성 `host` role이 필요합니다. 세션 준비·공개, 멤버 관리, `/app/host/notifications` 알림 운영을 합니다.
- Platform admin: club 생성과 domain alias 상태 확인을 관리합니다. 특정 클럽의 호스트 도구를 쓰려면 그 클럽의 `HOST` membership이 따로 필요합니다.

## 환경 변수

Cloudflare Pages Functions:

```text
VITE_PUBLIC_PRIMARY_DOMAIN={primary-domain}
READMATES_API_BASE_URL=https://api.example.com
READMATES_BFF_SECRET=<shared-bff-secret>
# 무중단 rotation 중에만 설정. 쉼표 구분, primary first.
READMATES_BFF_SECRETS=<new-secret>,<old-secret>
BFF_SECRET_ROTATION_STAGE=stable
```

Spring (핵심만, 전체 목록은 [oci-backend.md](oci-backend.md#운영-환경-변수)):

```text
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=<jdbc-mysql-url>
SPRING_DATASOURCE_USERNAME=<db-user>
SPRING_DATASOURCE_PASSWORD=<db-password>
READMATES_APP_BASE_URL=https://app.example.com
READMATES_AUTH_BASE_URL=https://app.example.com
READMATES_AUTH_RETURN_STATE_SECRET={return-state-signing-secret}
READMATES_ALLOWED_ORIGINS=https://app.example.com
READMATES_BFF_SECRET=<shared-bff-secret>
# 무중단 rotation 중에만 설정. 있으면 READMATES_BFF_SECRET보다 우선합니다.
READMATES_BFF_SECRETS=<new-secret>,<old-secret>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_SECURITY_BFF_AUDIT_MODE=rotation-only
READMATES_AUTH_SESSION_COOKIE_SECURE=true
READMATES_IP_HASH_BASE_SECRET=<openssl rand -base64 32으로 생성>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile
```

운영 Spring env 파일은 GitHub Actions `sync-config` workflow가 GitHub Secrets/Variables로 렌더링해 VM에 올립니다. 절차는 [secrets management runbook](../operations/runbooks/secrets-management.md)을 따릅니다.

## Redis Feature Flags

Redis는 선택 계층입니다. Compose stack은 `READMATES_REDIS_URL=redis://redis:6379`를 container에 주입합니다.

켜는 순서:

1. `READMATES_REDIS_ENABLED=true`
2. `READMATES_RATE_LIMIT_ENABLED=true`
3. `READMATES_AUTH_SESSION_CACHE_ENABLED=true`
4. `READMATES_PUBLIC_CACHE_ENABLED=true`
5. `READMATES_NOTES_CACHE_ENABLED=true`

되돌릴 때는 MySQL 데이터는 건드리지 않고 문제 된 flag만 `false`로 내립니다. 민감 요청의 rate limit 장애를 막아야 할 때만 `READMATES_RATE_LIMIT_FAIL_CLOSED_SENSITIVE=true`를 씁니다.

## 배포 절차 요약

전체 절차는 [release-publish-runbook.md](release-publish-runbook.md)가 기준입니다. 한 줄 요약:

```text
검증 → annotated tag push(vX.Y.Z) → Deploy Server Image(GHCR scan/promote)
→ (필요 시) sync-config → OCI compose promotion(05 script) → health/BFF 확인
→ Deploy Front(release_tag=vX.Y.Z) → smoke → GitHub Release
```

릴리즈 전 로컬 검증 예시:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
python3 -B scripts/check-deploy-workflow-contract.py
```

OCI backend promotion:

```bash
READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
READMATES_APP_BASE_URL=https://app.example.com \
./deploy/oci/05-deploy-compose-stack.sh
```

Frontend 배포:

```bash
gh workflow run "Deploy Front" --ref main -f release_tag=vX.Y.Z
```

알아둘 점:

- `main` push는 production 배포를 시작하지 않습니다. tag push는 `Deploy Server Image`만 시작합니다.
- OCI promotion은 운영자가 로컬에서 직접 실행합니다. GitHub Actions에는 VM 배포 job이 없습니다(설정 파일 동기화용 `sync-config`만 VM에 접속합니다).
- DB migration이 있으면 같은 tag의 backend를 먼저 올리고 Flyway와 health를 확인한 뒤 frontend를 배포합니다. 실패하면 migration을 되돌리거나 tag를 옮기지 않고, schema를 보존한 호환 image나 새 forward-fix tag로 복구합니다.
- Legacy JAR 경로(`03-deploy.sh`)는 compose 전환 검증과 rollback 전용입니다. [compose-stack.md](compose-stack.md#rollback)를 봅니다.

## Smoke Check

브라우저가 접속하는 운영 origin으로 확인합니다.

```bash
APP_ORIGIN='https://app.example.com'
CLUB_SLUG='{club-slug}'
curl -sS -o /dev/null -w '%{http_code}\n' "$APP_ORIGIN/app"
curl -sS "$APP_ORIGIN/api/bff/api/auth/me"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "$APP_ORIGIN/oauth2/authorization/google"
curl -sS "$APP_ORIGIN/api/bff/api/public/clubs/${CLUB_SLUG}"
READMATES_SMOKE_BASE_URL="$APP_ORIGIN" \
READMATES_SMOKE_AUTH_BASE_URL="$APP_ORIGIN" \
./scripts/smoke-production-integrations.sh
```

확인:

- `/app`은 `200`입니다.
- `/api/bff/api/auth/me`는 Spring까지 도달합니다. 로그아웃 상태여도 anonymous 응답 `200`일 수 있습니다.
- OAuth start는 Google로 redirect되고, smoke script가 `redirect_uri`를 검사합니다.

smoke 결과 전문이나 운영 domain 목록은 Git에 남기지 않습니다.

## 비용 기준

별도 유료 전환 결정이 없으면 아래 free 또는 저비용 범위를 기준으로 합니다.

- Cloudflare Pages와 Workers 호환 free usage
- OCI A1 Compute, boot/block volume free-tier
- OCI MySQL HeatWave `MySQL.Free`가 가능한 region

## 공개 릴리즈 후보 점검

공개 저장소로 내보내기 전에는 clean 후보를 만들고 검사합니다. 자세한 기준은 [security-public-repo.md](security-public-repo.md)입니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

후보에는 local env 파일, provider state, DB dump, key material, private 문서, 실제 데이터 screenshot, 배포 상태가 없어야 합니다.
