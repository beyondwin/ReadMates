# ReadMates Engineering Proof Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ReadMates into a reviewable engineering proof portfolio by connecting README, guest-mode showcase, architecture evidence, quality gates, operational proof, and selected frontend/server confidence work.

**Architecture:** Keep documentation entrypoints separate from current source-of-truth docs. Add `docs/showcase/` as a reviewer-facing layer that links to `README.md`, `docs/development/architecture.md`, case studies, scripts, runbooks, and tests without replacing them. Keep code work scoped to existing frontend route-first and server clean-architecture boundaries.

**Tech Stack:** Markdown documentation, React 19/Vite/TanStack Query v5 for frontend confidence work, Kotlin/Spring Boot/MySQL/Flyway for server confidence work, existing shell release-safety scripts.

---

## Source Spec

Design spec: `docs/superpowers/specs/2026-05-17-readmates-engineering-proof-portfolio-design.md`

## Scope Check

This is a quarter-level master plan with multiple independent tracks. Execute it as separate PRs in the task order below. Each task has its own changed files and validation command. Do not combine documentation showcase work, frontend Query migration, and server boundary work in one PR.

The first execution pass should complete Tasks 1-6. Tasks 7-10 are code-confidence follow-ups that can run after the reviewer-facing documentation exists. Task 11 is the release-readiness closeout for the whole initiative.

## Public Safety Rules

Every task follows the same public-repository constraints:

- Do not add real member data, private domains, deployment state, local absolute paths, OCIDs, secrets, API keys, token-shaped examples, DB dumps, or raw logs.
- Use repo-relative paths in docs.
- Use placeholders such as `https://api.example.com`, `<club-slug>`, and `host@example.com`.
- Treat `docs/development/architecture.md`, code, tests, scripts, and runbooks as current source of truth. Treat `docs/superpowers/` as historical planning context unless the task is explicitly editing this plan or the source spec.

## File Structure

Create:

- `docs/showcase/README.md` — reviewer-facing index for the engineering proof portfolio.
- `docs/showcase/guest-mode-walkthrough.md` — login-free guest-mode review path and private-workflow evidence links.
- `docs/showcase/architecture-evidence.md` — one-page architecture/evidence map for external readers.
- `docs/showcase/engineering-confidence.md` — tests, quality gates, frontend/server boundary evidence, and improvement status.
- `docs/showcase/operational-proof.md` — release, deploy, observability, post-deploy watch, and postmortem evidence flow.
- `front/features/host/queries/host-members-queries.ts` — TanStack Query helpers for host members, mirroring `host-invitation-queries.ts`.

Modify:

- `README.md` — add a compact "How to review this project" entry path and link to showcase docs.
- `docs/README.md` — include `docs/showcase/` as reviewer-facing documentation.
- `docs/development/server-state-migration.md` — update host-members migration status when Task 7 lands.
- `docs/development/technical-decisions.md` — add transaction boundary decision note in Task 9.
- `front/src/app/routes/host.tsx` — pass `QueryClient` into the host members loader factory.
- `front/features/host/route/host-members-data.ts` — seed host-members query data and expose response parsers/actions for UI.
- `front/features/host/route/host-members-route.tsx` — keep route as UI composition only.
- `front/features/host/ui/host-members.tsx` — read list state through TanStack Query while preserving prop-driven actions.
- `front/tests/unit/host-members.test.tsx` — pin loader handoff, invalidation, and pagination behavior.
- `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt` — first transaction-boundary cleanup after Task 9 policy is documented.

Do not modify:

- `docs/private/**`
- real deploy state files
- `.env*` except existing placeholder-only `.env.example` if a future task explicitly requires it

---

## Task 1: Create Showcase Index

**Files:**

- Create: `docs/showcase/README.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Read documentation source-of-truth guidance**

Run:

```bash
sed -n '1,240p' docs/agents/docs.md
sed -n '1,220p' docs/README.md
```

Expected: `docs/agents/docs.md` states that `README.md` is an entry point and `docs/development/architecture.md` is source of truth for technical boundaries.

- [ ] **Step 2: Create the showcase directory index**

Create `docs/showcase/README.md` with this exact structure:

```markdown
# ReadMates Showcase

이 디렉터리는 ReadMates를 처음 보는 리뷰어가 제품, 아키텍처, 운영 증거, 유지보수 품질을 빠르게 따라갈 수 있도록 만든 reviewer-facing guide입니다.

현재 동작의 source of truth는 코드, 테스트, scripts, migrations, `docs/development/architecture.md`입니다. Showcase 문서는 그 자료를 대체하지 않고 읽는 순서를 제공합니다.

## 추천 리뷰 순서

1. `README.md`에서 제품 문제와 역할 모델을 확인합니다.
2. `docs/showcase/guest-mode-walkthrough.md`에서 로그인 없이 볼 수 있는 공개 제품 표면을 따라갑니다.
3. `docs/showcase/architecture-evidence.md`에서 BFF, Spring API, MySQL, Redis/Kafka, AI generation, release safety가 어떻게 연결되는지 봅니다.
4. `docs/showcase/engineering-confidence.md`에서 테스트와 경계 검증이 어떤 회귀를 막는지 확인합니다.
5. `docs/showcase/operational-proof.md`에서 release, deploy, observability, postmortem 흐름을 확인합니다.

## 문서별 역할

| 문서 | 답하는 질문 |
| --- | --- |
| `guest-mode-walkthrough.md` | 로그인 없이 무엇을 볼 수 있고, private workflow는 어떤 evidence로 확인하는가? |
| `architecture-evidence.md` | 이 프로젝트가 단순 CRUD가 아니라 운영형 제품인 근거는 무엇인가? |
| `engineering-confidence.md` | 코드베이스가 커져도 무너지지 않게 하는 경계와 검증은 무엇인가? |
| `operational-proof.md` | 배포, 공개 릴리즈 안전, 장애 대응은 어떤 흐름으로 관리되는가? |

