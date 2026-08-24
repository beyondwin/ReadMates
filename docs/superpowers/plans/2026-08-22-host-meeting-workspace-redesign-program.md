# Host Meeting Workspace Redesign Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 ReadMates 호스트 모임 운영 경험을 안전한 서버 mutation 계약, 멤버·호스트 공통 셸, 모임 중심 작업공간, 공개 투영 수렴, 혼합 배포와 품질 증거까지 포함한 제품 수준으로 구현한다.

**Architecture:** 작업을 네 개의 독립적으로 검증 가능한 workstream으로 나눈다. 서버는 revision·participant snapshot·idempotency·atomic publication을 먼저 제공하고, 프론트는 URL-authoritative 공통 셸과 prop-only Meeting Folio를 구성한다. 공개 효과는 immutable mutation receipt와 append-only convergence ledger로 분리하며, 전역 host client contract는 backend/BFF support window 뒤 v3 browser를 배포하고 잔존 v2 write가 0임을 확인한 다음 강제한다.

**Tech Stack:** React 19, React Router 8, TanStack Query v5, TypeScript 6, Zod, Vite, Vitest, Testing Library, Playwright; Cloudflare Pages Functions; Kotlin, Spring Boot, JDBC, MySQL 8, Flyway, Redis optional cache, JUnit 5, MockMvc, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

ADR impact: new — ADR-0018, ADR-0019, ADR-0020, ADR-0023, ADR-0024, ADR-0025, ADR-0026, ADR-0027, ADR-0028, ADR-0034, ADR-0035, ADR-0036, ADR-0037, ADR-0038

## Global Constraints

- This Phase 0 documentation change creates the spec, plans, and Proposed ADRs, so each plan records `ADR impact: new`. Implementation branches start from that merged documentation baseline, reference/update the ADRs, and promote only after evidence; they do not collapse Proposed→Accepted into this design-only diff.
- 사용자 화면의 canonical noun은 `모임`이고 내부 route/API/DB의 `session`은 호환을 위해 유지한다. 이미 저장된 알림 본문, 사용자 제목, import parser marker는 rewrite하지 않는다.
- 멤버와 호스트는 같은 global club shell을 쓰며 같은 breakpoint에서 primary navigation 위치가 같다. 특정 모임의 왼쪽 영역은 global host menu가 아니라 unordered local task navigation이다.
- lifecycle `DRAFT → OPEN → CLOSED → PUBLISHED`, app audience `HOST_ONLY|GUEST_READABLE`, public placement `HIDDEN|PUBLIC_RECORD`는 서로 독립인 축이다.
- `sessionStorage`나 React route state가 workspace chrome의 authority가 되어서는 안 된다. canonical pathname과 authoritative loader auth가 render authority다.
- host authority 상실·정지·cross-club failure는 in-flight request와 club-scoped host cache/draft/receipt/preview를 폐기한다. revision conflict와 권한이 유지된 response loss는 local draft를 보존한다.
- stale mutation은 partial write, audit row, cache effect를 만들지 않는다. close와 member write는 같은 serialization barrier를 공유한다.
- receipt-bearing host mutation은 versioned canonicalization과 secret-keyed HMAC을 사용한다. raw request, meeting URL/passcode, plain digest를 DB·log·receipt에 저장하지 않는다.
- notification preview의 content revision, target snapshot, duplicate/resend 계약은 generic idempotency로 약화하지 않는다. lifecycle·record·exposure action은 알림을 자동 발송하지 않는다.
- DB/origin projection은 transaction에서 원자적으로 바뀌고 Redis/CDN/browser convergence는 별도 append-only ledger로 추적한다. Redis는 auxiliary state다.
- platform-admin emergency takedown은 host mutation과 분리하고 active OWNER/OPERATOR에만 부여되는 `EMERGENCY_PUBLIC_TAKEDOWN` capability로 preview/confirm을 허용한다.
- 기존 V45 rolling-deploy compatibility column/dual-write는 v3 adoption과 legacy residue 확인 전 제거하지 않는다.
- 실제 멤버 데이터, private domain, secret, token-shaped fixture, provider error 원문, local absolute path를 committed artifact에 넣지 않는다.
- 각 task는 RED 확인 → 최소 GREEN → focused regression → `git diff --check` → 좁은 커밋 순서로 끝낸다.
- workstream 중간에는 해당 focused gate만 실행하고, 네 workstream이 합쳐진 뒤에만 product-level 완료를 선언한다.
- 코드·테스트·artifact 준비와 live deployment authority는 별개다. R1, R2a, R2b, R3 각각 직전에 해당 stage를 명시한 새 사용자 승인이 없으면 artifact/runbook-ready에서 멈춘다. 승인이 있을 때만 `python3 scripts/agent-preflight.py --intent release --base origin/main --authority-scope live-mutation --authority-note '<approved stage>'`로 그 authority note를 기록하고 배포한다.

