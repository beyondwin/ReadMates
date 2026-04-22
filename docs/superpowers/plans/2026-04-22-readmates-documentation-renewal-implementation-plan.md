# ReadMates Documentation Renewal Implementation Plan

작성일: 2026-04-22
기준 설계 문서: `docs/superpowers/specs/2026-04-22-documentation-renewal-design.md`

> **For agentic workers:** Implement this plan task-by-task. This is a documentation-only renewal. Preserve unrelated dirty worktree changes, update checkboxes as work completes, and keep AI-related claims precise: ReadMates does not currently call an AI API from the app.

## Goal

Renew ReadMates documentation for a Korean portfolio audience while keeping developer documentation usable.

Primary outcomes:

1. `README.md` becomes a Korean portfolio-first entry point for recruiters and interviewers.
2. Developer setup, tests, and architecture details move into `docs/development`.
3. Existing deployment and release helper docs use consistent Korean terminology and link structure.
4. AI-assisted feedback/highlight/one-line review content is described as an external operating workflow, not an in-app AI generation feature.
5. Public release safety guidance remains visible and accurate.

## Scope Guardrails

- Do not change product code, routes, APIs, database schema, deployment scripts, or tests unless a documentation link requires no-code path correction.
- Do not add in-app AI API integration or imply that one exists.
- Do not add real operating data, private member data, screenshots with real information, secrets, local workstation paths, OCI OCIDs, database dumps, or private deployment state.
- Keep `https://readmates.pages.dev` as the approved portfolio demo URL.
- Use placeholders such as `https://api.example.com` for direct backend/API origins.
- Write explanatory prose in Korean.
- Keep commands, paths, environment variables, package names, API paths, and technology names in their original form.
- Preserve unrelated dirty worktree changes. Stage and commit only files touched by this documentation plan.

## Current Baseline To Capture Before Implementation

- [ ] Run `git status --short --branch` and record unrelated dirty files before editing.
- [ ] Read the current documentation files that will be touched:

```bash
sed -n '1,260p' README.md
sed -n '1,220p' scripts/README.md
find docs/deploy -maxdepth 1 -type f -name '*.md' -print | sort
```

- [ ] Confirm the design document still matches the intended scope:

```bash
sed -n '1,260p' docs/superpowers/specs/2026-04-22-documentation-renewal-design.md
```

If existing docs already contain Korean sections, preserve correct content and only reorganize or tighten it.

---

## Task 1 - Rewrite README As A Korean Portfolio Entry Point

**Files:**

- Modify: `README.md`

Checklist:

- [ ] Replace the English-first README with a Korean-first portfolio structure.
- [ ] Keep a clear first-screen summary:
  - one-line product description
  - public demo URL
  - stack summary
  - project scope
  - high-signal highlights
- [ ] Explain the problem ReadMates solves for a small recurring reading club.
- [ ] Present the product as a full-stack service, not a generic CRUD app.
- [ ] Keep the feature overview role-based:
  - 게스트
  - 둘러보기 멤버
  - 정식 멤버
  - 호스트
- [ ] Summarize the architecture without overwhelming the first screen.
- [ ] Include the key engineering decisions:
  - Google OAuth and server-side session cookie
  - Cloudflare Pages Functions BFF
  - BFF secret and origin/referrer trust boundary
  - role-based access control
  - session feedback document access control
  - public release candidate and secret/path scan flow
- [ ] Add the approved AI-assisted content wording:
  - AI creates feedback, highlights, and one-line review material outside the app workflow.
  - ReadMates stores, parses, authorizes, and publishes the generated operating content.
  - The app does not currently call an AI API.
- [ ] Keep local setup in README short and link to `docs/development/local-setup.md`.
- [ ] Link to developer, architecture, test, deploy, and release safety docs.
- [ ] Remove duplicated long deployment instructions from README when they are covered by linked docs.
- [ ] Keep all commands and env var names accurate.

Expected result: recruiters and interviewers can understand the product, technical scope, and portfolio value from README without reading the full developer docs.

---

## Task 2 - Add Korean Developer Documentation Hub

**Files:**

- Create: `docs/development/README.md`
- Create: `docs/development/local-setup.md`
- Create: `docs/development/test-guide.md`
- Create: `docs/development/architecture.md`

Checklist:

- [ ] Create `docs/development/README.md` as a short hub linking to local setup, test guide, architecture, deployment docs, and scripts docs.
- [ ] Move detailed local setup from README into `docs/development/local-setup.md`.
- [ ] Include prerequisites:
  - JDK 21
  - Node.js
  - pnpm
  - Docker Compose or MySQL 8 compatible database
- [ ] Document backend dev startup with the existing environment variables.
- [ ] Document frontend dev startup with the existing environment variables.
- [ ] Explain dev-login only as a local/dev fixture flow.
- [ ] Create `docs/development/test-guide.md` with:
  - frontend lint/unit/build commands
  - Playwright E2E command
  - backend Gradle test command
  - Testcontainers/MySQL note
  - public release candidate/check commands
- [ ] Create `docs/development/architecture.md` with:
  - product surfaces: public site, member app, host app
  - request flow: browser -> Cloudflare Pages Functions BFF -> Spring API -> MySQL
  - auth/session posture
  - membership and role model
  - public/private record boundary
  - feedback document upload/parse/read flow
  - AI-assisted content operating workflow
