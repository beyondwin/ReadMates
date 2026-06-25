# ReadMates

ReadMates는 여러 정기 독서모임의 세션 준비, 참여 관리, 기록 공개, 피드백 문서 열람을 클럽별 공개 사이트와 공유 로그인 세션으로 묶은 멤버십 풀스택 웹 서비스입니다.

- Site: [https://readmates.pages.dev](https://readmates.pages.dev)
- Stack: `React 19`, `TypeScript`, `Vite`, `Cloudflare Pages Functions`, `Kotlin`, `Spring Boot`, `Spring Security`, `MySQL`, `Flyway`, optional `Redis`, `Redpanda/Kafka`, `Micrometer/Prometheus`
- Scope: 멀티 클럽 플랫폼에서 클럽별 공개 사이트, 현재·예정 회차 준비, 참여 관리, 기록 공개, 피드백 문서 열람까지 아우르는 운영형 서비스
- Highlight: Google OAuth, 안전한 로그인 복귀 경로, 서버 측 공유 session cookie, Cloudflare BFF 보안 경계, club-scoped URL과 역할 권한, Cloudflare Pages marker 기반 domain alias 상태 확인, optional Redis rate limit/cache와 AI job state/cost cap, 현재/예정 세션 공개 범위, 세션 기록 JSON 가져오기와 in-app AI 세션 생성, 멤버 알림 설정과 알림함, 호스트 수동 알림 발송 워크벤치, 피드백 문서 접근 제어, 디자인 시스템 workspace, Playwright E2E, route-critical component visual regression, Lighthouse diagnostic, 공개 릴리즈 후보 scan
- 운영 파이프라인: MySQL transactional event outbox, Redpanda/Kafka relay/consumer 기반 이메일 및 in-app 알림, 수동 발송 preview/confirm 감사 원장, 클럽명 기반 HTML/plain text 이메일 템플릿, Micrometer/Prometheus 운영 지표, OCI Object Storage 백업 업로드를 지원합니다.

이 저장소는 외부 공개를 전제로 정리되어 있습니다. 운영 secret, 실제 멤버 데이터, private deployment state, DB dump, 로컬 경로, OCI OCID는 문서와 예시에 포함하지 않습니다.

## How to Review This Project

처음 보는 리뷰어라면 아래 순서가 가장 빠릅니다.

1. **제품 표면 확인** — 게스트로 공개 클럽 소개, 공개 기록, 공개 세션 상세를 확인합니다. 멤버/호스트 reading loop는 권한상 비공개이므로 [Guest-mode walkthrough](docs/showcase/guest-mode-walkthrough.md)에서 public surface와 private workflow evidence를 함께 확인합니다.
2. **아키텍처 판단** — Cloudflare Pages Functions BFF, Spring API, MySQL/Flyway, Redis/Kafka, AI generation, release safety가 어떻게 연결되는지 [Architecture evidence](docs/showcase/architecture-evidence.md)에서 봅니다.
3. **유지보수 품질 확인** — frontend boundary, server ArchUnit, query budget, public release scan 같은 검증은 [Engineering confidence](docs/showcase/engineering-confidence.md)에 정리합니다.
4. **운영 증거 확인** — release readiness, deploy runbook, post-deploy watch, postmortem 흐름은 [Operational proof](docs/showcase/operational-proof.md)에서 봅니다.

Showcase 문서는 현재 동작의 source of truth가 아니라 읽는 순서입니다. 실제 경계와 동작은 코드, 테스트, scripts, migrations, [아키텍처 문서](docs/development/architecture.md)를 우선합니다.

## Engineering Highlights

운영 중인 서비스에서 풀어낸 비자명한 문제들입니다. 각 항목은 deep-dive로 연결됩니다.

- **BFF 보안 경계와 무중단 secret rotation** — Cloudflare Pages Functions에서 cookie domain strip, 내부 헤더 차단, multi-secret 회전을 한 곳에 응집. 분 단위 secret 회전과 audit log를 보유합니다. → [Case study](docs/case-studies/01-bff-security-and-secret-rotation.md)
- **Mutation과 알림 발송의 결합 분리** — MySQL transactional outbox + Kafka relay로 mutation 트랜잭션과 SMTP/in-app 발송을 분리. PENDING/PUBLISHING/PUBLISHED/FAILED/DEAD state machine과 masked audit ledger를 운영합니다. → [Case study](docs/case-studies/02-notification-pipeline-with-outbox.md)
- **Multi-club domain platform** — 하나의 인스턴스에서 path-routed shared fallback과 custom domain alias를 같은 codepath로. host/slug 우선순위 설계와 dev/prod parity가 깨진 실제 incident를 post-mortem으로 보유합니다. → [Case study](docs/case-studies/03-multi-club-domain-platform.md)
- **PII-safe in-app AI session generation** — Transcript 기반 세션 기록 생성을 feature flag, provider adapter, Redis/Kafka job lifecycle, MySQL audit/cost cap, schema validator, kill switch로 운영 경계 안에 넣었습니다. → [Case study](docs/case-studies/04-pii-safe-ai-session-generation.md)

## 문서 사용 기준

README는 제품과 아키텍처의 첫 진입점입니다. 실제 작업에서는 아래 source of truth를 우선합니다.

- 현재 동작과 경계: 코드, 테스트, [아키텍처 문서](docs/development/architecture.md)
- 로컬 실행과 검증: [개발자 문서](docs/development/README.md), [테스트 가이드](docs/development/test-guide.md)
- 운영 배포와 공개 안전: [배포 문서](docs/deploy/README.md), [공개 저장소 보안](docs/deploy/security-public-repo.md), [scripts 문서](scripts/README.md)
- 운영 관찰과 반복 절차: [운영 문서](docs/operations/README.md), [운영 runbook](docs/operations/runbooks/README.md)

문서나 예시를 고칠 때는 실제 운영값 대신 placeholder를 사용하고, 변경한 표면에 맞는 최소 검증을 실행합니다. 실행하지 못한 검증은 통과한 것처럼 쓰지 않고 이유를 남깁니다.

## 왜 만들었나

소규모 독서모임은 규모가 작아도 운영 정보가 쉽게 흩어집니다. 모임 공지, RSVP, 읽은 분량, 질문, 하이라이트, 한줄평, 장문 서평, 참석 기록, 모임 후 피드백 문서가 채팅방과 문서 도구 사이에 분산되면 다음 회차를 준비하거나 지난 기록을 다시 찾기 어렵습니다.

ReadMates는 이 문제를 단순 게시판이나 CRUD 목록으로 풀지 않습니다. 공개 사이트, 멤버 앱, 호스트 운영 도구, 공개 기록, 참석자 전용 피드백 문서를 하나의 제품 흐름으로 연결해 세션 전후의 실제 운영을 줄이는 데 초점을 둡니다.

리뷰어가 로그인 없이 확인할 수 있는 공개 표면은 guest-mode walkthrough에 따로 묶었습니다. 공개 접근은 클럽 소개, 공개 기록, 공개 세션 상세로 제한되며 멤버, 호스트, platform admin, AI 생성, 알림 운영 흐름은 권한을 열지 않고 sanitized evidence로 설명합니다.

## 역할별 기능

| 역할 | 할 수 있는 일 |
| --- | --- |
| 게스트 | 로그인 없이 클럽별 공개 소개, 공개 기록, 공개 세션 상세를 볼 수 있습니다. |
| 둘러보기 멤버 | 초대 없이 Google로 로그인한 계정입니다. 비공개 세션 기록, 현재 세션 현황, 멤버 공개 예정 세션을 읽을 수 있지만 RSVP, 체크인, 질문/서평 작성, 피드백 문서 열람, 호스트 도구는 제한됩니다. |
| 정식 멤버 | 초대 링크를 수락했거나 호스트가 전환한 계정입니다. 현재 세션 참여, 예정 세션 확인, RSVP, 읽은 분량 제출, 질문, 한줄평, 장문 서평 작성, 본인 표시 이름과 이메일 알림 설정 변경, `/app/notifications` 알림함 확인이 가능하며 참석한 회차의 피드백 문서를 읽을 수 있습니다. |
| 호스트 | 정식 멤버 권한에 운영 권한이 추가됩니다. 초대 생성, 둘러보기 멤버 전환, 멤버 상태와 표시 이름 관리, 예정 세션 생성/수정, 공개 범위 설정, 현재 세션 시작, 참석 확정, 진행 세션 닫기, 닫힌 기록 발행, AI 생성 또는 JSON 가져오기를 통한 세션 기록 패키지 저장, 세션별 수동 알림 발송과 발송 원장 운영을 수행합니다. |
| 플랫폼 관리자 | `/admin/today` 트리아지 · `/admin/health` 운영 헬스 · `/admin/notifications` 알림 운영 · `/admin/clubs[/{clubId}]` 클럽 운영 · `/admin/ai-ops` AI Ops · `/admin/support` 지원 · `/admin/audit` 감사 ledger · `/admin/analytics` 운영 분석 라우트 패밀리에서 좌측 nav, 상단 status strip, OWNER/OPERATOR/SUPPORT 권한 매트릭스로 플랫폼 운영을 합니다. 클럽별 호스트/멤버 권한과 별도 권한입니다. |

로그인은 Google OAuth를 사용하며, 로컬 개발에서는 fixture 기반 dev-login을 사용할 수 있습니다.

## 아키텍처 요약

```text
Browser
  |
  | same-origin SPA, /api/bff/**, /oauth2/**, /login/oauth2/**
  v
Cloudflare Pages
  |-- Vite SPA
  |-- Pages Functions BFF and OAuth proxy
        |-- /api/bff/** -> Spring /api/**
        |-- /oauth2/authorization/** -> Spring OAuth start
        |-- /login/oauth2/code/** -> Spring OAuth callback
  |
  | X-Readmates-Bff-Secret, forwarded cookies
  v
Spring Boot API
  |-- Google OAuth success handling
  |-- HttpOnly readmates_session cookie
  |-- optional Redis-backed rate limit, read-through cache, AI job state
  |-- membership, role, and session authorization
  |-- feedback document parsing and access control
  |-- Flyway migrations
  |---> Redis (optional, disabled by default)
  v
MySQL
```

프로덕션에서 브라우저는 Spring API origin을 직접 신뢰 경계로 사용하지 않습니다. 브라우저는 같은 origin의 Cloudflare Pages Functions에 요청하고, BFF가 Spring `/api/**`로 전달하면서 `X-Readmates-Bff-Secret`을 붙입니다. 직접 API origin 예시는 문서에서 `https://api.example.com` 같은 placeholder만 사용합니다.

클럽 공개 URL은 `https://readmates.pages.dev/clubs/<club-slug>` fallback을 기본 보장 경로로 사용합니다. 운영자가 primary domain과 registered subdomain alias를 연결하면 canonical public URL, OAuth return URL, domain status check 정책은 [multi-club domain runbook](docs/deploy/multi-club-domains.md)을 따릅니다.

## 기술 설계 하이라이트

- Browser-facing origin은 Cloudflare Pages이며, API와 OAuth는 Pages Functions BFF를 통해 Spring으로 전달합니다.
- 인증은 Google OAuth와 서버 측 `readmates_session` cookie를 사용하고, raw token은 저장하지 않습니다. 로그인 세션은 platform 전체에서 공유하고 role/status는 club membership별로 판정합니다. 프런트엔드는 같은 origin의 안전한 relative `returnTo`만 로그인과 OAuth 시작 흐름에 전달합니다.
- MySQL/Flyway가 source of truth이며 Redis는 rate limit, cache, invalidation, AI generation job handoff/cost counter를 위한 optional 보조 계층입니다.
- 세션 lifecycle, 공개 범위, 역할 기반 권한, 피드백 문서 접근 제어는 서버에서 검증합니다.
- 알림은 MySQL transactional outbox와 Kafka relay/consumer로 처리하며, 서버의 순수 템플릿 helper가 club-scoped in-app/deep link/email subject/plain/HTML copy를 함께 생성합니다. 호스트는 세션과 대상 그룹을 고른 뒤 preview를 10분 TTL로 확정해 수동 알림을 만들 수 있고, duplicate dispatch는 명시적 재발송 확인을 요구합니다. SMTP는 HTML이 있으면 plain text fallback을 포함한 MIME 메시지로 발송하고, 공개 릴리즈 후보는 별도 scanner로 점검합니다.

상세한 배경과 trade-off는 [주요 기술적 의사결정](docs/development/technical-decisions.md)을 참고합니다.

## AI-assisted 운영 콘텐츠

ReadMates 호스트 도구는 세션 기록을 채우는 두 가지 모드를 함께 제공합니다.

- **외부 정리된 산출물 (legacy)**: 호스트가 앱 밖에서 정리한 `readmates-session-import:v1` JSON을 호스트 세션 편집기로 가져옵니다. 이 흐름은 server/frontend에서 AI API를 호출하지 않고, 앱은 검증과 commit만 담당합니다. 형식 정의는 [docs/development/session-import-generator.md](docs/development/session-import-generator.md).
- **In-app AI 생성**: 호스트 세션 편집기 안에서 LLM이 transcript로부터 공개 요약/하이라이트/한줄평/피드백 문서를 직접 생성합니다. Provider adapter는 Claude, OpenAI, Gemini를 지원하며, Kafka job queue + Redis job state/cost counter + MySQL audit log로 PII-safe하게 운영합니다. Commit/cancel 이후에는 transcript/result payload를 지우고 terminal job 상태만 TTL까지 남깁니다.

In-app AI 생성은 `readmates.aigen.enabled`와 `readmates.aigen.enabled-providers` 두 flag로 운영 단위에서 feature-gate됩니다. 두 flag 모두 기본 off이며, 운영자가 provider API key(`READMATES_AIGEN_{ANTHROPIC|OPENAI|GEMINI}_API_KEY`)를 프로비저닝하고 명시적으로 enable한 환경에서만 동작합니다. 운영 절차(모델 allowlist, cap 관리, key 회전, alert 대응, kill switch)는 [docs/operations/runbooks/ai-session-generation.md](docs/operations/runbooks/ai-session-generation.md), 설계 spec은 [docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md](docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md)를 따릅니다.

## 개발 계획과 스펙 기록

ReadMates는 기능을 설계하고 구현하는 과정에서 작성한 계획서와 스펙 문서를 함께 보관합니다.

- [Plans](docs/superpowers/plans): 기능 구현 전 검토한 실행 계획과 의사결정 기록
- [Specs](docs/superpowers/specs): 제품 요구사항, 설계 의도, 기능 단위 스펙 기록

이 문서들은 개발 과정의 맥락을 보여주는 기록이며, 현재 제품 동작의 기준은 코드와 [아키텍처 문서](docs/development/architecture.md)를 우선합니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | `React 19`, `React Router 7`, `TanStack Query v5`, `TypeScript`, `Vite` |
| Design system | `@readmates/design-system`, `design/docs` static catalog |
| Frontend tests | `Vitest`, `Testing Library`, `Playwright E2E`, `Playwright CT`, `Lighthouse` diagnostic |
| Edge/BFF | `Cloudflare Pages Functions` |
| Backend | `Kotlin`, `Spring Boot`, `Spring Security`, `OAuth2 Client`, `JDBC`, `Flyway` |
| Database | `MySQL 8` compatible database, `Testcontainers MySQL` |
| Cache/Rate limit | Optional `Redis`, `Testcontainers Redis` |
| Async/Operations | `Redpanda/Kafka`, `Micrometer`, `Prometheus`, OCI Email Delivery, OCI Object Storage backup |
| Deployment | `Cloudflare Pages`, `OCI Compute`, `Docker Compose`, `OCI MySQL HeatWave`, `systemd`, `Caddy` |

## 검증 방식

주요 검증 명령은 아래와 같습니다. 상세 설명은 [테스트 가이드](docs/development/test-guide.md)를 참고합니다.

푸시 전에는 CI에서 자주 깨지는 게이트를 한 번에 묶은 로컬 사전 점검을 먼저 실행할 수 있습니다.

```bash
./scripts/pre-push-check.sh
```

릴리즈나 태그 배포 직전에는 integration/E2E와 공개 릴리즈 후보 점검까지 강제합니다.

```bash
./scripts/pre-push-check.sh --full --release
```

개별 표면을 좁게 확인할 때는 아래 명령을 직접 실행합니다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
pnpm --dir front lighthouse:diagnose -- --group public --limit 2
./server/gradlew -p server clean test
```

Route-critical UI baseline을 갱신할 때는 macOS 로컬 렌더러가 아니라 Docker 경로를 사용합니다.

```bash
pnpm --dir front test:ct:update:docker
```

공개 릴리즈 후보 검증은 배포 절차와 별개로 실행합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

배포 후 Cloudflare Pages marker와 OAuth redirect URI는 별도 smoke script로 확인합니다.

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

## 로컬 실행 요약

자세한 로컬 실행 절차는 [docs/development/local-setup.md](docs/development/local-setup.md)에 정리합니다.

필수 도구:

- `JDK 21`
- `Node.js 24` 권장
- `pnpm`
- `Docker Compose` 또는 `MySQL 8` compatible database

요약 명령:

```bash
pnpm install --frozen-lockfile
docker compose up -d mysql
```

Redis-backed 기능을 로컬에서 확인할 때만 Redis도 함께 띄웁니다.

```bash
docker compose up -d mysql redis
```

```bash
SPRING_PROFILES_ACTIVE=dev \
SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/<local-db-name>?serverTimezone=UTC' \
READMATES_APP_BASE_URL=http://localhost:5173 \
READMATES_AUTH_BASE_URL=http://localhost:5173 \
READMATES_AUTH_RETURN_STATE_SECRET='<local-return-state-signing-secret>' \
READMATES_ALLOWED_ORIGINS=http://localhost:5173 \
READMATES_BFF_SECRET='<local-bff-secret>' \
READMATES_IP_HASH_BASE_SECRET='<local-ip-hash-base-secret>' \
./server/gradlew -p server bootRun
```

```bash
READMATES_API_BASE_URL=http://localhost:8080 \
READMATES_BFF_SECRET='<local-bff-secret>' \
pnpm --dir front dev
```

브라우저에서 `http://localhost:5173`을 엽니다. Dev profile은 sample seed data와 dev-login을 로컬 개발용으로만 제공합니다.

## 문서 링크

| 목적 | 문서 |
| --- | --- |
| 개발자 문서 허브 | [docs/development/README.md](docs/development/README.md) |
| 로컬 실행 | [docs/development/local-setup.md](docs/development/local-setup.md) |
| 아키텍처 상세 | [docs/development/architecture.md](docs/development/architecture.md) |
| 코드베이스 graph 탐색 | [docs/development/graphify.md](docs/development/graphify.md) |
| Cross-surface 작업 체크리스트 | [docs/development/vertical-slice-checklist.md](docs/development/vertical-slice-checklist.md) |
| 세션 기록 JSON 가져오기 | [docs/development/session-import-generator.md](docs/development/session-import-generator.md) |
| 디자인 시스템 | [design/README.md](design/README.md) |
| 주요 기술적 의사결정 | [docs/development/technical-decisions.md](docs/development/technical-decisions.md) |
| 테스트 가이드 | [docs/development/test-guide.md](docs/development/test-guide.md) |
| 버저닝 | [docs/development/versioning.md](docs/development/versioning.md) |
| 릴리즈 관리와 CHANGELOG | [docs/development/release-management.md](docs/development/release-management.md), [CHANGELOG.md](CHANGELOG.md) |
| 배포 문서 허브 | [docs/deploy/README.md](docs/deploy/README.md) |
| 새 버전 발행과 운영 배포 | [docs/deploy/release-publish-runbook.md](docs/deploy/release-publish-runbook.md) |
| Cloudflare Pages, SPA fallback, OAuth proxy | [docs/deploy/cloudflare-pages.md](docs/deploy/cloudflare-pages.md) |
| Multi-club domains | [docs/deploy/multi-club-domains.md](docs/deploy/multi-club-domains.md) |
| OCI Compose Stack | [docs/deploy/compose-stack.md](docs/deploy/compose-stack.md) |
| OCI backend | [docs/deploy/oci-backend.md](docs/deploy/oci-backend.md) |
| OCI MySQL HeatWave | [docs/deploy/oci-mysql-heatwave.md](docs/deploy/oci-mysql-heatwave.md) |
| 공개 저장소 보안과 release safety | [docs/deploy/security-public-repo.md](docs/deploy/security-public-repo.md) |
| 운영 runbook, observability, post-mortem | [docs/operations/README.md](docs/operations/README.md) |
| DB backup, 복구, secrets/VM deploy key bootstrap | [docs/operations/runbooks/README.md](docs/operations/runbooks/README.md) |
| Release helper scripts | [scripts/README.md](scripts/README.md) |

README는 제품 개요와 핵심 설계 판단을 빠르게 파악하는 진입점으로 두고, 상세 로컬 실행 절차와 테스트, 아키텍처, 배포 runbook은 위 문서로 분리합니다.