## Workstream Plans

| Workstream | Plan | Testable output |
| --- | --- | --- |
| A. 서버 안전 계약 | `docs/superpowers/plans/2026-08-22-host-meeting-server-safety-contracts.md` | CAS revision, participant snapshot, UNKNOWN attendance, HMAC idempotency, atomic publication |
| B. 공통 셸과 호스트 작업공간 | `docs/superpowers/plans/2026-08-22-shared-club-shell-and-host-meeting-workspace.md` | URL-authoritative shared shell, dedicated create, lazy panel workspace, adaptive Meeting Folio |
| C. 공개 수렴과 긴급 회수 | `docs/superpowers/plans/2026-08-22-public-projection-convergence-and-takedown.md` | generation-scoped projection, immutable receipt, append-only convergence, admin takedown |
| D. v3 전환과 제품 품질 | `docs/superpowers/plans/2026-08-22-host-client-v3-rollout-and-product-quality.md` | mixed-deploy compatibility, v3 enforcement, cross-browser/a11y/perf/release evidence |

## Cross-Workstream Dependency Order

1. D Task 1–2가 backend `SUPPORT_V2_V3`와 BFF `{v2,v3}` 경계 artifact를 준비한다. 별도의 R1 live 승인 뒤에만 이를 배포하며, 같은 Pages artifact의 브라우저는 아직 v2를 유지한다.
2. A Task 1–6과 B Task 1–5는 병렬 가능하다. A는 mutation 기반, B는 copy·URL·IA·공통 shell·순수 local navigation을 만든다.
3. A Task 7이 exposure/publication과 PUBLISHED correction의 atomic server contract를 끝내고, C Task 1이 generation, authoritative cache denial, convergence storage와 전용 cache-safety browser spec을 결합한다. A7 public-effect는 C1 전 independently releasable하지 않다.
4. 별도의 R2a live 승인 뒤 A7+C1 safety backend와 ≤60초 public cache/BFF policy를 배포하되 browser host-client bundle은 v2로 유지한다. 이전 `120+600=720`초 browser lifetime을 소진하고 C1 전용 spec으로 origin/BFF/CDN/browser 경계를 증명한다.
5. 병렬로 B Task 6이 v3 browser candidate를 만들고 B Task 7이 authority-loss purge를 완성한다. D Task 3이 R2a backend와 R2b Pages candidate의 browser/BFF/backend matrix·non-session 회귀를 증명하고, D Task 5가 같은 R2b candidate에서 B7 authority purge와 deterministic C1 cache suite를 재실행한다. R2a의 실제 720초 cache proof는 별도 attested manifest로 유지한다.
6. D Task 4 final checker가 attested D3/D5 manifests, R2a A7/C1 provenance, 720초 결과, B7/R2b candidate digest 일치를 검증한다. 별도의 R2b live 승인 뒤에만 immutable v3 Pages candidate를 배포한다. C Task 4 operator UI/E2E는 R2b 선행조건이 아니지만 최종 제품 완료 전에는 필요하다.
7. R2b의 named 24-hour window에서 `v2=0`, `v3>0`, `missing/unknown=0`을 확인한다. 별도의 R3 live 승인 뒤에만 backend enforcement를 활성화한다. B Task 8–10, C Task 2–4, D Task 6–7은 제품 UX/browser/a11y/performance/release 증거를 완성하고 ADR을 `Accepted`로 승격한다.