## 공개 안전 기준

Showcase 문서는 실제 멤버 데이터, private domain, 운영 secret, deployment state, OCID, token-shaped example, local absolute path를 포함하지 않습니다. Private workflow는 접근 권한을 넓히지 않고 sanitized 설명, fixture, 테스트, runbook으로 설명합니다.
```

- [ ] **Step 3: Link the showcase index from docs hub**

Modify `docs/README.md` by adding this bullet near the documentation index:

```markdown
- [Showcase](showcase/README.md): 처음 보는 리뷰어를 위한 guest-mode walkthrough, architecture evidence, engineering confidence, operational proof 진입점입니다.
```

Keep the Korean-first documentation tone and do not remove existing links.

- [ ] **Step 4: Validate docs formatting**

Run:

```bash
git diff --check -- docs/showcase/README.md docs/README.md
```

Expected: no output.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/showcase/README.md docs/README.md
git commit -m "docs: add showcase index"
```

Expected: one commit containing only the showcase index and docs hub link.

---

## Task 2: Add README Review Entry Path

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Inspect current README entry flow**

Run:

```bash
sed -n '1,180p' README.md
```

Expected: README begins with product summary, stack, engineering highlights, and role/function overview.

- [ ] **Step 2: Add a compact review path after the opening summary**

Insert this section after the opening bullet list and before `## Engineering Highlights`:

```markdown
## How to Review This Project

처음 보는 리뷰어라면 아래 순서가 가장 빠릅니다.

1. **제품 표면 확인** — 게스트로 공개 클럽 소개, 공개 기록, 공개 세션 상세를 확인합니다. 시작점은 [Guest-mode walkthrough](docs/showcase/guest-mode-walkthrough.md)입니다.
2. **아키텍처 판단** — Cloudflare Pages Functions BFF, Spring API, MySQL/Flyway, Redis/Kafka, AI generation, release safety가 어떻게 연결되는지 [Architecture evidence](docs/showcase/architecture-evidence.md)에서 봅니다.
3. **유지보수 품질 확인** — frontend boundary, server ArchUnit, query budget, public release scan 같은 검증은 [Engineering confidence](docs/showcase/engineering-confidence.md)에 정리합니다.
4. **운영 증거 확인** — release readiness, deploy runbook, post-deploy watch, postmortem 흐름은 [Operational proof](docs/showcase/operational-proof.md)에서 봅니다.

Showcase 문서는 현재 동작의 source of truth가 아니라 읽는 순서입니다. 실제 경계와 동작은 코드, 테스트, scripts, migrations, [아키텍처 문서](docs/development/architecture.md)를 우선합니다.
```

- [ ] **Step 3: Add a short guest-mode pointer near the role table**

Before `## 역할별 기능`, add:

```markdown
리뷰어가 로그인 없이 확인할 수 있는 공개 표면은 guest-mode walkthrough에 따로 묶었습니다. 공개 접근은 클럽 소개, 공개 기록, 공개 세션 상세로 제한되며 멤버, 호스트, platform admin, AI 생성, 알림 운영 흐름은 권한을 열지 않고 sanitized evidence로 설명합니다.
```

- [ ] **Step 4: Validate README diff**

Run:

```bash
git diff --check -- README.md
rg -n "How to Review This Project|guest-mode walkthrough|private domain|OCID|token-shaped|local absolute path" README.md
```

Expected: `git diff --check` has no output. `rg` finds the new review section and does not reveal local absolute paths or private values.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md
git commit -m "docs: add reviewer entry path"
```

Expected: one README-only commit.

---

## Task 3: Write Guest-Mode Walkthrough

**Files:**

- Create: `docs/showcase/guest-mode-walkthrough.md`

- [ ] **Step 1: Verify current public route names**

Run:

```bash
sed -n '1,180p' docs/development/architecture.md
sed -n '1,180p' front/src/app/routes/public.tsx
```

Expected: architecture lists public routes for `/clubs/:slug`, `/clubs/:slug/about`, `/clubs/:slug/records`, and `/clubs/:slug/sessions/:sessionId`.

- [ ] **Step 2: Create walkthrough document**

Create `docs/showcase/guest-mode-walkthrough.md`:

```markdown
# Guest-Mode Walkthrough

이 문서는 ReadMates를 처음 보는 리뷰어가 로그인 없이 확인할 수 있는 공개 제품 표면과, 로그인 없이 볼 수 없는 private workflow를 어떤 evidence로 확인할지 정리합니다.

현재 동작의 source of truth는 public route code와 `docs/development/architecture.md`입니다.

## 로그인 없이 볼 수 있는 것

Guest는 클럽이 `ACTIVE`이고 `PUBLIC`인 경우 아래 표면을 볼 수 있습니다.

| 표면 | 경로 | 확인할 수 있는 것 |
| --- | --- | --- |
| 클럽 소개 | `/clubs/<club-slug>` 또는 `/clubs/<club-slug>/about` | 클럽의 공개 소개와 공개 진입 경험 |
| 공개 기록 | `/clubs/<club-slug>/records` | 공개된 회차 목록과 archive 흐름 |
| 공개 세션 상세 | `/clubs/<club-slug>/sessions/<session-id>` | 공개 요약, 하이라이트, 한줄평 등 공개 범위에 포함된 기록 |

