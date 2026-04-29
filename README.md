# ReadMates

ReadMates는 정기 독서모임의 세션 준비, 참여 관리, 기록 공개, 피드백 문서 열람을 하나의 흐름으로 묶은 멤버십 풀스택 웹 서비스입니다.

- Demo: [https://readmates.pages.dev](https://readmates.pages.dev)
- Stack: `React 19`, `TypeScript`, `Vite`, `Cloudflare Pages Functions`, `Kotlin`, `Spring Boot`, `Spring Security`, `MySQL`, `Flyway`, optional `Redis`, `Kafka`, `Micrometer/Prometheus`
- Scope: 정기 독서모임의 현재·예정 회차 준비부터 참여 관리, 기록 공개, 피드백 문서 열람까지 아우르는 운영형 서비스
- Highlight: Google OAuth, 서버 측 session cookie, Cloudflare BFF 보안 경계, optional Redis rate limit/cache, 현재/예정 세션 공개 범위, 역할 기반 권한 제어, 멤버 알림 설정과 알림함, 피드백 문서 접근 제어, Playwright E2E, 공개 릴리즈 후보 scan
- 운영 파이프라인: MySQL transactional event outbox, Kafka relay/consumer 기반 이메일 및 in-app 알림, Micrometer/Prometheus 운영 지표, OCI Object Storage 백업 업로드를 지원합니다.

이 저장소는 외부 공개를 전제로 정리되어 있습니다. 운영 secret, 실제 멤버 데이터, private deployment state, DB dump, 로컬 경로, OCI OCID는 문서와 예시에 포함하지 않습니다.

## 왜 만들었나

소규모 독서모임은 규모가 작아도 운영 정보가 쉽게 흩어집니다. 모임 공지, RSVP, 읽은 분량, 질문, 하이라이트, 한줄평, 장문 서평, 참석 기록, 모임 후 피드백 문서가 채팅방과 문서 도구 사이에 분산되면 다음 회차를 준비하거나 지난 기록을 다시 찾기 어렵습니다.

ReadMates는 이 문제를 단순 게시판이나 CRUD 목록으로 풀지 않습니다. 공개 사이트, 멤버 앱, 호스트 운영 도구, 공개 기록, 참석자 전용 피드백 문서를 하나의 제품 흐름으로 연결해 세션 전후의 실제 운영을 줄이는 데 초점을 둡니다.

## 역할별 기능

| 역할 | 할 수 있는 일 |
| --- | --- |
| 게스트 | 로그인 없이 공개 소개, 공개 기록, 공개 세션 상세를 볼 수 있습니다. |
| 둘러보기 멤버 | 초대 없이 Google로 로그인한 계정입니다. 비공개 세션 기록, 현재 세션 현황, 멤버 공개 예정 세션을 읽을 수 있지만 RSVP, 체크인, 질문/서평 작성, 피드백 문서 열람, 호스트 도구는 제한됩니다. |
| 정식 멤버 | 초대 링크를 수락했거나 호스트가 전환한 계정입니다. 현재 세션 참여, 예정 세션 확인, RSVP, 읽은 분량 제출, 질문, 한줄평, 장문 서평 작성, 본인 표시 이름과 이메일 알림 설정 변경, `/app/notifications` 알림함 확인이 가능하며 참석한 회차의 피드백 문서를 읽을 수 있습니다. |
| 호스트 | 정식 멤버 권한에 운영 권한이 추가됩니다. 초대 생성, 둘러보기 멤버 전환, 멤버 상태와 표시 이름 관리, 예정 세션 생성/수정, 공개 범위 설정, 현재 세션 시작, 참석 확정, 진행 세션 닫기, 닫힌 기록 발행, 피드백 문서 업로드, 알림 발송 운영을 수행합니다. |

비밀번호 로그인과 비밀번호 재설정 엔드포인트는 현재 운영 경로에서 제외되어 `410 Gone`을 반환합니다. 실제 로그인은 Google OAuth를 사용하며, 로컬 개발에서는 fixture 기반 dev-login을 사용할 수 있습니다.

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
  |-- optional Redis-backed rate limit and read-through cache
  |-- membership, role, and session authorization
  |-- feedback document parsing and access control
  |-- Flyway migrations
  |---> Redis (optional, disabled by default)
  v
MySQL
```

프로덕션에서 브라우저는 Spring API origin을 직접 신뢰 경계로 사용하지 않습니다. 브라우저는 같은 origin의 Cloudflare Pages Functions에 요청하고, BFF가 Spring `/api/**`로 전달하면서 `X-Readmates-Bff-Secret`을 붙입니다. 직접 API origin 예시는 문서에서 `https://api.example.com` 같은 placeholder만 사용합니다.

## 기술 설계 하이라이트

- Browser-facing origin은 Cloudflare Pages이며, API와 OAuth는 Pages Functions BFF를 통해 Spring으로 전달합니다.
- 인증은 Google OAuth와 서버 측 `readmates_session` cookie를 사용하고, raw token은 저장하지 않습니다.
- MySQL/Flyway가 source of truth이며 Redis는 rate limit, cache, invalidation을 위한 optional 보조 계층입니다.
- 세션 lifecycle, 공개 범위, 역할 기반 권한, 피드백 문서 접근 제어는 서버에서 검증합니다.
- 알림은 MySQL transactional outbox와 Kafka relay/consumer로 처리하고, 공개 릴리즈 후보는 별도 scanner로 점검합니다.

상세한 배경과 trade-off는 [주요 기술적 의사결정](docs/development/technical-decisions.md)을 참고합니다.

## AI-assisted 운영 콘텐츠

ReadMates의 피드백, 하이라이트, 한줄평은 앱 외부 운영 워크플로우에서 AI로 정리된 운영 산출물입니다. ReadMates는 그 산출물을 저장, 파싱, 권한 검증, 공개하고 세션 기록과 피드백 문서로 보여줍니다.

현재 ReadMates 앱, 서버, 프론트엔드는 AI API를 직접 호출하지 않습니다. 즉, 제품 기능은 in-app AI generation이 아니라 외부에서 정리된 콘텐츠를 안전하게 운영하고 노출하는 흐름입니다.

## 개발 계획과 스펙 기록

ReadMates는 기능을 설계하고 구현하는 과정에서 작성한 계획서와 스펙 문서를 함께 보관합니다.

- [Plans](docs/superpowers/plans): 기능 구현 전 검토한 실행 계획과 의사결정 기록
- [Specs](docs/superpowers/specs): 제품 요구사항, 설계 의도, 기능 단위 스펙 기록

이 문서들은 개발 과정의 맥락을 보여주는 기록이며, 현재 제품 동작의 기준은 코드와 [아키텍처 문서](docs/development/architecture.md)를 우선합니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | `React 19`, `React Router 7`, `TypeScript`, `Vite` |
| Frontend tests | `Vitest`, `Testing Library`, `Playwright` |
| Edge/BFF | `Cloudflare Pages Functions` |
| Backend | `Kotlin`, `Spring Boot`, `Spring Security`, `OAuth2 Client`, `JPA`, `Flyway` |
| Database | `MySQL 8` compatible database, `Testcontainers MySQL` |
| Cache/Rate limit | Optional `Redis`, `Testcontainers Redis` |
| Async/Operations | `Kafka`, `Micrometer`, `Prometheus`, OCI Email Delivery, OCI Object Storage backup |
| Deployment | `Cloudflare Pages`, `OCI Compute`, `OCI MySQL HeatWave`, `systemd`, `Caddy` |

## 검증 방식

주요 검증 명령은 아래와 같습니다. 상세 설명은 [테스트 가이드](docs/development/test-guide.md)를 참고합니다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
```

공개 릴리즈 후보 검증은 배포 절차와 별개로 실행합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
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
pnpm --dir front install --frozen-lockfile
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
READMATES_ALLOWED_ORIGINS=http://localhost:5173 \
READMATES_BFF_SECRET='<local-bff-secret>' \
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
| 주요 기술적 의사결정 | [docs/development/technical-decisions.md](docs/development/technical-decisions.md) |
| 테스트 가이드 | [docs/development/test-guide.md](docs/development/test-guide.md) |
| 릴리즈 관리와 CHANGELOG | [docs/development/release-management.md](docs/development/release-management.md), [CHANGELOG.md](CHANGELOG.md) |
| 배포 문서 허브 | [docs/deploy/README.md](docs/deploy/README.md) |
| Cloudflare Pages | [docs/deploy/cloudflare-pages.md](docs/deploy/cloudflare-pages.md) |
| SPA fallback | [docs/deploy/cloudflare-pages-spa.md](docs/deploy/cloudflare-pages-spa.md) |
| OCI backend | [docs/deploy/oci-backend.md](docs/deploy/oci-backend.md) |
| OCI MySQL HeatWave | [docs/deploy/oci-mysql-heatwave.md](docs/deploy/oci-mysql-heatwave.md) |
| 공개 저장소 보안과 release safety | [docs/deploy/security-public-repo.md](docs/deploy/security-public-repo.md) |
| Release helper scripts | [scripts/README.md](scripts/README.md) |

README는 포트폴리오 첫 화면 역할에 집중하고, 상세 로컬 실행 절차와 테스트, 아키텍처, 배포 runbook은 위 문서로 분리합니다.
