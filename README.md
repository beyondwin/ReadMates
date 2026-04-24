# ReadMates

ReadMates는 소규모 정기 독서모임의 세션 준비, 참여 관리, 기록 공개, 피드백 문서 열람을 하나의 흐름으로 묶은 invite-only 풀스택 웹 서비스입니다.

- Demo: [https://readmates.pages.dev](https://readmates.pages.dev)
- Stack: `React 19`, `TypeScript`, `Vite`, `Cloudflare Pages Functions`, `Kotlin`, `Spring Boot`, `Spring Security`, `MySQL`, `Flyway`
- Scope: 1개 독서모임과 1개 현재 세션에 최적화된 운영형 서비스
- Highlight: Google OAuth, 서버 측 session cookie, Cloudflare BFF 보안 경계, 역할 기반 권한 제어, 피드백 문서 접근 제어, Playwright E2E, 공개 릴리즈 후보 scan

이 저장소는 포트폴리오 공개 검토를 전제로 정리되어 있습니다. 운영 secret, 실제 멤버 데이터, private deployment state, DB dump, 로컬 경로, OCI OCID는 문서와 예시에 포함하지 않습니다.

## 왜 만들었나

소규모 독서모임은 규모가 작아도 운영 정보가 쉽게 흩어집니다. 모임 공지, RSVP, 읽은 분량, 질문, 하이라이트, 한줄평, 장문 서평, 참석 기록, 모임 후 피드백 문서가 채팅방과 문서 도구 사이에 분산되면 다음 회차를 준비하거나 지난 기록을 다시 찾기 어렵습니다.

ReadMates는 이 문제를 단순 게시판이나 CRUD 목록으로 풀지 않습니다. 공개 사이트, 멤버 앱, 호스트 운영 도구, 공개 기록, 참석자 전용 피드백 문서를 하나의 제품 흐름으로 연결해 세션 전후의 실제 운영을 줄이는 데 초점을 둡니다.

## 역할별 기능

| 역할 | 할 수 있는 일 |
| --- | --- |
| 게스트 | 로그인 없이 공개 소개, 공개 기록, 공개 세션 상세를 볼 수 있습니다. |
| 둘러보기 멤버 | 초대 없이 Google로 로그인한 계정입니다. 비공개 세션 기록과 현재 세션 현황을 읽을 수 있지만 RSVP, 체크인, 질문/서평 작성, 피드백 문서 열람, 호스트 도구는 제한됩니다. |
| 정식 멤버 | 초대 링크를 수락했거나 호스트가 전환한 계정입니다. 현재 세션 참여, RSVP, 읽은 분량 제출, 질문, 한줄평, 장문 서평 작성, 본인 표시 이름 변경이 가능하며 참석한 회차의 피드백 문서를 읽을 수 있습니다. |
| 호스트 | 정식 멤버 권한에 운영 권한이 추가됩니다. 초대 생성, 둘러보기 멤버 전환, 멤버 상태와 표시 이름 관리, 세션 생성/수정, 참석 확정, 공개 기록 발행, 피드백 문서 업로드를 수행합니다. |

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
  |-- membership, role, and session authorization
  |-- feedback document parsing and access control
  |-- Flyway migrations
  v
MySQL
```

프로덕션에서 브라우저는 Spring API origin을 직접 신뢰 경계로 사용하지 않습니다. 브라우저는 같은 origin의 Cloudflare Pages Functions에 요청하고, BFF가 Spring `/api/**`로 전달하면서 `X-Readmates-Bff-Secret`을 붙입니다. 직접 API origin 예시는 문서에서 `https://api.example.com` 같은 placeholder만 사용합니다.

## 주요 기술적 의사결정

- Google OAuth와 서버 측 session cookie: 로그인 성공 후 Spring이 `readmates_session`을 발급합니다. Cookie는 `HttpOnly`, `SameSite=Lax`, production `Secure`로 설정하고, 서버는 token 원문이 아니라 hash를 `auth_sessions`에 저장합니다.
- Cloudflare Pages Functions BFF: SPA와 API 호출을 같은 origin으로 묶고, `/api/bff/**` 요청만 Spring `/api/**`로 전달합니다. OAuth 시작과 callback도 Pages Functions proxy를 거쳐 public demo origin에서 자연스럽게 동작합니다.
- BFF secret과 origin/referrer 경계: Spring은 API 요청의 `X-Readmates-Bff-Secret`을 검증합니다. `POST`, `PUT`, `PATCH`, `DELETE` 요청은 허용된 `Origin` 또는 `Referer`도 요구합니다. BFF secret은 Cloudflare Pages Functions와 Spring runtime 설정에만 두고 브라우저 bundle에 넣지 않습니다.
- 역할 기반 접근 제어: `게스트`, `둘러보기 멤버`, `정식 멤버`, `호스트` 상태에 따라 route와 API 권한을 분리합니다. 읽기 가능한 화면과 쓰기 가능한 operation을 별도로 제한합니다.
- 멤버 프로필 경계: 화면에 쓰는 짧은 표시 이름은 membership 단위의 `shortName`으로 관리합니다. 본인은 `/api/me/profile`, 호스트는 `/api/host/members/{membershipId}/profile`로 같은 클럽 멤버의 표시 이름을 정리할 수 있고, 같은 클럽 안 중복과 예약어를 서버에서 막습니다.
- 피드백 문서 접근 제어: 호스트가 Markdown 피드백 문서를 업로드하면 서버가 파싱해 typed response로 제공합니다. 호스트는 전체 문서를 관리할 수 있고, 정식 멤버는 본인이 참석한 회차의 피드백 문서만 읽을 수 있습니다. 둘러보기 멤버와 미참석자는 locked state를 봅니다.
- 공개 기록 경계: public route/API에는 공개로 발행된 세션과 공개 가능한 하이라이트/한줄평만 노출합니다. 현재 세션 참여, private notes, meeting data, feedback document 본문은 인증과 권한 검사를 통과해야 접근할 수 있습니다.
- 프론트엔드 route-first 구조: React Router route module이 loader/action, API 호출, 모델 조립, UI props assembly를 담당합니다. 실제 source root는 `front/src/app`, `front/src/pages`, `front/features`, `front/shared`이며, feature는 `api`, `model`, `route`, `ui` 책임으로 나누고 UI는 props와 callback만 받아 렌더링합니다.
- 서버 클린 아키텍처 전환: `publication`, `archive`, `feedback`, `session`, `note`, `auth`의 운영 API surface는 `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence` 경계를 따릅니다. Shared health endpoint는 `shared.adapter.in.web`에 있고, disabled password/password-reset/dev-invitation endpoint는 `410 Gone` stub으로 남습니다. Boundary test는 전환된 application package의 Spring JDBC/DAO 의존과 web adapter의 persistence 세부 의존을 막습니다.
- 공개 릴리즈 안전성: `scripts/build-public-release-candidate.sh`로 공개 릴리즈 후보를 만든 뒤 `scripts/public-release-check.sh`로 private path, local workstation path, OCI OCID, GitHub token, OpenAI/API-key-shaped token, real-looking DB/BFF/OAuth secret, Gmail 주소 등을 검사합니다.

## AI-assisted 운영 콘텐츠

ReadMates의 피드백, 하이라이트, 한줄평은 앱 외부 운영 워크플로우에서 AI로 정리된 운영 산출물입니다. ReadMates는 그 산출물을 저장, 파싱, 권한 검증, 공개하고 세션 기록과 피드백 문서로 보여줍니다.

현재 ReadMates 앱, 서버, 프론트엔드는 AI API를 직접 호출하지 않습니다. 즉, 제품 기능은 in-app AI generation이 아니라 외부에서 정리된 콘텐츠를 안전하게 운영하고 노출하는 흐름입니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | `React 19`, `React Router 7`, `TypeScript`, `Vite` |
| Frontend tests | `Vitest`, `Testing Library`, `Playwright` |
| Edge/BFF | `Cloudflare Pages Functions` |
| Backend | `Kotlin`, `Spring Boot`, `Spring Security`, `OAuth2 Client`, `JPA`, `Flyway` |
| Database | `MySQL 8` compatible database, `Testcontainers MySQL` |
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

```bash
SPRING_PROFILES_ACTIVE=dev \
SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/readmates?serverTimezone=UTC' \
READMATES_APP_BASE_URL=http://localhost:5173 \
READMATES_ALLOWED_ORIGINS=http://localhost:5173 \
READMATES_BFF_SECRET=local-dev-secret \
./server/gradlew -p server bootRun
```

```bash
READMATES_API_BASE_URL=http://localhost:8080 \
READMATES_BFF_SECRET=local-dev-secret \
pnpm --dir front dev
```

브라우저에서 `http://localhost:5173`을 엽니다. Dev profile은 sample seed data와 dev-login을 로컬 개발용으로만 제공합니다.

## 문서 링크

| 목적 | 문서 |
| --- | --- |
| 개발자 문서 허브 | [docs/development/README.md](docs/development/README.md) |
| 로컬 실행 | [docs/development/local-setup.md](docs/development/local-setup.md) |
| 아키텍처 상세 | [docs/development/architecture.md](docs/development/architecture.md) |
| 테스트 가이드 | [docs/development/test-guide.md](docs/development/test-guide.md) |
| 배포 문서 허브 | [docs/deploy/README.md](docs/deploy/README.md) |
| Cloudflare Pages | [docs/deploy/cloudflare-pages.md](docs/deploy/cloudflare-pages.md) |
| SPA fallback | [docs/deploy/cloudflare-pages-spa.md](docs/deploy/cloudflare-pages-spa.md) |
| OCI backend | [docs/deploy/oci-backend.md](docs/deploy/oci-backend.md) |
| OCI MySQL HeatWave | [docs/deploy/oci-mysql-heatwave.md](docs/deploy/oci-mysql-heatwave.md) |
| 공개 저장소 보안과 release safety | [docs/deploy/security-public-repo.md](docs/deploy/security-public-repo.md) |
| Release helper scripts | [scripts/README.md](scripts/README.md) |

README는 포트폴리오 첫 화면 역할에 집중하고, 상세 로컬 실행 절차와 테스트, 아키텍처, 배포 runbook은 위 문서로 분리합니다.