운영 fallback 경로는 `https://readmates.pages.dev/clubs/<club-slug>` 형태입니다. 등록된 custom domain은 운영 설정에 따라 달라지므로 이 문서에서는 placeholder만 사용합니다.

## 추천 관람 순서

1. 클럽 소개에서 제품의 공개 첫인상을 확인합니다.
2. 공개 기록 목록에서 회차가 누적되는 방식을 확인합니다.
3. 공개 세션 상세에서 모임 후 기록이 어떻게 읽히는지 확인합니다.
4. README의 Engineering Highlights로 돌아가 공개 화면 뒤의 BFF, publication visibility, notification, AI generation 근거를 확인합니다.

## 로그인 없이 볼 수 없는 것

아래 흐름은 제품 권한상 guest에게 공개하지 않습니다.

| Private workflow | 공개하지 않는 이유 | 확인 evidence |
| --- | --- | --- |
| 멤버 현재 세션 참여, RSVP, 질문, 서평 작성 | 정식 멤버 권한과 club membership이 필요합니다. | `docs/development/architecture.md`, frontend route guard tests |
| 호스트 세션 생성/수정, 출석 확정, 기록 발행 | 클럽 host 권한이 필요합니다. | host route tests, session server tests, case studies |
| Platform admin onboarding/domain/support access | platform admin 권한이 필요합니다. | platform admin plan/spec, server authorization tests |
| In-app AI 세션 생성 | host 권한, feature flag, provider key, cost/PII guard가 필요합니다. | `docs/case-studies/04-pii-safe-ai-session-generation.md`, AI runbook, `scripts/aigen-pii-check.sh` |
| 수동 알림 발송 | host 권한과 notification outbox pipeline이 필요합니다. | `docs/case-studies/02-notification-pipeline-with-outbox.md`, notification tests |

## Public-Safety Notes

- 이 walkthrough는 guest 권한을 넓히지 않습니다.
- 실제 멤버 데이터, private domain, 운영 secret, provider key, deployment state는 사용하지 않습니다.
- Screenshot을 추가할 때는 synthetic 또는 sanitized fixture만 사용합니다.
- Private workflow를 보여줄 필요가 있으면 접근 권한을 열지 않고 테스트, runbook, sanitized 설명으로 연결합니다.
```

- [ ] **Step 3: Validate public-safety wording**

Run:

```bash
git diff --check -- docs/showcase/guest-mode-walkthrough.md
rg -n "local absolute path|OCID|private key|token-shaped|private domain|real member" docs/showcase/guest-mode-walkthrough.md
```

Expected: `git diff --check` has no output. `rg` returns no active secret, local path, or private deployment value.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/showcase/guest-mode-walkthrough.md
git commit -m "docs: add guest mode walkthrough"
```

Expected: one commit containing the walkthrough.

---

## Task 4: Write Architecture Evidence Map

**Files:**

- Create: `docs/showcase/architecture-evidence.md`

- [ ] **Step 1: Inspect architecture and case study anchors**

Run:

```bash
sed -n '1,220p' docs/development/architecture.md
sed -n '1,200p' docs/case-studies/README.md
```

Expected: architecture describes product surfaces, BFF request flow, frontend route-first boundary, API error contract, multi-club context, server package boundaries, auth/session, BFF security, Redis, and public cache.

- [ ] **Step 2: Create architecture evidence document**

Create `docs/showcase/architecture-evidence.md`:

