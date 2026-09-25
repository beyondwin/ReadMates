# ReadMates

ReadMates는 초대 기반 독서모임 앱입니다. 여러 클럽이 한 플랫폼을 쓰고, 클럽마다 공개 사이트와 멤버·호스트 공간을 가집니다. 세션 준비, 참여, 기록 공개, 피드백 문서 열람을 한 흐름으로 묶습니다.

- **Stack**: `React 19`, `TypeScript`, `Vite`, `Cloudflare Pages Functions`, `Kotlin`, `Spring Boot 4`, `Spring AI 2`, `Spring Security`, `MySQL`, `Flyway`, optional `Redis`, `Redpanda/Kafka`, `Micrometer/OpenTelemetry`
- **핵심 기능**: Google OAuth와 서버 측 공유 session cookie, Cloudflare BFF 보안 경계, club-scoped URL과 역할 권한, 현재·예정 세션 공개 범위, 세션 기록 JSON 가져오기와 근거 기반 AI 생성, 피드백 문서(템플릿 v1/v2) 접근 제어, 멤버 알림함, 호스트 운영 원장과 3단계 수동 알림 발송
- **운영 기반**: MySQL transactional outbox + Redpanda/Kafka 알림 파이프라인, Micrometer/Prometheus 지표, OpenTelemetry trace, OCI Object Storage 백업, Playwright E2E, 시각 회귀, 공개 릴리즈 후보 scan

이 저장소는 공개를 전제로 관리합니다. 운영 secret, 실제 멤버 데이터, 배포 상태, DB dump, 로컬 경로, OCI OCID는 문서와 예시에 넣지 않습니다.

## How to Review This Project

처음 보는 리뷰어는 아래 순서로 보면 빠릅니다.

1. **제품 표면**: [Guest-mode walkthrough](docs/showcase/guest-mode-walkthrough.md) — 로그인 없이 볼 수 있는 화면과, 권한상 비공개인 흐름의 근거
2. **아키텍처**: [Architecture evidence](docs/showcase/architecture-evidence.md) — BFF, Spring API, MySQL, Redis/Kafka, AI 생성, 릴리즈 안전의 연결
3. **유지보수 품질**: [Engineering confidence](docs/showcase/engineering-confidence.md) — 경계 테스트, query budget, 공개 릴리즈 scan
4. **운영 증거**: [Operational proof](docs/showcase/operational-proof.md) — 릴리즈 점검, 배포, 배포 후 관찰, postmortem

Showcase는 읽는 순서일 뿐 source of truth가 아닙니다. 실제 동작은 코드, 테스트, scripts, migrations, [아키텍처 문서](docs/development/architecture.md)가 기준입니다.

## Engineering Highlights

운영하면서 푼 비자명한 문제들입니다. 각 항목은 deep-dive로 이어집니다.

- **BFF 보안 경계와 무중단 secret rotation** — cookie domain 제거, 내부 헤더 차단, multi-secret 회전을 Pages Functions 한 곳에 모았습니다. → [Case study](docs/case-studies/01-bff-security-and-secret-rotation.md)
- **Mutation과 알림 발송 분리** — MySQL outbox + Kafka relay로 트랜잭션과 SMTP/in-app 발송을 떼어 냈습니다. `PENDING/PUBLISHING/PUBLISHED/FAILED/DEAD` 상태와 masked audit ledger로 운영합니다. → [Case study](docs/case-studies/02-notification-pipeline-with-outbox.md)
- **Multi-club domain platform** — path 기반 fallback과 custom domain alias를 같은 코드 경로로 처리합니다. dev/prod 차이로 생긴 실제 장애를 postmortem으로 남겼습니다. → [Case study](docs/case-studies/03-multi-club-domain-platform.md)
- **PII-safe grounded AI review** — 대본의 모든 화자를 같은 클럽 활성 멤버와 먼저 정확히 맞추고, 근거와 네 섹션 검토를 통과한 결과만 staged draft로 저장합니다. 원문과 검토 전 결과는 최대 6시간 Redis에만 두고 Kafka·audit·receipt에는 남기지 않습니다. → [Case study](docs/case-studies/04-pii-safe-ai-session-generation.md)
- **Fail-closed multi-provider AI 실행** — OpenAI·Anthropic·Google을 Spring AI 2 thin adapter로 묶고, 재시도·fallback·최대 3회 호출·provider별 circuit·원자 비용 예약은 application이 소유합니다. Revision CAS와 content-free receipt로 commit 중 crash를 복구합니다. → [Provider architecture](docs/development/spring-ai-2-provider-architecture.md)