`B browser v3 flip`은 `D support mode`보다 먼저 deploy할 수 없다. R1, R2a, R2b는 서로 다른 immutable tags다. R2a는 browser v2를 유지하고 R2b checker는 attested D3 compatibility/non-session manifest, B7 authority purge, C1 generation/cache denial과 720초 boundary, D5 browser manifest의 동일 candidate binding을 요구한다. R2b 이후 rollback은 v3-capable backend로 하거나 Pages/browser와 coordinated rollback해야 하며, 이미 열린 v3 tab은 incompatible backend/BFF에서 fail closed한다. `D ENFORCE_V3`는 실제 production-like adoption evidence 전에는 활성화할 수 없다.

## Requirement Handoff

| Approved requirement | Owning plan/tasks |
| --- | --- |
| `모임` canonical language, purpose-specific publication copy | B1, B10, D7 |
| URL workspace authority, role/club continuity | B2, B4, B7, D5 |
| common global shell and same-position role navigation | B3–B4, B10 |
| current meeting local task navigation | B5, B8, B10 |
| dedicated create and explicit prepare action | A2–A3, B9 |
| participant snapshot and RSVP denominator | A1, A3 |
| actual attendance `UNKNOWN`, row/bulk concurrency | A1, A4, B10 |
| revision guarded basic/lifecycle/trash/record/publication | A1–A2, A7 |
| HMAC idempotency and reconciliation | A5–A6, B6 |
| atomic PUBLISHED correction | A7, B8, B10 |
| immutable public receipt and append-only convergence | C1–C2 |
| platform-admin emergency takedown | C3–C4 |
| authority-loss host-state purge | B7, D5 |
| v2/v3 mixed deploy and non-session host write compatibility | D1–D4 |
| 320–1440, 200% zoom, keyboard, screen reader | B10, D6 |
| 500-member measured budget | D6 |
| active docs, ADR governance, public-repo safety | D7 |

## File Responsibility Map

| Responsibility | Owner |
| --- | --- |
| Flyway V52–V53, session revisions, idempotency receipt | A only |
| Session controller/service/port/persistence CAS | A only |
| Shared copy, app shell, URL/role/club route model | B only |
| Host route/query/UI decomposition | B only |
| Flyway V54–V55, convergence and takedown server slice | C only |
| Platform-admin takedown route/API/UI | C only |
| Server generation policy and BFF capability | D only |
| Browser v3 header and session envelope adoption | B Task 6; D Task 3 consumes it for rollout evidence |
| Playwright projects, CI, performance harness | D only |
| Active architecture, CHANGELOG, ADR status/index | D only after A–C evidence |

No two concurrently running tasks may edit the same file. If a workstream discovers a shared-file collision, one owner integrates both changes after the independent commits rather than opportunistically editing a dirty shared file.

## Program Acceptance Matrix

- Actor/authorization: host authority on every mutation and receipt lookup; admin role matrix; authority-loss purge.
- Club context: route-family club switching, no entity/cursor reuse, cross-club request rejection.
- Session lifecycle: every forward/reverse transition, stale rejection, close/member-write serialization.
- Guest/public exposure: lifecycle × access scope × site visibility × generation projection.
- Guest DTO privacy: member identifiers, private meeting data, raw canonical payload, admin reason and provider error excluded.
- Persistence/migration: V52→V53→V54→V55 upgrade, forward-only constraints, concurrency, immutable receipts.
- Async/cache/provider: provider retry ledger, origin fail closed, Redis failure, 120/60 second boundaries.
- UI/runtime: loading/known-empty/unavailable/stale, response-loss reconciliation, draft preservation/purge.
- Responsive/accessibility: 320/390/768/1024/1440, 200% zoom, keyboard, reduced motion, named navs, screen reader.
- Performance: public-safe synthetic 500-member fixture under the approved production-build budget.

## Program Closeout Checklist

- [ ] Execute every task in A–D and keep each plan's checkbox state current.
- [ ] Run `python3 scripts/agent-preflight.py --intent release --base origin/main` against the complete changed-path set and add any newly selected acceptance row before final gates.
- [ ] Run frontend gates with the repository-pinned package manager:

  ```bash
  corepack pnpm --dir front lint
  corepack pnpm --dir front test
  corepack pnpm --dir front build
  corepack pnpm --dir front test:e2e
  corepack pnpm --dir front test:ct
  corepack pnpm --dir front performance:budget
  corepack pnpm --dir front test:host-workspace-performance
  ```