- [ ] Keep diagrams text-based unless a simple Mermaid diagram clearly improves readability.
- [ ] Avoid duplicating full deployment runbooks in development docs; link to `docs/deploy`.

Expected result: README stays concise while developers can still run, test, and understand the project from Korean docs.

---

## Task 3 - Align Existing Deployment Docs With The Korean Documentation System

**Files:**

- Modify: `docs/deploy/README.md`
- Modify: `docs/deploy/cloudflare-pages.md`
- Modify: `docs/deploy/cloudflare-pages-spa.md`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/deploy/oci-mysql-heatwave.md`
- Modify: `docs/deploy/security-public-repo.md`

Checklist:

- [ ] Keep existing public-safe deployment guidance intact.
- [ ] Normalize terminology to the approved Korean terms:
  - 게스트
  - 둘러보기 멤버
  - 정식 멤버
  - 호스트
  - 현재 세션
  - 공개 기록
  - 피드백 문서
  - 공개 릴리즈 후보
- [ ] Keep `Cloudflare Pages`, `Pages Functions`, `Spring Boot`, `OCI`, `MySQL HeatWave`, `Flyway`, `Caddy`, and env var names in English.
- [ ] Ensure direct API origins use placeholders such as `https://api.example.com`.
- [ ] Ensure the approved frontend/demo URL remains `https://readmates.pages.dev`.
- [ ] Ensure production secrets are consistently described as outside Git.
- [ ] Ensure deployment docs do not imply that backend production deployment via GitHub Actions is already configured.
- [ ] Make `docs/deploy/README.md` the deployment hub and link back to `docs/development/README.md` and root `README.md`.
- [ ] Keep public repository security guidance aligned with the actual release helper scripts.

Expected result: deployment docs read as one Korean documentation set without weakening the existing public safety guidance.

---

## Task 4 - Koreanize Release Helper Documentation

**Files:**

- Modify: `scripts/README.md`

Checklist:

- [ ] Rewrite the script documentation in Korean.
- [ ] Preserve exact script names and commands:
  - `build-public-release-candidate.sh`
  - `public-release-check.sh`
  - `verify-public-release-fixtures.sh`
- [ ] Explain that scripts do not publish to GitHub, change repository visibility, rotate secrets, or create commits.
- [ ] Document the approved public release candidate manifest at a high level.
- [ ] Document what the checker blocks:
  - private keys
  - OCI OCIDs
  - GitHub tokens
  - OpenAI/API-key-shaped tokens
  - real-looking DB/BFF/OAuth secrets
  - Gmail addresses
  - private club domains
  - local workstation paths
  - forbidden private/generated paths
- [ ] Keep the warning that fallback checks are guardrails, not a complete professional secret scan.
- [ ] Link from `scripts/README.md` to `docs/deploy/security-public-repo.md`.

Expected result: release safety scripts remain understandable for public reviewers and future maintainers.

---

## Task 5 - Cross-Link, Terminology Pass, And Public-Safety Scan

**Files:**

- Modify only documentation files touched by Tasks 1-4 if inconsistencies are found.

Checklist:

- [ ] Run a terminology pass across touched docs.
- [ ] Ensure README links resolve to existing files.
- [ ] Ensure no English-first section remains where Korean prose is expected.
- [ ] Ensure all AI claims use the external-workflow wording and do not say the app auto-generates AI content.
- [ ] Ensure all local setup/test/deploy commands are fenced and copyable.
- [ ] Run markdown/path sanity checks:

```bash
rg -n "TBD|TODO|FIXME|자동 생성|AI API를 호출|OpenAI|ChatGPT|/Users/kws|10\\.0\\.2\\.|readmates\\.kr|oci1\\.|ghp_|sk-[A-Za-z0-9]" README.md docs/development docs/deploy scripts/README.md || true
rg -n "\\]\\(([^)#]+\\.md)" README.md docs/development docs/deploy scripts/README.md
git diff --check -- README.md docs/development docs/deploy scripts/README.md
```

- [ ] If `OpenAI` or `ChatGPT` appears only in release scanner pattern descriptions or precise external workflow explanation, verify the wording is not implying in-app integration.
- [ ] Run the public release checker against the current tree:

```bash
./scripts/public-release-check.sh
```

If the checker fails because of unrelated dirty files outside this documentation plan, record the failure and do not fix unrelated work in this plan.

Expected result: touched docs are internally consistent, links are usable, and public-safety language remains accurate.

---

## Task 6 - Final Review And Commit

**Files:**

- Stage only files touched by this documentation renewal plan.

Checklist:

- [ ] Review the final diff with `git diff -- README.md docs/development docs/deploy scripts/README.md`.
- [ ] Confirm no unrelated frontend code, tests, generated assets, env files, or ignored private files are staged.
- [ ] Run final verification:

```bash
git diff --check -- README.md docs/development docs/deploy scripts/README.md
./scripts/public-release-check.sh
```

- [ ] If practical and not blocked by unrelated local state, build a public candidate and check it:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

- [ ] Commit the documentation renewal with a focused message such as:

```bash
git commit -m "Renew Korean portfolio documentation"
```

- [ ] In the final response, summarize:
  - documents changed
  - verification commands actually run
  - any remaining risks or skipped checks

Expected result: documentation renewal lands as a focused docs-only commit.