## 문서 사용 기준

README는 첫 진입점입니다. 실제 작업은 아래 문서를 기준으로 합니다.

| 필요한 것 | 문서 |
| --- | --- |
| 프로젝트 지형, 작업 표면, 멈춤 조건 | [프로젝트 지도](docs/development/project-map.md) |
| 변경 slice의 risk evidence | [acceptance matrix](docs/development/acceptance-matrix.md) |
| 현재 동작과 경계 | 코드, 테스트, [아키텍처 문서](docs/development/architecture.md) |
| 로컬 실행과 검증 | [개발자 문서](docs/development/README.md), [테스트 가이드](docs/development/test-guide.md) |
| 배포와 공개 안전 | [배포 문서](docs/deploy/README.md), [공개 저장소 보안](docs/deploy/security-public-repo.md), [scripts 문서](scripts/README.md) |
| 운영 관찰과 반복 절차 | [운영 문서](docs/operations/README.md), [운영 runbook](docs/operations/runbooks/README.md) |

문서와 예시에는 실제 값 대신 placeholder를 씁니다. 실행하지 못한 검증은 통과한 것처럼 쓰지 않고 이유를 남깁니다.

## 왜 만들었나

작은 독서모임도 운영 정보는 쉽게 흩어집니다. 공지, RSVP, 읽은 분량, 질문, 하이라이트, 한줄평, 서평, 참석 기록, 모임 후 피드백이 채팅방과 문서 도구에 나뉘면 다음 회차 준비와 지난 기록 찾기가 어려워집니다.

ReadMates는 이를 게시판이 아니라 하나의 제품 흐름으로 풉니다. 공개 사이트, 멤버 앱, 호스트 도구, 공개 기록, 멤버 전용 피드백 문서를 이어서 세션 전후의 운영 부담을 줄입니다.

## 역할별 기능

| 역할 | 할 수 있는 일 |
| --- | --- |
| 게스트 | 로그인 없이 클럽 공개 소개, 공개 기록, 공개 세션 상세를 봅니다. 공개 클럽에서는 읽기 전용 게스트 앱(`/clubs/:slug/app`)으로 둘러볼 수 있습니다. |
| 둘러보기 멤버 | 초대 없이 Google로 로그인한 계정입니다. `GUEST_READABLE` 세션의 기록, 현재 세션, 예정 세션을 읽습니다. RSVP, 체크인, 질문·서평 작성, 피드백 문서, 호스트 도구는 쓸 수 없습니다. |
| 정식 멤버 | 초대를 수락했거나 호스트가 전환한 계정입니다. RSVP, 읽은 분량, 질문, 한줄평, 장문 서평을 남기고, 표시 이름과 알림 설정을 바꾸고, `/app/notifications` 알림함을 봅니다. 같은 클럽의 피드백 문서를 읽습니다. |
| 호스트 | 정식 멤버 권한에 운영 권한이 더해집니다. 운영 원장에서 현재·확인 필요 회차를 관리하고, 초대·멤버 상태·예정 세션·공개 범위를 다룹니다. 세션 시작, 참석 확정, 닫기, 기록 발행, AI 생성 또는 JSON 가져오기로 기록 초안 저장, 3단계 수동 알림 발송을 합니다. |
| 플랫폼 관리자 | `/admin/today`, `/admin/health`, `/admin/notifications`, `/admin/clubs[/{clubId}]`, `/admin/ai-ops`, `/admin/support`, `/admin/audit`, `/admin/analytics`에서 플랫폼을 운영합니다. 권한은 `OWNER`/`OPERATOR`/`SUPPORT`이며 클럽 호스트 권한과 별개입니다. AI Ops에서 `SUPPORT`는 읽기만 하고, force-cancel과 commit recovery는 `OWNER`/`OPERATOR`만 실행합니다. |