- [ ] Run server and deploy-contract gates:

  ```bash
  ./scripts/server-ci-check.sh
  ./server/gradlew -p server integrationTest
  python3 -B scripts/check-flyway-migration-immutability.py --self-test
  python3 -B scripts/check-flyway-migration-immutability.py --base-ref origin/main
  python3 -B scripts/check-deploy-workflow-contract.py --self-test
  python3 -B scripts/check-deploy-workflow-contract.py
  python3 -B scripts/check-host-client-rollout-contract.py --self-test
  python3 -B scripts/check-host-client-rollout-contract.py
  ```

- [ ] Run guidance, docs, and public artifact gates:

  ```bash
  python3 scripts/check-agent-guidance.py --self-test
  python3 scripts/check-agent-guidance.py
  ./scripts/build-public-release-candidate.sh
  ./scripts/public-release-check.sh .tmp/public-release-candidate
  ./scripts/verify-public-release-fixtures.sh
  git diff --check
  ```

- [ ] Run the Impeccable detector once on all changed UI targets, fix only detected regressions, and do not loop detector runs.
- [ ] Capture one batched visual review at 320, 390, 768, 1024, 1440 and 200% zoom with synthetic data; allow one consolidated polish pass.
- [ ] Ask one fresh reviewer with no implementation context to check the approved spec, all four plans, changed code, evidence, and unresolved risks.
- [ ] Confirm there is no unresolved planning marker, incomplete production behavior, duplicate workspace authority, or unowned compatibility flag in changed production code/docs.
- [ ] Promote Proposed ADRs only when code, tests, active architecture, runbooks, and runtime evidence all agree; otherwise leave the ADR Proposed and name the missing evidence.
- [ ] Do not call the program complete if any spec §28 release blocker remains.

---

### Task 1: Freeze the program boundary before implementation

**Files:**
- Create/modify: `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`
- Create/modify: this program plan and the four dated workstream plans under `docs/superpowers/plans/`
- Create/modify: `docs/development/adr/0012-redis-as-optional-auxiliary-state.md` and ADR-0017 through ADR-0038 used by this program
- Modify: `docs/development/adr/README.md`, `docs/development/adr/template.md`, `docs/development/technical-decisions.md`, `docs/development/project-map.md`, `docs/development/vertical-slice-checklist.md`
- Modify: `AGENTS.md`, `README.md`, `docs/README.md`, `docs/agents/docs.md`, `docs/agents/execution.md`, `docs/development/README.md`
- Modify: `scripts/check-agent-guidance.py`, `scripts/README.md`
- Create: `.github/pull_request_template.md`

**Interfaces:**
- Program identity: `host-meeting-workspace-redesign-v1`.
- Compatibility floor: current v2 remains valid only during the documented support window.
- Canonical product term: `모임`.

- [x] **Step 1: Verify the approved design status and worktree.**

  Run: `git status --short --branch`

  Run: `sed -n '1,12p' docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

  Expected: spec says `상태: 최종 승인`; existing unrelated changes are preserved.

- [x] **Step 2: Validate plan completeness.**

  Run: `rg -n 'T[B]D|T[O]DO|<fill-m[e]>|<replace-m[e]>' docs/superpowers/plans/2026-08-22-{host-meeting-workspace-redesign-program,host-meeting-server-safety-contracts,shared-club-shell-and-host-meeting-workspace,public-projection-convergence-and-takedown,host-client-v3-rollout-and-product-quality}.md`

  Expected: no unresolved planning marker.

- [x] **Step 3: Validate ADR references and Markdown.**

  Run: `python3 scripts/check-agent-guidance.py`

  Run: `git diff --check -- docs/superpowers docs/development/adr`

  Expected: PASS.

- [x] **Step 4: Commit only the approved Phase 0 documentation handoff.** Compare tracked and untracked paths against the file scope above. Abort if product code, deploy workflow behavior, migrations, generated runtime evidence, or unrelated dirty paths would enter the commit. Stage explicit paths rather than `git add .`; implementation branches must base on the merged Phase 0 documentation commit, not on an unmerged local draft.

  Run: `git diff --name-only && git ls-files --others --exclude-standard`

  Commit: `docs(host): approve meeting workspace implementation program`
