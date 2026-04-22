# ReadMates

ReadMates is an invite-only reading club web app. It combines a public site, member session preparation, host operations, and post-session feedback documents in one full-stack product.

Public demo: [https://readmates.pages.dev](https://readmates.pages.dev)

This repository is prepared for public review. It documents the product, architecture, trust boundaries, local setup, test commands, and deployment model without private operational state.

## Product

ReadMates is built for a small recurring book club.

- Public visitors can read the club introduction, published sessions, and public records.
- Viewer members can sign in with Google without an invitation and browse private session records and current-session status in read-only mode.
- Full members can accept an invitation link or be activated by a host, then RSVP for the current session, submit reading progress, questions, short reviews, and long reviews.
- Hosts can create invitations, activate viewer members, manage member status, create and edit sessions, confirm attendance, publish session records, and upload feedback documents.
- Members who attended a session can read its feedback document. Viewers and non-attendees see a locked state.

The current app supports one club and one open current session at a time. Password login and password-reset endpoints are intentionally retired and return `410 Gone`; Google OAuth and local dev-login are the active login paths.

No screenshots are included in this public README. The demo and local seed data use sample records only.

## Stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, React Router 7, TypeScript, Vite |
| Frontend tests | Vitest, Testing Library, Playwright |
| Edge/BFF | Cloudflare Pages Functions |
| Backend | Kotlin, Spring Boot, Spring Security, OAuth2 Client, JPA, Flyway |
| Database | MySQL 8 compatible database, Testcontainers MySQL |
| Deployment | Cloudflare Pages, OCI Compute, OCI MySQL HeatWave, systemd, Caddy |

## Repository Map

| Path | Purpose |
| --- | --- |
| `front/` | Vite React SPA, Cloudflare Pages Functions, frontend tests |
| `front/src/app` | Router, layouts, auth state, route guards |
| `front/features` | Domain UI and actions for public, member, host, archive, notes, feedback |
| `front/shared` | API types/client, shared UI, styles, security helpers |
| `front/functions` | Cloudflare Pages BFF and OAuth proxy functions |
| `server/` | Spring Boot API |
| `server/src/main/kotlin/com/readmates/auth` | Google login, invitations, membership lifecycle, session cookies |
| `server/src/main/kotlin/com/readmates/session` | Current sessions, host session operations, RSVP, attendance, publication |
| `server/src/main/kotlin/com/readmates/archive` | Archive, member history, notes feed |
| `server/src/main/kotlin/com/readmates/feedback` | Feedback document upload, parsing, rendering |
| `server/src/main/kotlin/com/readmates/publication` | Public homepage and published session APIs |
| `server/src/main/resources/db/mysql` | MySQL Flyway migrations and dev seed data |
| `docs/deploy` | Public deployment and release-safety runbooks |
| `deploy/oci` | Placeholder-based OCI VM setup and deployment scripts |

## Architecture

```text
Browser
  |
  | same-origin app and /api/bff/** requests
  v
Cloudflare Pages
  |-- Vite SPA from front/dist
  |-- Pages Functions from front/functions
        |-- /api/bff/** -> Spring /api/**
        |-- /oauth2/authorization/** -> Spring OAuth start
        |-- /login/oauth2/code/** -> Spring OAuth callback
  |
  | X-Readmates-Bff-Secret + forwarded cookies
  v
Spring Boot API
  |-- Spring Security
  |-- HttpOnly readmates_session cookie
  |-- membership, role, and session rules
  |-- Flyway migrations
  v
MySQL
```

The browser does not call the Spring API directly in production. It calls same-origin Cloudflare Pages Functions under `/api/bff/**`; the BFF forwards to Spring `/api/**` and adds `X-Readmates-Bff-Secret`. Spring validates that header on API requests, so the direct API origin is not the trusted browser-facing boundary.

Mutation requests also require an allowed origin or referer. The BFF secret is stored only in Cloudflare Pages Functions and Spring runtime configuration. It is never put in the browser bundle.

## Auth And Trust Boundaries

ReadMates uses Google OAuth for user authentication. The OAuth callback flows through Cloudflare Pages Functions to Spring, and Spring issues a `readmates_session` cookie after a successful login.

Session-cookie posture:

- `HttpOnly`: JavaScript cannot read the session token.
- `SameSite=Lax`: normal top-level navigation works while reducing cross-site request risk.
- `Secure` in production: production sets `READMATES_AUTH_SESSION_COOKIE_SECURE=true` so cookies are sent only over HTTPS.
- Session tokens are stored server-side as hashes in `auth_sessions`.

Membership is invite-only for participation, with browse-only access for uninvited Google users:

- Guests can read only public home, club introduction, published sessions, and public records.
- A Google user without an accepted invitation becomes a `VIEWER` member. Viewers can browse private session records and current-session status, but cannot RSVP, check in, submit questions or reviews, read feedback documents, or use host tools.
- Invitation-link acceptance creates an `ACTIVE` full member immediately.
- A host can activate a viewer into a full member, manage member status, and manage current-session participants.
- `host` routes and APIs require an active host role.
- Member write APIs require an `ACTIVE` full member who is eligible for the current session.

## 멤버십 접근 단계

- 게스트: 로그인 없이 공개 홈, 공개 소개, 공개 기록만 볼 수 있습니다.
- 둘러보기 멤버: 초대 없이 Google로 로그인한 계정입니다. 전체 비공개 세션 기록과 이번 세션 현황은 읽을 수 있지만, RSVP, 체크인, 질문, 서평 작성과 피드백 문서 열람은 제한됩니다.
- 정식 멤버: 초대 링크를 수락했거나 호스트가 둘러보기 멤버를 전환한 계정입니다. 현재 세션 참여와 작성 기능을 사용할 수 있고, 참석한 회차의 피드백 문서를 읽을 수 있습니다.
- 호스트: 정식 멤버 권한에 운영 권한이 추가된 계정입니다. 세션, 초대, 멤버 상태, 출석, 공개 기록, 피드백 문서를 관리합니다.

Public APIs expose only published sessions that have explicitly been marked public. Member-only operational details such as current-session participation, feedback access, meeting data, and private notes stay behind authentication and authorization checks.

## Main Routes

Public:

- `/`
- `/about`
- `/records`
- `/sessions/:sessionId`
- `/login`
- `/invite/:token`

Member app:

- `/app`
- `/app/pending`
- `/app/session/current`
- `/app/notes`
- `/app/archive`
- `/app/me`
- `/app/sessions/:sessionId`
- `/app/feedback/:sessionId`
- `/app/feedback/:sessionId/print`

Host app:

- `/app/host`
- `/app/host/members`
- `/app/host/invitations`
- `/app/host/sessions/new`
- `/app/host/sessions/:sessionId/edit`

## Local Setup

Prerequisites:

- JDK 21
- Node.js
- pnpm
- Docker Compose or a MySQL 8 compatible database

Install frontend dependencies:

```bash
pnpm --dir front install --frozen-lockfile
```

Start MySQL with Docker Compose:

```bash
docker compose up -d mysql
```

Run the backend with the dev profile. The dev profile applies MySQL migrations and loads sample seed data.

```bash
SPRING_PROFILES_ACTIVE=dev \
SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/readmates?serverTimezone=UTC' \
READMATES_APP_BASE_URL=http://localhost:5173 \
READMATES_ALLOWED_ORIGINS=http://localhost:5173 \
READMATES_BFF_SECRET=local-dev-secret \
./server/gradlew -p server bootRun
```

Run the frontend in another terminal:

```bash
READMATES_API_BASE_URL=http://localhost:8080 \
READMATES_BFF_SECRET=local-dev-secret \
pnpm --dir front dev
```

Open `http://localhost:5173`.

Local dev mode shows dev-login buttons on the login page. Seed accounts use reserved sample addresses such as `host@example.com` and `member1@example.com`.

## Test Commands

Core checks:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
```

End-to-end checks:

```bash
pnpm --dir front test:e2e
```

The E2E setup starts the app against a local `readmates_e2e` database, uses the test BFF secret `e2e-secret`, launches the Vite app, and runs Playwright Chromium tests against fixture login flows.

Backend tests use Testcontainers for MySQL where needed.

## Deployment Overview

The production-oriented deployment model is:

- Cloudflare Pages serves the Vite SPA from `front/dist`.
- Cloudflare Pages Functions in `front/functions` provide the BFF and OAuth proxy.
- Spring Boot runs as a JAR on an OCI Compute VM behind Caddy.
- MySQL data lives in an OCI MySQL HeatWave compatible database.
- Spring applies Flyway migrations on startup.
- Production secrets are managed outside Git in Cloudflare, the server runtime environment, Google Cloud, OCI, or ignored operator files.

Public demo origin:

- `https://readmates.pages.dev`

Placeholder direct API origin used in docs and examples:

- `https://api.example.com`

Important production environment variables:

- Cloudflare Pages Functions: `READMATES_API_BASE_URL`, `READMATES_BFF_SECRET`
- Spring app: `READMATES_APP_BASE_URL`, `READMATES_ALLOWED_ORIGINS`, `READMATES_BFF_SECRET`, `READMATES_BFF_SECRET_REQUIRED=true`, `READMATES_AUTH_SESSION_COOKIE_SECURE=true`
- Spring OAuth: `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID`, `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET`
- Spring DB: `SPRING_PROFILES_ACTIVE=prod`, `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`

Deployment runbooks:

- [docs/deploy/README.md](docs/deploy/README.md)
- [docs/deploy/cloudflare-pages.md](docs/deploy/cloudflare-pages.md)
- [docs/deploy/oci-backend.md](docs/deploy/oci-backend.md)
- [docs/deploy/oci-mysql-heatwave.md](docs/deploy/oci-mysql-heatwave.md)
- [docs/deploy/security-public-repo.md](docs/deploy/security-public-repo.md)

## Public Release Safety

Before publishing, build a clean public release candidate and run the release checks:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

The release candidate intentionally excludes private planning docs, local env files, provider state, generated design artifacts, build output, database dumps, screenshots, and other local-only material.

If `gitleaks` is installed, the release checker runs `gitleaks dir`. Without it, the script runs fallback path and content checks that block obvious mistakes but are not a complete professional secret scan.

Do not commit real OCI OCIDs, API keys, SSH keys, database dumps, BFF secrets, Google OAuth secrets, private member data, or production exports.