로그인은 Google OAuth입니다. 로컬 개발에서는 fixture 기반 dev-login을 쓸 수 있습니다.

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
  |-- optional Redis-backed rate limit/read-through cache
  |-- grounded AI job state/evidence/cost admission
  |-- transactional outbox and metadata-only AI job publication
  |-- membership, role, and session authorization
  |-- feedback document parsing and access control
  |-- Flyway migrations
  |---> Redis (optional transient state, disabled by default)
  |---> Redpanda/Kafka (routing and outbox events)
  `----> MySQL (source of truth)
```

- 브라우저는 Spring API origin을 직접 신뢰하지 않습니다. 같은 origin의 Pages Functions가 요청을 받아 Spring `/api/**`로 넘기며 `X-Readmates-Bff-Secret`을 붙입니다.
- Major contract 배포에서 host mutation은 browser bundle과 Pages BFF가 같은 client contract를 선언할 때만 허용합니다. 그래서 backend를 먼저 배포하는 동안 열린 구 탭은 fail closed합니다.
- 클럽 공개 URL은 Pages 기본 도메인의 `/clubs/<club-slug>` 경로가 기본입니다. primary domain과 subdomain alias를 연결하는 정책은 [multi-club domain runbook](docs/deploy/multi-club-domains.md)을 따릅니다.
- 직접 API origin 예시는 `https://api.example.com` 같은 placeholder만 씁니다.

## 기술 설계 하이라이트

- **인증**: Google OAuth + 서버 측 `readmates_session` cookie. raw token은 저장하지 않습니다. 로그인 세션은 플랫폼 전체에서 공유하고, 역할과 상태는 클럽 membership별로 판정합니다. 로그인 복귀 경로는 같은 origin의 안전한 relative `returnTo`만 씁니다.
- **데이터**: MySQL/Flyway가 live 콘텐츠와 staged draft의 source of truth입니다. Redis는 rate limit, cache, AI 생성의 짧은 TTL handoff와 비용 예약을 맡는 optional 보조 계층입니다. AI 생성은 Redis나 provider 설정이 불확실하면 호출 전에 fail closed하고, Kafka에는 routing metadata만 보냅니다.
- **권한**: 세션 lifecycle, 공개 범위, 역할 권한, 피드백 문서 접근은 서버에서 검증합니다.
- **알림**: MySQL outbox + Kafka relay/consumer로 처리합니다. 서버 템플릿 helper가 in-app, deep link, 이메일 제목·plain·HTML 문구를 함께 만듭니다. 콘텐츠를 저장해도 알림은 나가지 않습니다. 호스트가 `회차 → 알림 종류 → 대상과 채널`을 고르고 10분 TTL preview를 확정해야 발송됩니다. 닫기·Escape·화면 이동은 발송하지 않고, 중복 발송은 명시적 재확인을 요구합니다.
- **피드백 문서**: `<!-- readmates-feedback:v1 -->`과 `<!-- readmates-feedback:v2 -->` 템플릿을 모두 읽습니다. v2는 v1 필수 구조를 유지하면서 모임 요약, 회차 흐름, 참여자별 변화 같은 선택 섹션을 더합니다. 선택 섹션은 있을 때만 엄격히 검증하고 화면에 그립니다. → [ADR-0072](docs/development/adr/0072-feedback-document-template-v2.md)

배경과 trade-off는 [주요 기술적 의사결정](docs/development/technical-decisions.md)과 [ADR 목록](docs/development/adr/README.md)을 봅니다.

## AI-assisted 운영 콘텐츠

호스트는 세션 기록을 두 가지 방법으로 채웁니다.

- **JSON 가져오기**: 앱 밖에서 정리한 `readmates-session-import:v1` JSON을 세션 편집기로 가져옵니다. 앱은 검증과 저장만 하고 AI API를 부르지 않습니다. 형식은 [세션 기록 완성 가이드](docs/development/session-import-generator.md)에 있습니다.
- **앱 안 근거 기반 AI 생성**: UTF-8(BOM 허용) TXT 대본을 올리면 서버가 모든 화자를 같은 클럽 활성 멤버와 정확히 맞춘 뒤, 허용된 Claude/OpenAI/Gemini 모델로 결과를 만듭니다. revision별 근거와 네 섹션 검토가 끝나야 staged draft로 저장되고, 별도 반영 전까지 live 콘텐츠는 바뀌지 않습니다. AI 생성 경로는 피드백 문서를 v1 템플릿으로 만듭니다.