```markdown
# Architecture Evidence

이 문서는 ReadMates가 단순 CRUD 앱이 아니라 운영형 멀티클럽 제품인 이유를 한 장으로 보여줍니다. 상세 source of truth는 `docs/development/architecture.md`입니다.

## One-Page Map

```text
Browser
  -> Cloudflare Pages SPA
  -> Pages Functions BFF (/api/bff/**, OAuth proxy)
  -> Spring Boot API
  -> MySQL/Flyway source of truth
  -> optional Redis cache/rate-limit/job state
  -> optional Kafka/Redpanda notification and AI job pipeline
  -> SMTP/in-app notification side effects
```

## Evidence Table

| Product/engineering claim | Why it matters | Evidence |
| --- | --- | --- |
| Browser traffic goes through a same-origin BFF | Keeps browser-facing security policy, trusted headers, OAuth proxying, and cookie handling at the edge boundary. | `docs/development/adr/0001-cloudflare-pages-functions-bff.md`, `docs/case-studies/01-bff-security-and-secret-rotation.md` |
| Club context is scoped by slug or registered host | Multi-club operation needs role, cache, public URL, and OAuth return behavior to stay club-aware. | `docs/case-studies/03-multi-club-domain-platform.md`, `docs/deploy/multi-club-domains.md` |
| Server feature slices follow clean architecture | Controllers parse HTTP; application services own authorization/orchestration; persistence stays behind ports/adapters. | `docs/development/architecture.md`, `ServerArchitectureBoundaryTest` |
| Notifications use transactional outbox | Mutations do not block on SMTP/in-app delivery; retry and audit state are explicit. | `docs/case-studies/02-notification-pipeline-with-outbox.md` |
| AI generation is feature-gated and audited | Transcript handling, provider calls, cost guard, kill switch, and PII policy are operational boundaries. | `docs/case-studies/04-pii-safe-ai-session-generation.md`, `docs/operations/runbooks/ai-session-generation.md`, `scripts/aigen-pii-check.sh` |
| Public release safety is scripted | Public candidates are built and scanned before release assumptions are made. | `scripts/README.md`, `docs/deploy/security-public-repo.md` |

## Request Flow

1. Browser requests same-origin SPA or `/api/bff/**`.
2. Pages Functions strips untrusted internal headers and adds trusted BFF headers.
3. Spring validates BFF secret, session cookie, membership, role, visibility, and attendance rules.
4. MySQL/Flyway remains source of truth.
5. Redis and Kafka are optional supporting layers, never the durable source of private transcript or membership truth.

## What This Document Does Not Replace

- API and role details: `docs/development/architecture.md`
- Local setup and checks: `docs/development/README.md`
- Release safety details: `scripts/README.md`
- Deployment runbooks: `docs/deploy/README.md`
```

- [ ] **Step 3: Validate diagram fence and docs formatting**

Run:

```bash
git diff --check -- docs/showcase/architecture-evidence.md
rg -n "```text|```" docs/showcase/architecture-evidence.md
```

Expected: `git diff --check` has no output and code fences are balanced.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/showcase/architecture-evidence.md
git commit -m "docs: add architecture evidence map"
```

Expected: one commit containing only the architecture evidence doc.

---

## Task 5: Write Engineering Confidence Guide

**Files:**

- Create: `docs/showcase/engineering-confidence.md`
- Modify: `docs/development/server-state-migration.md`

- [ ] **Step 1: Inspect existing quality and migration docs**

Run:

```bash
sed -n '1,220p' docs/development/server-state-migration.md
sed -n '1,220p' docs/development/test-guide.md
rg -n "frontend-boundaries|ServerArchitectureBoundaryTest|MySqlFlywayMigrationTest|ServerQueryBudgetTest" front server docs
```

Expected: server-state migration lists `host/invitations` as complete and `host/members` as the next candidate.

- [ ] **Step 2: Create engineering confidence document**

Create `docs/showcase/engineering-confidence.md`:

```markdown
# Engineering Confidence

이 문서는 ReadMates가 커진 뒤에도 변경 가능한 코드베이스로 남기 위해 사용하는 경계, 테스트, 품질 게이트를 정리합니다.

## Boundary Evidence

| Boundary | Guardrail | What it prevents |
| --- | --- | --- |
| Frontend route-first architecture | `front/tests/unit/frontend-boundaries.test.ts` | shared가 app/page/feature를 거꾸로 import하거나 feature UI가 route/API를 직접 잡는 회귀 |
| Server clean architecture | `ServerArchitectureBoundaryTest` | web adapter가 persistence/JDBC를 직접 잡거나 application package가 Spring Web/adapter에 의존하는 회귀 |
| CQRS read/write convention | `@ReadOnlyApplicationService` + ArchUnit rules | read-only service가 mutation port나 write transaction을 갖는 회귀 |
| Flyway migration compatibility | `MySqlFlywayMigrationTest` | MySQL-specific migration, collation, FK compatibility 회귀 |
| Query budget | `ServerQueryBudgetTest` | 주요 화면의 accidental N+1 query 회귀 |
| Public release safety | `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh` | public candidate에 private state, local path, secret-shaped data가 포함되는 회귀 |

## Frontend Server-State Migration

Current source: `docs/development/server-state-migration.md`

Completed:

- `host/invitations` — list query, create/revoke mutation, loader handoff

Next candidates:

1. `host/members`
2. `host/notifications`
3. `host/sessions`

Migration rule: route modules own loader/action coordination, UI components stay prop/callback driven, and new Query helpers live under `front/features/<feature>/queries/`.

## Server Boundary Follow-Ups

The session package already has separate draft, lifecycle, attendance, publication, and query services. The next useful server confidence work is transaction boundary documentation and a narrow cleanup of adapter-level transaction annotations where application services already own the transaction.

## Validation Commands

Frontend:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Server:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server architectureTest
./server/gradlew -p server check
```

Public release:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```
```

- [ ] **Step 3: Update server-state migration status**

Modify `docs/development/server-state-migration.md` to add an "이번 분기 계획" section:

```markdown
## 이번 분기 계획

Engineering proof portfolio 분기에서는 다음 순서로 server state migration을 진행합니다.

1. `host/members` — 멤버 목록과 lifecycle/profile/viewer mutation을 Query invalidation 패턴으로 정리합니다.
2. `host/notifications` — 수동 알림 options/preview/confirm/dispatch ledger를 route-owned state와 Query cache로 분리합니다.
3. `host/sessions` — 세션 목록/read path부터 좁게 시작하고 editor mutation은 별도 pass로 나눕니다.

각 migration은 UI 컴포넌트가 API를 직접 호출하지 않는다는 route-first 경계를 유지해야 합니다.
```

- [ ] **Step 4: Validate**

Run:

```bash
git diff --check -- docs/showcase/engineering-confidence.md docs/development/server-state-migration.md
```

Expected: no output.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/showcase/engineering-confidence.md docs/development/server-state-migration.md
git commit -m "docs: document engineering confidence evidence"
```

Expected: one docs-only commit.

---

## Task 6: Write Operational Proof Guide

**Files:**

- Create: `docs/showcase/operational-proof.md`

- [ ] **Step 1: Inspect release and operations docs**

Run:

```bash
sed -n '1,220p' docs/development/release-readiness-review.md
sed -n '1,220p' scripts/README.md
sed -n '1,180p' docs/operations/README.md
sed -n '1,180p' docs/operations/runbooks/README.md
```

Expected: release readiness warns that passing tests is not proof that release risk is closed.

- [ ] **Step 2: Create operational proof document**

Create `docs/showcase/operational-proof.md`:

```markdown
# Operational Proof

이 문서는 ReadMates가 기능 구현 뒤 release, deploy, observability, incident learning까지 어떻게 닫는지 보여주는 reviewer-facing guide입니다.

## Release Evidence Flow

```text
Change
  -> targeted local checks
  -> release readiness review
  -> public release candidate build/check
  -> changelog/release note update
  -> deploy runbook
  -> smoke/post-deploy watch
  -> postmortem when an incident occurs
```

## Evidence Links

| Stage | Evidence |
| --- | --- |
| Release readiness | `docs/development/release-readiness-review.md` |
| Public release candidate | `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh`, `scripts/README.md` |
| Public repository safety | `docs/deploy/security-public-repo.md` |
| Deploy runbooks | `docs/deploy/README.md`, `docs/deploy/release-publish-runbook.md` |
| Observability | `docs/operations/observability/README.md` |
| Post-deploy watch | `docs/operations/runbooks/post-deploy-watch.md` |
| Incident learning | `docs/operations/postmortems/README.md` |

## Operating Principle

Passing tests is evidence, not proof that release risk is closed. Release readiness review also checks changelog coverage, operator-facing behavior changes, CI/deploy script risks, security-code hygiene, architecture-test baselines, and public-release safety.

## Public-Safe Incident Learning

Incident writeups should explain:

- trigger and customer/operator impact
- detection path
- rollback or mitigation
- root cause
- prevention added to code, tests, scripts, or runbooks

Incident writeups must not include real member data, private domains, secrets, raw provider payloads, local paths, or deployment identifiers.
```

- [ ] **Step 3: Validate**

Run:

```bash
git diff --check -- docs/showcase/operational-proof.md
rg -n "local absolute path|OCID|token-shaped|private key|private domain" docs/showcase/operational-proof.md
```

Expected: no whitespace errors and no active private values.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/showcase/operational-proof.md
git commit -m "docs: add operational proof guide"
```

Expected: one docs-only commit.

---

## Task 7: Migrate Host Members to TanStack Query

**Files:**

- Create: `front/features/host/queries/host-members-queries.ts`
- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/features/host/route/host-members-data.ts`
- Modify: `front/features/host/ui/host-members.tsx`
- Modify: `front/tests/unit/host-members.test.tsx`
- Modify: `docs/development/server-state-migration.md`

- [ ] **Step 1: Read frontend guide and current invitations pattern**

Run:

```bash
sed -n '1,220p' docs/agents/front.md
sed -n '1,220p' front/features/host/queries/host-invitation-queries.ts
sed -n '1,160p' front/features/host/route/host-invitations-data.ts
```

Expected: host invitations uses `queryOptions`, `setQueryData`, and invalidates `hostInvitationKeys.all`.

- [ ] **Step 2: Add host members query helper**

Create `front/features/host/queries/host-members-queries.ts`:

```typescript
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type {
  HostMemberListPage,
  MemberLifecycleRequest,
} from "@/features/host/api/host-contracts";
import type {
  HostMemberLifecyclePath,
  HostViewerAction,
} from "@/features/host/route/host-members-actions";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";

export const hostMemberKeys = {
  all: ["host", "members"] as const,
  list: (page?: PageRequest) => [...hostMemberKeys.all, "list", page ?? {}] as const,
} as const;

async function fetchHostMemberList(
  context?: ReadmatesApiContext,
  page?: PageRequest,
): Promise<HostMemberListPage> {
  return fetchHostMembers(context, page);
}

export function hostMemberListQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostMemberKeys.list(page),
    queryFn: () => fetchHostMemberList(context, page),
  });
}

export function invalidateHostMembers(client: QueryClient) {
  return client.invalidateQueries({ queryKey: hostMemberKeys.all });
}

export function useHostMemberLifecycleMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      path,
      body,
    }: {
      membershipId: string;
      path: HostMemberLifecyclePath;
      body?: MemberLifecycleRequest;
    }) => submitHostMemberLifecycle(membershipId, path, body),
    onSuccess: () => invalidateHostMembers(client),
  });
}

export function useHostMemberProfileMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      displayName,
    }: {
      membershipId: string;
      displayName: string;
    }) => submitHostMemberProfile(membershipId, displayName),
    onSuccess: () => invalidateHostMembers(client),
  });
}

export function useHostViewerActionMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      action,
    }: {
      membershipId: string;
      action: HostViewerAction;
    }) => submitHostViewerAction(membershipId, action),
    onSuccess: () => invalidateHostMembers(client),
  });
}
```

- [ ] **Step 3: Convert loader to factory and seed query cache**

Modify `front/features/host/route/host-members-data.ts` so it exports `hostMembersLoaderFactory(client: QueryClient)`:

```typescript
import type { QueryClient } from "@tanstack/react-query";
import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type { HostMembersActions } from "@/features/host/route/host-members-actions";
import { hostMemberListQuery } from "@/features/host/queries/host-members-queries";
import type { LoaderFunctionArgs } from "react-router-dom";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

const HOST_MEMBERS_PAGE_LIMIT = 50;

export function hostMembersLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs) => {
    await requireHostLoaderAuth(args);

    const page = await fetchHostMembers(
      { clubSlug: clubSlugFromLoaderArgs(args) },
      { limit: HOST_MEMBERS_PAGE_LIMIT },
    );

    client.setQueryData(
      hostMemberListQuery({ limit: HOST_MEMBERS_PAGE_LIMIT }).queryKey,
      page,
    );

    return page;
  };
}

export const hostMembersActions = {
  loadMembers: (page) => fetchHostMembers(undefined, page),
  submitLifecycle: submitHostMemberLifecycle,
  submitProfile: submitHostMemberProfile,
  submitViewerAction: submitHostViewerAction,
} satisfies HostMembersActions;
```

- [ ] **Step 4: Pass query client from host routes**

Modify the `members` route in `front/src/app/routes/host.tsx` to thread `queryClient` into the loader factory while keeping the surrounding route shape identical to the current code (no new `errorElement` or `hydrateFallbackElement` fields):

```typescript
{
  path: "members",
  lazy: async () => {
    const [{ HostMembersRouteElement }, { hostMembersLoaderFactory }] = await Promise.all([
      import("@/src/app/host-route-elements"),
      import("@/features/host/route/host-members-data"),
    ]);
    return {
      Component: HostMembersRouteElement,
      loader: hostMembersLoaderFactory(queryClient),
    };
  },
}
```

The only change versus the current `host.tsx` member route is that `hostMembersLoader` becomes `hostMembersLoaderFactory(queryClient)`. Error/loading fallback wiring stays out of this task; if it should be added, do it in a separate route-UX PR.

- [ ] **Step 5: Wire `HostMembers` to Query without moving API calls into UI**

In `front/features/host/ui/host-members.tsx`, import Query helpers:

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hostMemberListQuery, invalidateHostMembers } from "@/features/host/queries/host-members-queries";
```

Replace the local initial page/member source setup with the same pattern used by host invitations:

```typescript
const initialPage = normalizeMemberPage(initialMembers);
const queryClient = useQueryClient();
const listQuery = useQuery({
  ...hostMemberListQuery({ limit: 50 }),
  queryFn: async () => normalizeMemberPage(await actions.loadMembers({ limit: 50 })),
  initialData: initialPage,
});
const queryMembers = listQuery.data?.items ?? [];
const [memberRowsState, setMemberRowsState] = useState<MemberRowsState>(() => ({
  source: queryMembers,
  members: queryMembers,
}));
const members = memberRowsState.source === queryMembers ? memberRowsState.members : queryMembers;
```

After each successful lifecycle, profile, and viewer action path that currently calls `refreshMembers()`, keep the existing UI refresh behavior and add:

```typescript
await invalidateHostMembers(queryClient);
```

Do not call `fetchHostMembers` directly from UI. Continue using `actions.loadMembers`.

- [ ] **Step 6: Add focused tests**

Modify `front/tests/unit/host-members.test.tsx` with tests that assert:

```typescript
it("seeds the host members list through the route loader", async () => {
  const fetchMock = renderHostMembersPage();

  expect(await screen.findByRole("tab", { name: "활성 멤버" })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/bff/host/members?limit=50"),
    expect.anything(),
  );
});
```

And:

```typescript
it("refreshes the Query-backed list after a member profile update", async () => {
  const user = userEvent.setup();
  const updated = { ...members[0], displayName: "새이름", accountName: "안멤버1" } satisfies HostMemberListItem;
  renderHostMembersPage([memberListItemResponse(updated)]);

  const row = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
  await user.click(row.getByRole("button", { name: "이름 변경" }));

  const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
  await user.clear(dialog.getByLabelText("이름"));
  await user.type(dialog.getByLabelText("이름"), "새이름");
  await user.click(dialog.getByRole("button", { name: "저장" }));

  expect(await screen.findByText("새이름")).toBeInTheDocument();
  expect(screen.queryByText("멤버1")).not.toBeInTheDocument();
});
```

If the existing helper URL assertion differs because BFF path construction is mocked at a lower level, assert the exact current mocked URL used by `renderHostMembersPage()` rather than changing production code for the test.

- [ ] **Step 7: Update migration status**

Modify `docs/development/server-state-migration.md`:

```markdown
## 완료
- `host/invitations` — list query + create/revoke mutation + loader hand-off
- `host/members` — list query + lifecycle/profile/viewer mutation refresh + loader hand-off
```

Also update the `## 후속 후보 (우선순위)` list so it (a) removes `host/members` and (b) reorders the remaining frontend candidates to match the design spec section 9.1 priority (`host/notifications` before `host/sessions`). The intended post-edit shape:

```markdown
## 후속 후보 (우선순위)
1. `host/notifications`
2. `host/sessions`
3. `current-session` (actions 4개)
4. `archive`, `feedback`, `public` — 읽기 중심, loader 와 결합도 높음
```

This keeps Task 8's premise (notifications is the next slice) consistent with the migration status doc.

- [ ] **Step 8: Run frontend checks**

Run:

```bash
pnpm --dir front test -- host-members
pnpm --dir front lint
pnpm --dir front build
```

Expected: all commands pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add front/features/host/queries/host-members-queries.ts \
  front/src/app/routes/host.tsx \
  front/features/host/route/host-members-data.ts \
  front/features/host/ui/host-members.tsx \
  front/tests/unit/host-members.test.tsx \
  docs/development/server-state-migration.md
git commit -m "feat(front): migrate host members to query cache"
```

Expected: one frontend confidence commit.

---

## Task 8: Plan Host Notifications Query Migration as a Separate Slice

**Files:**

- Create: `docs/superpowers/plans/2026-05-17-readmates-host-notifications-query-migration.md`
- Modify: `docs/development/server-state-migration.md`

- [ ] **Step 1: Inspect current notification route and UI split**

Run:

```bash
sed -n '1,220p' front/features/host/route/host-notifications-data.ts
sed -n '1,220p' front/features/host/route/host-notifications-route.tsx
find front/features/host/ui/notifications -maxdepth 1 -type f | sort
```

Expected: notifications are larger than host members and need a separate migration plan.

- [ ] **Step 2: Create a focused notification migration plan**

Create `docs/superpowers/plans/2026-05-17-readmates-host-notifications-query-migration.md` with this header:

```markdown
# ReadMates Host Notifications Query Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move host notification summary, event ledger, delivery ledger, manual options, preview, confirm, and dispatch ledger reads into TanStack Query without moving API calls into UI components.

**Architecture:** Keep `front/features/host/route` responsible for loader/action coordination and keep `front/features/host/ui/notifications` prop/callback driven. Add `front/features/host/queries/host-notification-queries.ts` for query keys, queryOptions, and mutation invalidation helpers.

**Tech Stack:** React 19, React Router 7, TanStack Query v5, Vitest, Testing Library.

---
```

Continue the new plan with this body:

````markdown
## Task 1: Map Current Notification Data Flow

**Files:**

- Read: `front/features/host/route/host-notifications-data.ts`
- Read: `front/features/host/route/host-notifications-route.tsx`
- Read: `front/features/host/ui/host-notifications-page.tsx`
- Read: `front/features/host/ui/notifications/manual-notification-workbench.tsx`

- [ ] **Step 1: Inspect existing route and UI data flow**

Run:

```bash
sed -n '1,240p' front/features/host/route/host-notifications-data.ts
sed -n '1,240p' front/features/host/route/host-notifications-route.tsx
sed -n '1,260p' front/features/host/ui/host-notifications-page.tsx
sed -n '1,260p' front/features/host/ui/notifications/manual-notification-workbench.tsx
```

Expected: route owns loader data, while UI coordinates several host notification reads and manual dispatch actions.

## Task 2: Add Notification Query Keys

**Files:**

- Create: `front/features/host/queries/host-notification-queries.ts`

- [ ] **Step 1: Create query key module**

Create query keys for `summary`, `items(status,page)`, `events(page)`, `deliveries(page)`, `manualOptions(sessionId,search,page)`, and `manualDispatches(sessionId,eventType,page)`. Each key starts with `["host", "notifications"]`.

- [ ] **Step 2: Add invalidation helpers**

Add `invalidateHostNotifications(client)` for all host notification state and `invalidateManualNotificationState(client)` for manual options/dispatches.

## Task 3: Seed Loader Data

**Files:**

- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/features/host/route/host-notifications-data.ts`

- [ ] **Step 1: Convert loader to factory**

Follow the `hostMembersLoaderFactory(client)` pattern from the engineering proof portfolio plan. Seed summary, events, deliveries, and manual options into Query cache from loader data.

## Task 4: Move Preview and Confirm to Query Mutations

**Files:**

- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`

- [ ] **Step 1: Keep UI prop-driven**

Use actions passed from the route for API calls. Do not import `host-api.ts` into UI. Use Query mutations only to track pending state and invalidation.

- [ ] **Step 2: Preserve preview TTL and resend confirmation**

After preview success, keep the preview token and selection hash state in the workbench. After confirm success, invalidate manual dispatches and notification summary.

## Task 5: Test Notification Migration

**Files:**

- Modify: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add regression tests**

Add these regression tests to `front/tests/unit/host-notifications.test.tsx`:

```typescript
it("keeps manual preview state when notification queries invalidate", async () => {
  // Arrange with the existing manual notification route fixture.
  // Preview a manual notification.
  // Trigger an invalidation through a successful confirm or process action.
  // Assert the preview token, selected template, and target count remain visible until confirm resolves.
});

it("requires explicit resend confirmation after query migration", async () => {
  // Arrange with a recent manual dispatch fixture for the same session/template.
  // Preview the same dispatch.
  // Assert confirm is blocked until the resend confirmation control is selected.
});

it("refreshes manual dispatch ledger after confirm", async () => {
  // Arrange with an empty dispatch ledger.
  // Confirm a preview.
  // Assert the ledger query refetch shows the new dispatch row.
});
```

Replace the comments with the existing test helper calls in that file; keep the three test names and assertions.

- [ ] **Step 2: Run checks**

Run:

```bash
pnpm --dir front test -- host-notifications
pnpm --dir front lint
pnpm --dir front build
```

Expected: all commands pass.
````

- [ ] **Step 3: Update migration status**

Modify `docs/development/server-state-migration.md` so `host/notifications` points to the new detailed plan:

```markdown
2. `host/notifications` — detailed migration plan: `docs/superpowers/plans/2026-05-17-readmates-host-notifications-query-migration.md`
```

- [ ] **Step 4: Validate and commit**

Run:

```bash
git diff --check -- docs/superpowers/plans/2026-05-17-readmates-host-notifications-query-migration.md docs/development/server-state-migration.md
```

Commit:

```bash
git add docs/superpowers/plans/2026-05-17-readmates-host-notifications-query-migration.md docs/development/server-state-migration.md
git commit -m "docs: plan host notifications query migration"
```

Expected: one planning commit with no frontend runtime changes.

---

## Task 9: Document Server Transaction Boundary Policy

**Files:**

- Modify: `docs/development/technical-decisions.md`

- [ ] **Step 1: Inspect current transaction ownership**

Run:

```bash
rg -n "@Transactional" server/src/main/kotlin/com/readmates/session server/src/main/kotlin/com/readmates/notification server/src/main/kotlin/com/readmates/club server/src/main/kotlin/com/readmates/auth
sed -n '1,140p' server/src/main/kotlin/com/readmates/session/application/service/HostSessionDraftCommandService.kt
sed -n '1,140p' server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt
```

Expected: session application services own write transactions, while some persistence adapters still carry method-level `@Transactional`.

- [ ] **Step 2: Add transaction policy note**

Append this section to `docs/development/technical-decisions.md`:

```markdown
## Transaction Boundary Policy

Application services own business transaction boundaries. Controllers parse HTTP and call use cases; persistence adapters execute SQL and mapping. When an application service coordinates more than one write port, the service method owns the transaction so cache invalidation, notification event recording, and state mutation share one visible boundary.

Adapter-level `@Transactional` is allowed only when the adapter is called by an inbound scheduler, Kafka listener, or other path that does not already pass through an application service transaction. If both service and adapter carry `@Transactional`, the service boundary is treated as the authoritative boundary and the adapter annotation should be removed in a narrow cleanup once tests pin the behavior.

Isolation is specified only where the operation depends on claim/read-modify-write behavior that needs a non-default guarantee. Existing examples include session/login restoration and notification delivery claiming. New isolation choices must be explained in the service or adjacent decision record.
```

- [ ] **Step 3: Validate docs formatting**

Run:

```bash
git diff --check -- docs/development/technical-decisions.md
```

Expected: no output.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/development/technical-decisions.md
git commit -m "docs: document transaction boundary policy"
```

Expected: one docs-only server-confidence commit.

---

## Task 10: Remove Redundant Host Session Adapter Transactions

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`

- [ ] **Step 1: Confirm application services own session write transactions**

Run:

```bash
sed -n '1,120p' server/src/main/kotlin/com/readmates/session/application/service/HostSessionDraftCommandService.kt
sed -n '1,140p' server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt
sed -n '1,80p' server/src/main/kotlin/com/readmates/session/application/service/HostSessionAttendanceService.kt
sed -n '1,80p' server/src/main/kotlin/com/readmates/session/application/service/HostSessionPublicationService.kt
```

Expected: create, update, updateVisibility, open, close, publish, delete, confirmAttendance, and upsertPublication are already service-level `@Transactional` operations.

- [ ] **Step 2: Run current host session tests before refactor**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.session.application.service.HostSessionServicesTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: both commands pass before the refactor.

- [ ] **Step 3: Remove adapter transaction annotations**

Modify `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`:

```kotlin
// Remove this import:
import org.springframework.transaction.annotation.Transactional
```

Remove the `@Transactional` annotation immediately above each of these methods:

```kotlin
override fun create(command: HostSessionCommand)
override fun update(command: UpdateHostSessionCommand)
override fun delete(command: HostSessionIdCommand)
override fun confirmAttendance(command: ConfirmAttendanceCommand)
override fun upsertPublication(command: UpsertPublicationCommand)
override fun updateVisibility(command: UpdateHostSessionVisibilityCommand)
override fun open(command: HostSessionIdCommand)
override fun close(command: HostSessionIdCommand)
override fun publish(command: HostSessionIdCommand)
```

Do not change SQL, ports, service signatures, cache invalidation, notification recording, or query methods.

- [ ] **Step 4: Run server checks after refactor**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.session.application.service.HostSessionServicesTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.HostSessionControllerDbTest'
./server/gradlew -p server architectureTest
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt
git commit -m "refactor(server): clarify session transaction boundary"
```

Expected: one server confidence commit with no API behavior change.

---

## Task 11: Initiative Closeout and Release Readiness Review

**Files:**

- Modify: `README.md` if final links or wording need alignment
- Modify: `CHANGELOG.md` if user-visible docs/showcase or quality workflow changes should be noted
- Modify: `docs/showcase/*.md` only for consistency fixes

- [ ] **Step 1: Review branch scope**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git diff --name-only origin/main..HEAD
```

Expected: only intended docs, frontend confidence, server confidence, and release-safety files are changed across the initiative branch.

- [ ] **Step 2: Run release-readiness checks**

Run:

```bash
git diff --check origin/main..HEAD
rg -n "^## Unreleased|Engineering proof|showcase|guest-mode|server-state|transaction" CHANGELOG.md README.md docs
```

Expected: no whitespace errors. Findings show where the initiative is documented.

- [ ] **Step 3: Run public release candidate checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: candidate build succeeds and scanner reports no blocking public-safety finding.

- [ ] **Step 4: Run code checks if Tasks 7 or 10 changed runtime code**

Frontend code changed:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Server code changed:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server architectureTest
```

Expected: touched-surface checks pass. If a command cannot run because local dependencies are unavailable, record the skipped command and exact reason in the final review note.

- [ ] **Step 5: Produce final release-readiness note**

Create a short final note in the PR description or release-readiness review comment with:

```markdown
## Scope

- Reviewer-facing showcase docs
- README review path
- Engineering confidence evidence
- Operational proof evidence
- Frontend Query migration work completed in this branch
- Server transaction boundary work completed in this branch

## Validation

- `git diff --check origin/main..HEAD`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
- Frontend checks: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`; skipped commands are listed with the exact local blocker.
- Server checks: `./server/gradlew -p server unitTest`, `./server/gradlew -p server architectureTest`; skipped commands are listed with the exact local blocker.

## Residual Risk

- Showcase docs summarize current source-of-truth docs and can become stale if architecture changes without link updates.
- Guest-mode walkthrough depends on public route behavior staying aligned with `docs/development/architecture.md`.
- Host notifications Query migration remains tracked separately if Task 8 was planning-only.
```

- [ ] **Step 6: Commit closeout changes**

Run:

```bash
git add README.md CHANGELOG.md docs/showcase
git commit -m "docs: close engineering proof portfolio review"
```

Expected: commit only if Step 5 revealed actual file changes. If no files changed, do not create an empty commit.

---

## Plan Self-Review

Spec coverage:

- Portfolio entry: Tasks 1-2
- Guest-mode showcase: Task 3
- Architecture evidence: Task 4
- Engineering confidence: Tasks 5, 7, 8, 9, 10
- Operational proof: Task 6
- Release/public safety verification: Task 11
- Public safety constraints: global rules plus task validation scans

No task requires private data, public auth bypass, real deployment state, or external live provider keys.

Execution rule: implement tasks in order and commit after each task. Do not batch Tasks 1-6 with Tasks 7-10.