운영 규칙:

- `readmates.aigen.enabled`, `readmates.aigen.enabled-providers`, provider API key, provider별 retention 확인으로 켭니다. kill switch와 provider allowlist는 기본 off입니다.
- 대본·turn·근거·검토 전 결과는 Redis에 최대 6시간만 두고 commit/cancel 때 바로 정리합니다. 정리 실패는 `cleanupPending`으로 재시도하고 TTL이 최종 안전망입니다. 검토 완료 snapshot만 `session_record_drafts`에 저장합니다.
- 응답 유실이나 timeout으로 비용이 불확실하면 자동 환불하지 않습니다. revision CAS와 content-free MySQL receipt가 commit 중 crash를 복구합니다.
- 호스트는 진행 중 job을 취소하거나 섹션을 재생성할 수 있습니다. 재생성하면 전체 검토가 초기화됩니다.
- trace와 AI Ops는 provider/model/status/cost-basis 같은 허용된 metadata만 씁니다. 실제 provider 품질 호출과 retention 확인은 일반 CI가 아니라 별도 운영 승인으로 합니다.

상세: [AI 생성 사용 흐름](docs/development/session-import-generator.md#in-app-근거-기반-ai-생성), [Spring AI 2 provider architecture](docs/development/spring-ai-2-provider-architecture.md), [AI generation runbook](docs/operations/runbooks/ai-session-generation.md)

## 개발 계획과 스펙 기록

기능 설계 과정의 [Plans](docs/superpowers/plans)와 [Specs](docs/superpowers/specs)를 함께 보관합니다. 과거 기록일 뿐 현재 동작의 기준은 코드와 [아키텍처 문서](docs/development/architecture.md)입니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | `React 19`, `React Router 8`, `TanStack Query v5`, `TypeScript`, `Vite`, `Zod` |
| Design system | `@readmates/design-system`, `design/docs` static catalog |
| Frontend tests | `Vitest`, `Testing Library`, `Playwright E2E`, `Playwright CT`(Docker), `Lighthouse` diagnostic |
| Edge/BFF | `Cloudflare Pages Functions` |
| Backend | `Kotlin`, `Spring Boot 4`, `Spring Security`, `OAuth2 Client`, `JDBC`, `Flyway`, `detekt`, `ArchUnit` |
| AI generation | `Spring AI 2`, provider별 `ChatModel`, Redis revision/cost state, Kafka metadata queue |
| Database | `MySQL 8` compatible database, `Testcontainers MySQL` |
| Cache/Rate limit | Optional `Redis`, `Testcontainers Redis` |
| Async/Operations | `Redpanda/Kafka`, `Micrometer`, `OpenTelemetry`, `Prometheus`, `Tempo`, `Grafana`, OCI Email Delivery, OCI Object Storage backup |
| Deployment | `Cloudflare Pages`, `OCI Compute`, `Docker Compose`, `systemd`, `Caddy`, `OCI MySQL HeatWave`, GHCR image |

## 검증 방식

상세는 [테스트 가이드](docs/development/test-guide.md)를 봅니다. pnpm은 루트 `packageManager`(`pnpm@11.13.1`)를 Corepack으로 씁니다. `corepack`이 PATH에 없으면 `npx --yes corepack@0.35.0 pnpm --dir front ...`로 실행합니다.

푸시 전 로컬 사전 점검:

```bash
./scripts/pre-push-check.sh                   # CI에서 자주 깨지는 게이트 묶음
./scripts/pre-push-check.sh --full --release  # integration/E2E + 공개 릴리즈 후보까지
```

표면별 점검:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
pnpm --dir front lighthouse:diagnose -- --group public --limit 2
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

- `./scripts/server-ci-check.sh`는 `./server/gradlew -p server check`를 캐시 없이 실행합니다. 여기에는 `unitTest`, `architectureTest`, detekt가 포함됩니다.
- 서버의 기본 Gradle `test` task는 꺼져 있습니다. 단위 테스트는 `unitTest`, Testcontainers는 `integrationTest`로 돌립니다.
- 시각 회귀 baseline은 macOS 렌더러가 아니라 Docker로 갱신합니다: `pnpm --dir front test:ct:update:docker`

공개 릴리즈 후보 점검(배포와 별개):

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

배포 후 Pages marker와 OAuth redirect URI 확인(주소는 placeholder):

```bash
READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://app.example.com \
./scripts/smoke-production-integrations.sh
```

## 로컬 실행 요약

전체 절차는 [local-setup.md](docs/development/local-setup.md)에 있습니다.

필수 도구: `JDK 25`, `Node.js 24`(`.node-version`), `pnpm@11.13.1`(Corepack), `Docker Compose` 또는 `MySQL 8` compatible database

```bash
pnpm install --frozen-lockfile
docker compose up -d mysql          # Redis 기능을 볼 때만: docker compose up -d mysql redis
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

브라우저에서 `http://localhost:5173`을 엽니다. `dev` profile은 로컬 전용 sample seed와 dev-login을 제공합니다.

## 문서 링크

| 목적 | 문서 |
| --- | --- |
| 개발자 문서 허브 | [docs/development/README.md](docs/development/README.md) |
| 프로젝트 지도 | [docs/development/project-map.md](docs/development/project-map.md) |
| 로컬 실행 | [docs/development/local-setup.md](docs/development/local-setup.md) |
| 아키텍처 상세 | [docs/development/architecture.md](docs/development/architecture.md) |
| 테스트 가이드 | [docs/development/test-guide.md](docs/development/test-guide.md) |
| 변경 acceptance matrix | [docs/development/acceptance-matrix.md](docs/development/acceptance-matrix.md) |
| Cross-surface 작업 체크리스트 | [docs/development/vertical-slice-checklist.md](docs/development/vertical-slice-checklist.md) |
| AI 세션 기록 생성과 JSON 가져오기 | [docs/development/session-import-generator.md](docs/development/session-import-generator.md) |
| Spring AI provider, 비용, trace | [docs/development/spring-ai-2-provider-architecture.md](docs/development/spring-ai-2-provider-architecture.md) |
| AI 생성 운영 절차 | [docs/operations/runbooks/ai-session-generation.md](docs/operations/runbooks/ai-session-generation.md) |
| 디자인 시스템 | [design/README.md](design/README.md) |
| 기술적 의사결정, ADR | [docs/development/technical-decisions.md](docs/development/technical-decisions.md), [docs/development/adr/README.md](docs/development/adr/README.md) |
| 버저닝 | [docs/development/versioning.md](docs/development/versioning.md) |
| 릴리즈 관리와 CHANGELOG | [docs/development/release-management.md](docs/development/release-management.md), [CHANGELOG.md](CHANGELOG.md) |
| 배포 문서 허브 | [docs/deploy/README.md](docs/deploy/README.md) |
| 새 버전 발행과 운영 배포 | [docs/deploy/release-publish-runbook.md](docs/deploy/release-publish-runbook.md) |
| Cloudflare Pages, SPA fallback, OAuth proxy | [docs/deploy/cloudflare-pages.md](docs/deploy/cloudflare-pages.md) |
| Multi-club domains | [docs/deploy/multi-club-domains.md](docs/deploy/multi-club-domains.md) |
| OCI Compose stack | [docs/deploy/compose-stack.md](docs/deploy/compose-stack.md) |
| OCI backend | [docs/deploy/oci-backend.md](docs/deploy/oci-backend.md) |
| OCI MySQL HeatWave | [docs/deploy/oci-mysql-heatwave.md](docs/deploy/oci-mysql-heatwave.md) |
| 공개 저장소 보안과 release safety | [docs/deploy/security-public-repo.md](docs/deploy/security-public-repo.md) |
| 운영 runbook, observability, postmortem | [docs/operations/README.md](docs/operations/README.md) |
| DB 백업·복구, secret/VM deploy key bootstrap | [docs/operations/runbooks/README.md](docs/operations/runbooks/README.md) |
| Release helper scripts | [scripts/README.md](scripts/README.md) |
