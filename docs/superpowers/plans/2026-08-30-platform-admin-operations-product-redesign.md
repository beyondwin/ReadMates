# Platform Admin Operations Product Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 운영 제품 설계에 따라 플랫폼 어드민을 `오늘 할 일 · 클럽 관리 · 서비스 상태 · 처리 기록` 네 축으로 재구성하고, `플랫폼 운영 · 내 클럽` 전역 공간 전환을 서버 권위·안전한 복귀·완결형 모바일 흐름과 함께 구현한다.

**Architecture:** `/api/auth/me`에 additive `availableSpaces v1` projection을 backend-first로 추가하고 기존 auth field를 호환 기간 유지한다. App composition root가 공간 전환과 authority-loss를 조정하며, 두 shell이 실제로 공유하는 pure model/UI만 `shared`에 둔다. Platform-admin route는 URL/query와 data orchestration, model은 pure 상태·카피 계산, UI는 prop/callback presentation을 소유한다. 기존 admin domain API와 ADR-0040 safe-command는 재사용하고 새 범용 backend나 KPI API를 만들지 않는다.

**Tech Stack:** Kotlin 2, Spring Boot, JdbcTemplate/MySQL/Flyway, React 19, Vite, React Router, TanStack Query, TypeScript, Vitest, Playwright CT/E2E, Pretendard Variable.

**Spec:** `docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md`

**Visual authority:** `design/mockups/2026-08-30-admin-operations-redesign/`

ADR impact: supersede — ADR-0026, ADR-0047, ADR-0050, ADR-0051

ADR-0050 supersedes ADR-0047, ADR-0051 supersedes ADR-0026. ADR-0037 emergency public takedown, ADR-0039 Service Spine, ADR-0040 safe-command, ADR-0045 shared brand primitive는 유지한다. ADR-0037/0050/0051은 각 미충족 증거와 전체 code·tests·active docs가 일치할 때까지 `Proposed`다.

## Global Constraints

- 제품 코드 작업 전에 `git status --short --branch --untracked-files=all`, `python3 scripts/agent-preflight.py`, 관련 package `AGENTS.md`를 다시 확인한다.
- 각 behavior task는 TDD RED → GREEN → focused regression → task commit 순서를 지킨다.
- route-first 의존 방향 `app → pages → features → shared`와 feature-to-feature import 금지를 유지한다.
- UI는 API/query/router를 import하지 않고 prop/callback으로만 렌더한다.
- `availableSpaces`는 공간과 club perspective만 투영한다. 실제 action authority는 기존 platform capability, club route guard, Today `allowedActions`가 다시 확인한다.
- 기존 `joinedClubs`, `platformAdmin`, `recommendedAppEntryUrl`과 legacy workspace storage key는 이 프로그램에서 삭제하지 않는다. 제거는 mixed-version browser/backend 호환이 실제 배포에서 증명된 뒤 별도 승인 계획으로 수행한다.
- projection 부재/unknown version/malformed target은 권한을 넓히지 않는다. 구 필드 기반 fallback은 기존보다 좁거나 같은 destination만 허용한다.
- 전환 저장소에는 route locator만 둔다. auth object, member data, command body, receipt payload는 저장하지 않는다.
- `pending`은 기본 30초 timeout(기존 domain 계약이 더 짧으면 그 값)에 도달하면 `unknown-outcome`으로 전환한다. 자동 command 재실행은 금지한다.
- Receipt가 있는 L2/L3는 같은 command/receipt identity로, receipt가 필수가 아닌 L1은 authoritative state/history 재조회로 수렴한다.
- Query module은 mutation execution과 cache publication/invalidation 함수를 계속 소유한다. Registering route/controller는 `settle(...) === "accepted"` 뒤 그 publisher 호출만 승인하며 QueryClient write policy를 route에 복제하지 않는다. Default `onSuccess` publication을 settlement 이전에 실행하는 현재 factory는 observation-only execution + explicit query-owned publisher로 분리한다.
- 긴급 공개 회수의 server command semantics, capability, safe-command/idempotency, production fail-closed activation은 바꾸지 않는다. Frontend adapter는 server wire에 맞춰 `PRIVATE_DATA|LEGAL_REQUEST|SECURITY_INCIDENT|PUBLIC_SAFETY`, `confirmEnabled`, `activationBoundary`, `remoteCopyLimitation`, `reasonRedacted`, `bffEvictionOutcome`, `cdnPurgeOutcome`, `browserRevalidationOutcome`을 사용하고 server가 내리지 않는 `committedClubGeneration`/`limitationCode`나 존재하지 않는 convergence GET/retry route를 가정하지 않는다.
- Today 1차 action은 `확인함`, `잠시 미룸`, `처리함`뿐이다. 현재 전송되지 않는 사유 입력과 사실상 7일 snooze인 `무시`, 서버 계약이 없는 `병합`은 제거한다.
- `/admin/**`와 `?onboarding=1` deep link를 유지한다. 새 `/admin-v2`를 만들지 않는다.
- Support는 `클럽 관리`, notifications/AI는 `서비스 상태`, audit/analytics는 `처리 기록` active-nav를 사용한다.
- 본문 max width는 1240px다. Today persistent split은 content width 960px 이상에서 queue 최소 340px/docket 최소 560px, 38:62다. 그 아래는 URL-addressable list/detail flow다.
- Mobile L3는 desktop handoff를 기본 UX로 제공하지만 viewport를 보안 경계로 사용하지 않는다.
- runtime font는 bundled Pretendard와 `--f-sans`만 사용한다. 별도 admin font/token을 만들지 않는다.
- 정상은 무채색이다. 색만으로 상태를 전달하지 않으며 raw enum, ID, 특정 club 콘텐츠는 disclosure 밖의 1급 정보로 올리지 않는다.
- 허구 fixture만 사용한다. 실제 이메일, 회원 데이터, private domain, secret, deployment state를 source·snapshot·docs에 넣지 않는다.
- 구현 task commit은 stage별로 작게 유지한다. push, merge, deploy는 이 계획의 권한이 아니다.

## Delivery Order And Dependencies

```text
Stage 0 baseline
  ↓
Stage 1 availableSpaces v1 server projection
  ↓
Stage 2 global transition model + two-level switcher
  ↓
Stage 3.1–3.3 admin shell/IA/copy contract
  ↓
Stage 4.1 honest Today actions
  ↓
Stage 3.4 shell visual contract
  ↓
Stage 4.2–4.3 Today workflow
  ├─→ Stage 5 club management
  ├─→ Stage 6 service status
  └─→ Stage 7 processing records
          ↓
Stage 8 whole-product proof + ADR acceptance
```

Stage 5–7은 Stage 3/4의 shared visual primitives가 고정된 뒤 서로 다른 route/UI/test와 page-specific CSS owner로 병렬 실행할 수 있다. `admin-editorial-ledger.css`, `admin-copy.ts`, `admin-route-catalog.ts`, `admin-editorial-ledger.ct.tsx`, shared fixture는 한 integration owner만 수정한다.

## Acceptance Matrix Selection

| Row | 선택 이유 | 증거 |
| --- | --- | --- |
| Actor or authorization | platform/member/host 겸임, capability loss, direct URL | server auth projection tests + route/E2E denied path |
| Club context | `내 클럽` 전환과 URL-authoritative slug | server projection isolation + multi-club route/E2E |
| BFF or OAuth | `/api/auth/me`가 same-origin BFF를 통과하고 safe return target을 사용 | auth/BFF contract + browser return-target tests; generic proxy code는 변경하지 않음 |
| Cursor collection | Today queue와 audit cursor를 유지한 채 UI/selection을 바꿈 | empty/first/continuation/last, invalid cursor, dedupe/no-gap, selection/focus tests |
| UI or runtime state | 네 운영 화면과 mobile/list-detail 상태 | unit/route/CT/E2E at selected viewports |
| Async, cache, or provider | pending/unknown outcome, health partial/unavailable | transition controller + domain recovery tests |
| Emergency public takedown | frontend/server wire 정합화, fail-closed activation, same-identity response-loss lookup | shared server-shaped fixture + frontend strict parser + server integration + zero-replay authority-loss test |

제외:

- Guest/public exposure, guest DTO privacy: public/guest projection을 바꾸지 않는다.
- Persistence or migration: Stage 1은 기존 auth lookup을 additive DTO로 조합하며 schema 변경이 없다.
- Emergency public takedown server command semantics: capability, confirm activation, idempotency, origin mutation과 provider convergence 정책은 바꾸지 않는다. 깨진 frontend wire adapter와 존재하지 않는 client convergence 호출은 명시적으로 교정한다.
- Public projection convergence와 host-client rollout: 기존 behavior를 회귀 검증하지만 이 계획에서 계약을 변경하지 않는다.

---

## Stage 0 — Baseline And File Ownership

### Task 0.1: 실행 기준과 baseline을 고정한다

**Files:**

- Read: `AGENTS.md`, `front/AGENTS.md`, `server/AGENTS.md`, `docs/agents/{execution,front,server,design}.md`
- Read: `docs/development/{architecture,acceptance-matrix,vertical-slice-checklist}.md`
- Read: ADR-0019, ADR-0030, ADR-0035, ADR-0039, ADR-0040, ADR-0045, ADR-0050, ADR-0051
- Record progress in this plan only; do not change active architecture yet.

**Steps:**

Execution baseline receipt (2026-08-30T04:47:33Z): `BASE_TIP=8ddb02cdb21067cb58ad9e900850851599d1cdd9`, integration commit `7a97f17d352a73e2602e3798f0197a79bfea7022`. `git merge-base --is-ancestor "$BASE_TIP" HEAD` passed immediately after integration. The branch name moving later does not replace this immutable execution baseline.

Post-integration inventory ruling: the base adds `fetchHostOperatingRoomCurrent` / `hostOperatingRoomCurrentQuery` as a read-only dashboard source and rewires `host-dashboard-route.tsx` composition/tests without adding a new mutation factory. Existing attendance/restore producers remain owned by the dashboard route and the existing host session/recovery query factories. Task 2.4 must still regenerate the repository-wide reachable-write candidate set from the integrated tree; this receipt is not a substitute for that executable scan.

- [ ] Run `git status --short --branch --untracked-files=all` and stop if user changes overlap the stage files.
- [ ] Set `BASE_TIP=8ddb02cdb21067cb58ad9e900850851599d1cdd9` from the immutable execution receipt above; do not resolve `codex/host-lifecycle-operating-room` again. Require only `git merge-base --is-ancestor "$BASE_TIP" HEAD`. If it fails, stop product implementation and diagnose corruption of the recorded integration; later movement of the branch name is neither a new baseline nor a reason to integrate unrelated commits.
- [ ] After the recorded base tip is an ancestor of `HEAD`, rerun path/interface/producer inventory against the integrated tree. At minimum re-open `host-dashboard-route.tsx`, `host-session-queries.ts`, their tests, and every Task 2.4 scan root; record additions/removals and update this plan before SDD. Because integration changes repository reality, rerun the full `pre-sdd-review` on the new HEAD and final plan hash before the first product-code edit.
- [ ] Run preflight with all expected frontend/server/docs paths and record any stop reason.
- [ ] Confirm launcher: use `corepack pnpm` when available; otherwise use `npx --yes corepack@0.35.0 pnpm`. Record the exact launcher in the execution ledger.
- [ ] Run baseline focused tests for auth, workspace routes, admin shell/Today, frontend boundaries, server architecture. A baseline failure is recorded before product edits and is not silently attributed to this program.
- [ ] Assign one integration owner for `admin-copy.ts`, `admin-route-catalog.ts`, `admin-editorial-ledger.css`, shared CT fixtures, ADR indexes, and active docs.

The current documentation HEAD is not accepted as an implementation baseline merely because this plan is committed. Stage 0 is a hard gate: base integration, fresh inventory, and a fresh READY pre-SDD receipt must all precede Stage 1.

**Baseline commands:**

```bash
./server/gradlew -p server unitTest --tests '*AuthSessionServiceTest'
./server/gradlew -p server integrationTest --tests '*AuthMeControllerTest'
./server/gradlew -p server architectureTest
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  tests/unit/frontend-boundaries.test.ts \
  src/app/workspace-route-model.test.ts \
  src/app/layouts/app-route-layout.test.tsx \
  features/platform-admin/route/admin-shell-layout.test.tsx \
  features/platform-admin/route/admin-today-route.test.tsx
```

---

## Stage 1 — Server-Owned `availableSpaces v1`

### Task 1.1: application projection과 정책을 TDD로 추가한다

**Files:**

- Create: `server/src/main/kotlin/com/readmates/auth/application/model/AuthAccessProjection.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveAuthAccessProjectionUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/service/ResolveAuthAccessProjectionService.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/application/service/ResolveAuthAccessProjectionServiceTest.kt`
- Read only: `server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt`; its identity lookup methods and existing security consumers remain unchanged.

**Interface:**

```kotlin
enum class ProductSpaceKind { PLATFORM, CLUBS }
enum class ClubPerspective { MEMBER, HOST }

data class AvailableClubSpace(
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val perspectives: List<ClubPerspective>,
)

data class AvailableSpacesV1(
    val version: Int = 1,
    val kinds: List<ProductSpaceKind>,
    val clubs: List<AvailableClubSpace>,
)

data class RecommendedSpace(
    val kind: ProductSpaceKind,
    val clubId: UUID? = null,
    val perspective: ClubPerspective? = null,
)

data class AuthAccessProjection(
    val joinedClubs: List<JoinedClubSummary>,
    val platformAdmin: CurrentPlatformAdmin?,
    val availableSpaces: AvailableSpacesV1,
    val recommendedSpace: RecommendedSpace?,
)

interface ResolveAuthAccessProjectionUseCase {
    fun resolve(userId: UUID): AuthAccessProjection
}
```

**Policy:**

- `PLATFORM`: active `CurrentPlatformAdmin`이 있을 때만.
- `CLUBS`: `VIEWER|ACTIVE|SUSPENDED` membership이 하나 이상일 때.
- `MEMBER`: 위 readable membership에 제공.
- `HOST`: `role == HOST && status == ACTIVE`에만 제공.
- Wire order는 `PLATFORM, CLUBS`와 `MEMBER, HOST`로 고정하고 service에서 dedupe한다.
- Active host도 member view가 가능하므로 perspectives는 `MEMBER, HOST`다.
- `recommendedSpace`: PLATFORM이 있으면 platform semantic destination; 그렇지 않고 club이 하나면 그 club/member semantic destination; 여러 club이면 `null`. Application layer는 `/admin`이나 frontend href를 만들지 않는다.

**Steps:**

- [ ] RED: platform-only, member-only, viewer, suspended, active host, inactive/invited, mixed platform+multi-club matrix를 pure service test로 작성한다.
- [ ] RED: inactive club이 `CLUBS` kind나 perspective를 만들지 않고 host가 아닌 active member가 `HOST`를 얻지 않는 테스트를 확인한다.
- [ ] GREEN: projection model/use case/service가 `MemberIdentityLookupPort`와 `PlatformAdminLookupPort`를 직접 조합하고 web DTO, controller, frontend route string에 의존하지 않게 한다.
- [ ] Run focused application tests and architecture test.
- [ ] Commit: `feat(auth): project available product spaces`

### Task 1.2: `/api/auth/me`에 additive DTO를 연결한다

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthMeController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/DevLoginController.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/DevLoginControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify fixtures that construct `AuthMemberResponse` directly, found by `rg 'AuthMemberResponse\(' server/src/test`.

**Wire contract:**

```json
{
  "availableSpaces": {
    "version": 1,
    "kinds": ["PLATFORM", "CLUBS"],
    "clubs": [
      {
        "clubId": "00000000-0000-0000-0000-000000000001",
        "clubSlug": "sample-club",
        "clubName": "샘플 클럽",
        "perspectives": ["MEMBER", "HOST"]
      }
    ]
  }
}
```

**Steps:**

- [ ] RED: every authenticated controller branch returns the same access projection for the same user, including unscoped, host-fallback, requested-club-not-member, and platform-only paths.
- [ ] RED: anonymous response returns version 1 with empty `kinds/clubs`; existing fields retain their current values.
- [ ] GREEN: inject `ResolveAuthAccessProjectionUseCase` once per known `userId`, pass the projection into auth/dev-login DTO mapping, and map semantic `recommendedSpace` to compatibility `recommendedAppEntryUrl` only in the web adapter.
- [ ] RED/GREEN: `cloudflare-bff.test.ts` proves generic Pages Functions proxy preserves additive `/api/auth/me` JSON while stripping only the existing internal headers; do not edit BFF production code.
- [ ] Run `./server/gradlew -p server integrationTest --tests '*AuthMeControllerTest' --tests '*DevLoginControllerTest'`, `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts`, then `./scripts/server-ci-check.sh`.
- [ ] Commit: `feat(auth): expose available spaces v1`

### Task 1.3: frontend contract를 additive로 수용한다

**Files:**

- Modify: `front/shared/auth/auth-contracts.ts`
- Modify: `front/src/app/auth-state.ts`
- Modify: `front/src/app/auth-context.tsx`
- Modify: `front/shared/auth/member-app-loader.ts`
- Modify: `front/shared/auth/platform-admin-loader.ts`
- Modify: `front/features/host/route/host-loader-auth.ts`
- Modify: `front/features/guest-browse/route/club-app-audience-loader.ts`
- Modify: `front/features/club-selection/route/club-selection-data.ts`
- Read only: `front/shared/ui/public-auth-action-state.ts`; it remains an `authenticated`-only public probe and cannot feed product-space UI.
- Modify: `front/tests/unit/auth-context.test.tsx`
- Modify: `front/features/host/route/host-loader-auth.test.ts`
- Modify: `front/features/guest-browse/route/guest-route-data.test.ts`
- Create: `front/features/club-selection/route/club-selection-data.test.ts`
- Modify: `front/tests/unit/api-contract-fixtures.ts`
- Modify representative E2E auth fixtures in `front/tests/e2e/admin-editorial-ledger-e2e-fixtures.ts` and `front/tests/e2e/aigen-test-fixtures.ts`.
- Create: `front/shared/auth/available-spaces.ts`
- Create: `front/shared/auth/available-spaces.test.ts`

**Type and fallback:**

```ts
export type ProductSpaceKind = "PLATFORM" | "CLUBS";
export type ClubPerspective = "MEMBER" | "HOST";
export type AvailableSpacesV1 = {
  version: 1;
  kinds: ProductSpaceKind[];
  clubs: Array<{
    clubId: string;
    clubSlug: string;
    clubName: string;
    perspectives: ClubPerspective[];
  }>;
};

// Additive rollout contract
export type AuthMeResponse = {
  // existing fields remain required as today
  availableSpaces?: AvailableSpacesV1;
};
```

- Missing projection: platform is visible only when `platformAdmin != null`; joined-club member fallback accepts only the existing readable statuses; joined-club host fallback additionally requires `role === HOST`, `status === ACTIVE`, and derived `approvalState === ACTIVE`.
- Unknown version or malformed entry: ignore that entry; never infer a broader destination.
- 모든 `AuthMeResponse` JSON ingress는 auth를 loader/context state에 넣기 전에 같은 normalizer를 호출한다.
- Server projection is navigation visibility, not action authorization.

**Current auth ingress inventory:**

| Ingress | Classification | Required proof |
| --- | --- | --- |
| `src/app/auth-context.tsx` | modify — unscoped app context | malformed/unknown version fail-closed |
| `shared/auth/member-app-loader.ts` | modify — member scoped loader | selected club and fallback normalization |
| `shared/auth/platform-admin-loader.ts` | modify — platform scoped loader | platform-only and mixed-authority normalization |
| `features/host/route/host-loader-auth.ts` | modify — public and authenticated host loaders | both fetch branches normalize before capability guard |
| `features/guest-browse/route/club-app-audience-loader.ts` | modify — guest/member/host audience loader | normalized auth drives audience without broadening access |
| `features/club-selection/route/club-selection-data.ts` | modify — club picker redirect loader | malformed projection cannot create a redirect |
| `shared/ui/public-auth-action-state.ts` | verified-no-change — reads only `authenticated` probe and never supplies a shell/switcher | source assertion keeps probe type narrow and forbids `AvailableSpacesV1` consumption |

**Steps:**

- [ ] RED: v1 parse, missing-field fallback, unknown version, malformed club ID/slug/perspective, inactive host, duplicate club/perspective normalization.
- [ ] RED: table-driven ingress test proves every inventory row is classified; each `modify` path invokes the common normalizer, and the status-only probe remains structurally unable to feed the switcher.
- [ ] GREEN: implement a pure normalized projection helper; href는 `global-space.ts` route registry가 normalized club slug와 perspective로만 만든다.
- [ ] Update the listed auth/E2E fixtures additively without weakening existing auth-state tests.
- [ ] Run focused auth and contract tests.
- [ ] Commit: `feat(front): consume available spaces projection`

---

## Stage 2 — Global Space Transition And Two-Level Switcher

### Task 2.1: destination, correspondence, continuity model을 분리한다

**Files:**

- Create: `front/shared/model/global-space.ts`
- Create: `front/shared/model/global-space.test.ts`
- Create: `front/shared/ui/space-transition-safety-context.tsx`
- Create: `front/shared/ui/space-transition-safety-context.test.tsx`
- Create: `front/src/app/global-space-continuity.ts`
- Create: `front/src/app/global-space-continuity.test.ts`
- Create: `front/src/app/global-space-transition.ts`
- Create: `front/src/app/global-space-transition.test.ts`
- Modify: `front/src/app/workspace-route-model.ts`
- Modify: `front/src/app/workspace-route-continuity.ts` to read legacy keys without deleting them; removal is outside this program.

**Model:**

```ts
type ProductSpace = "platform" | "clubs";
type ClubPerspective = "member" | "host";
type SpaceIdentity =
  | { productSpace: "platform" }
  | { productSpace: "clubs"; clubId: string; clubSlug: string; perspective: ClubPerspective };

type ReturnTarget = {
  pathname: string;
  search: string;
  hash: string;
  focusId: string | null;
  scrollTop: number;
};

type TransitionSafety =
  | { kind: "clean" }
  | { kind: "dirty"; message: string }
  | { kind: "pending"; ownerId: string; operationId: string; generation: number; startedAt: number; timeoutAt: number; recovery: RecoveryStrategy }
  | { kind: "unknown-outcome"; operationId: string; generation: number; recovery: RecoveryStrategy };

const DEFAULT_TRANSITION_PENDING_TIMEOUT_MS = 30_000;

type ReceiptRecoveryCapsule = {
  operationId: string;
  // A domain-owned closure may retain the already-issued immutable canonical
  // replay request in a private in-memory slot. It is never persisted or exposed.
  reconcileOriginal: () => Promise<RecoveryObservation>;
  invalidateForAuthorityLoss: () => void;
  clear: () => void;
};

type RetiredReceiptCapsuleRegistry = {
  retain: (ownerId: string, generation: number, capsule: ReceiptRecoveryCapsule) => () => void;
  invalidateAndClearAll: () => void;
  size: () => number;
};

type RecoveryStrategy =
  | { kind: "receipt"; capsule: ReceiptRecoveryCapsule }
  | { kind: "authoritative-history"; operationId: string; reconcile: () => Promise<RecoveryObservation> };

type RecoveryObservation = {
  operationId: string;
  outcome: "succeeded" | "failed" | "still-unknown" | "authority-lost";
};

type PendingRegistration = {
  ownerId: string;
  operationId: string;
  recovery: RecoveryStrategy;
  timeoutMs?: number;
};

type PendingHandle = {
  generation: number;
  settle: (result: "succeeded" | "failed") => Promise<"accepted" | "obsolete">;
  unregister: () => void;
};

type TransitionSafetyRegistrationPort = {
  registerDirty: (ownerId: string, message: string) => () => void;
  beginPending: (registration: PendingRegistration) => PendingHandle;
};

function normalizePendingTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TRANSITION_PENDING_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("INVALID_TRANSITION_TIMEOUT");
  return Math.min(timeoutMs, DEFAULT_TRANSITION_PENDING_TIMEOUT_MS);
}
```

`beginPending`가 operation identity와 detached recovery capsule을 함께 보관한다. timeout은 `normalizePendingTimeout`을 거쳐 기본/최대 30초이며 더 짧은 기존 domain 값만 그대로 사용한다. timeout은 새 callback을 찾지 않고 같은 registration을 `unknown-outcome`으로 승격한다. `settle`은 active registration token과 현재 generation이 모두 일치할 때만 caller가 current UI/cache/return target을 갱신할 수 있도록 `"accepted"`를 반환한다.

Recovery는 두 단계다. (1) authoritative-history strategy는 operation identity로 uncached read만 수행한다. Receipt strategy의 domain-owned capsule은 이미 보낸 immutable canonical request와 idempotency identity를 private in-memory slot에 한시 보유해 ADR-0040 replay lookup만 수행한다. 두 strategy 모두 identity+outcome만 반환하고 query cache/UI를 쓰지 않는다. (2) app coordinator의 generation-checked sink는 current owner/token/generation과 최신 authority가 모두 일치할 때만 별도 current-owner refetch를 허용한다. Obsolete response payload와 obsolete recovery observation은 UI/cache/return target에 절대 publish하지 않는다.

`unregister`/unmount는 먼저 해당 registration token을 tombstone 처리하고 owner generation을 증가시킨 뒤 public state와 timer를 제거한다. 이미 반환된 handle의 operation identity와 side-effect-free receipt capsule은 handle-local reference만으로 숨지 않고 coordinator-owned retired registry에도 등록되어 settlement/detached reconciliation 또는 명시적 clear까지 authority-loss purge가 열거할 수 있어야 한다. 늦은 `settle`은 반드시 `"obsolete"`다. Normal unmount 뒤 receipt reconciliation은 capsule의 original canonical request로 최대 한 번 수행하고, success/failure/throw 모두 `finally`에서 `clear()`와 retired-registry removal을 수행해 request/body/key reference를 지운다. Capsule은 serialized transition state, session storage, Query cache, log, error payload, UI prop, or analytics event에 들어가지 않는다.

Authority loss는 다르게 처리한다. Active registration과 retired registry의 모든 receipt capsule에 `invalidateForAuthorityLoss()`와 `clear()`를 동기적으로 먼저 호출하고 registry/token/timer/draft/cache를 purge한 뒤 generation을 올린다. 이후 늦은 settlement/reconciliation은 network replay 없이 `authority-lost` observation만 반환하고 publication은 항상 거절된다. Authoritative-history read도 최신 authority check가 실패하면 request 없이 같은 outcome으로 끝난다. Unknown durable identity나 cleared capsule을 다른 owner/new generation에 붙이지 않는다.

**Route-owned return-target allowlist:**

| Route family | Preserve | Reject/validate | Invalid fallback |
| --- | --- | --- | --- |
| platform Today | `view,q,state,severity,source,assignee,case,mode` | enum/list values; `q` max 100; `case` must match loaded case; drop cursor | sanitized Today list; invalid detail becomes list |
| platform clubs list | `search,lifecycle,visibility,domainStatus,onboardingState,onboarding,focusId,scrollTop` | existing enum sets; `onboarding=1`; focus ID pattern; scroll 0…1,000,000; drop cursor | sanitized clubs list, no modal/focus when invalid |
| platform club detail | `returnTo,focusId,scrollTop` | same-origin `/admin/clubs` return only; existing ID/scroll bounds | `/admin/clubs` |
| platform support | `clubId,status` | existing identifier and support-status allowlists | support root with invalid key removed |
| platform notifications | `focus,clubId` | known focus enum and loaded/authorized club ID | notifications root |
| platform AI | `errorCode,clubId,jobId,window` | `errorCode`는 `^[A-Z][A-Z0-9_]{0,63}$`, `clubId/jobId`는 existing identifier grammar, `window`는 `7d|30d|90d`; no raw provider payload | AI root with safe filters only |
| platform audit | `range,from,to,clubId,actorRole,sourceSlice,actionCategory,outcome,event,mode,target` | reuse `SAFE_AUDIT_PARAMS`, instant/ID/event validation, no duplicates | audit list with safe filters |
| platform analytics | `window` | existing window enum | default 30d |
| member archive `/app/archive` | `view` | reuse `archiveViewFromSearchParam`; drop cursor/load-more state | archive root/default view |
| member notes `/app/notes` | `filter,sessionId` | reuse `feedFilterFromSearchParam`; `sessionId` must exist in freshly loaded club note sessions; drop cursor/load-more state | notes root/all filter |
| member current session, notifications, settings, my page | none | reject every search/hash key; route/path identity is sufficient | corresponding route root |
| host meeting detail/editor | `task,section,source,records,aigen` | reuse `parseHostMeetingLocation`; reject duplicates and contradictory legacy/canonical evidence | selected club host meeting overview |
| host meeting/record ledgers | `view,search,recordStatus,needsAttention` | reuse `normalizeHostSessionLedgerFilters`; normalized `search` max 100; reject duplicates; no cursor | selected club host ledger root |
| host notifications | `sessionId,eventType` | `sessionId` must exist in freshly loaded host session list; `eventType` must be a current `HostNotificationEventType`; reject duplicates | host notifications root with first valid session |
| host members, invitations, dashboard, AI defaults | none | reject every search/hash key not owned by a later explicit table row | corresponding host route root |

No hash is preserved unless the owning route adds a named, test-covered target to this table. `focusId` is restored only after the target exists in the freshly loaded result; otherwise focus moves to the page heading. Tests are table-driven for every row and cover allowed, unknown, duplicated, cross-club, oversized, and stale values.

**Steps:**

- [ ] RED: space+club+perspective별 full target 저장/복원, 위 route-family allowlist의 positive/rejection cases, unsafe absolute target rejection, stale projection purge, legacy pathname migration once.
- [ ] RED: member↔host correspondence, platform↔club last-safe target, unknown route fallback, authority-loss replace navigation.
- [ ] RED: undefined timeout gives 30,000ms, shorter positive domain timeout is retained, values above 30,000ms clamp to 30,000ms, and zero/negative/non-finite values throw `INVALID_TRANSITION_TIMEOUT`.
- [ ] RED: pending before timeout blocks and timeout converts to unknown. Late response after normal unmount returns `obsolete`, runs at most one original-identity detached receipt lookup, clears its capsule in `finally`, rejects publication, and cannot update UI/cache/return target. Authority loss returns `obsolete`/`authority-lost`, clears the canonical replay request before any recovery callback, performs zero replay requests, and cannot publish.
- [ ] RED: exact interleaving `beginPending → unregister/unmount → authority loss → late settlement/reconciliation`을 실행한다. Original request count는 그대로 1, replay count는 0, observation은 `authority-lost`, UI/cache/receipt callback/success·error copy/navigation/return target/sessionStorage publication은 각각 0, retained `previewId/reasonCategory/reason/idempotencyKey`는 모두 clear, retired capsule registry size는 0이어야 한다. Normal unmount의 same-identity lookup(최대 1회, original bytes, `finally` clear)과 authority-loss zero-replay는 서로 다른 test로 검증한다.
- [ ] GREEN: pure model and versioned session storage adapter를 구현한다.
- [ ] Persist only `ReturnTarget`; pending/unknown state remains in memory. A normal-unmount handle may retain only operation identity plus a typed receipt capsule's already-issued immutable canonical replay request until one detached reconciliation finishes, then must clear it in `finally`. No auth object, response payload, receipt body, cache writer, or canonical request is serialized or published. Authority loss clears the capsule immediately and permits no replay.
- [ ] Shrink `workspace-route-model.ts` to club route correspondence helpers; do not add more product-space regex branches to it.
- [ ] Run `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/model/global-space.test.ts shared/ui/space-transition-safety-context.test.tsx src/app/global-space-continuity.test.ts src/app/global-space-transition.test.ts` and require PASS.
- [ ] Commit: `refactor(app): model global space transitions`

### Task 2.2: app-owned transition coordinator를 구현한다

**Files:**

- Create: `front/src/app/global-space-transition-controller.tsx`
- Create: `front/src/app/global-space-transition-controller.test.tsx`
- Modify: `front/src/app/host-authority-loss-controller.tsx`
- Modify: `front/src/app/host-authority-loss-controller.test.tsx`
- Modify: `front/src/app/app-route-security-controller.tsx`
- Modify: `front/src/app/app-route-security-controller.test.tsx`
- Modify: `front/src/app/auth-state.ts`
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/src/app/layouts/club-app-route-layout.tsx`
- Modify: `front/src/app/routes/admin.tsx`
- Create: `front/src/app/routes/admin.test.tsx`

**Steps:**

- [ ] RED: clean navigation, dirty confirm/cancel, pending block, timeout→unknown recovery, authority-loss cache/draft purge and replace navigation.
- [ ] RED: exercise the real emitted-host-authority-loss ingress with `beginPending → unregister/unmount → authority loss → late settlement/reconciliation`. Pause the asynchronous purge and prove a synchronous coordinator pre-purge callback has already invalidated the operation generation and cleared both active and retired receipt capsules. Then require `authority-lost`, original request count 1, replay 0, Query cache/UI/receipt callback/success·error copy/navigation/return-target/sessionStorage publication 0, all retained canonical request fields clear, and retired registry size 0. Keep the normal-unmount same-identity lookup in a separate test.
- [ ] RED: restore revalidates latest auth projection and route allowlist before navigation.
- [ ] GREEN: app root owns router navigation/blocker/storage and injects rendered switcher props and a shared safety-registration port into member/host/admin shells. `routes/admin.tsx` supplies the port to `AdminShellLayout`; platform-admin never imports `src/app`.
- [ ] Split `AppRouteLayout` space/club/perspective assembly into focused hooks/components; do not move route fetching into shared.
- [ ] Preserve ADR-0035's ordered flow as `synchronous generation/capsule invalidation → cancel → exact-club cache/draft purge → safe replace → alert/focus`. `host-authority-loss-controller.tsx` must invoke the coordinator callback before its first `await`; `app-route-security-controller` must not defer that clear-first step until `onHandled` after purge.
- [ ] Commit: `feat(app): coordinate safe space transitions`

### Task 2.3: shared two-level switcher를 모든 shell에 연결한다

**Files:**

- Create: `front/shared/ui/global-space-switcher.tsx`
- Create: `front/shared/ui/global-space-switcher.test.tsx`
- Modify: `front/shared/ui/app-club-shell.tsx`
- Modify: `front/shared/model/app-club-shell.ts`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Delete after migration: `front/features/platform-admin/model/admin-workspace-switcher-model.ts`
- Delete after migration: `front/features/platform-admin/ui/admin-workspace-switcher.tsx`
- Delete after coverage migration: `front/features/platform-admin/model/admin-workspace-switcher-model.test.ts`
- Delete after coverage migration: `front/features/platform-admin/ui/admin-workspace-switcher.test.tsx`
- Modify: `front/shared/ui/app-club-shell.test.tsx`
- Modify: `front/shared/ui/workspace-selector.test.tsx`

**Interaction:**

- First level: `플랫폼 운영`, `내 클럽` from allowed subset.
- Second level under `내 클럽`: club then `멤버로 보기` / `호스트로 운영`.
- Account label/login action remains outside the space menu.
- One allowed kind: switcher hidden; current space label remains available to assistive technology.
- Menu: arrow/home/end, Escape, outside click, focus return, 44px targets.

**Steps:**

- [ ] RED: five authority combinations, one-kind hidden state, multi-club/perspective grouping, keyboard/focus behavior, Korean accessible names.
- [ ] GREEN: implement props-only shared UI and app-owned callbacks.
- [ ] Move every assertion from the two deleted admin switcher tests into `global-space-switcher.test.tsx`, `app-club-shell.test.tsx`, or `routes/admin.test.tsx`; do not delete behavior coverage.
- [ ] Remove raw role/status badges from the space menu.
- [ ] Run frontend boundary test and focused shell tests.
- [ ] Commit: `feat(shell): unify platform and club space switching`

### Task 2.4: 기존 workflow의 실제 dirty/pending/unknown producer를 등록한다

**Files:**

- Create: `front/src/app/space-transition-producer-inventory.ts`
- Create: `front/src/app/space-transition-producer-inventory.test.ts`
- Modify: `front/features/platform-admin/api/platform-admin-takedown-contracts.ts`
- Modify: `front/features/platform-admin/api/platform-admin-takedown-contracts.test.ts`
- Modify: `front/features/platform-admin/api/platform-admin-takedown-api.ts`
- Create: `front/features/platform-admin/api/platform-admin-takedown-api.test.ts`
- Modify: `front/features/platform-admin/model/platform-admin-takedown-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-takedown-model.test.ts`
- Modify: `front/features/platform-admin/ui/admin-public-takedown-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-public-takedown-workbench.test.tsx`
- Create: `front/tests/unit/__fixtures__/platform-admin-takedown-preview.server.json`
- Create: `front/tests/unit/__fixtures__/platform-admin-takedown-receipt.server.json`
- Modify: `server/src/test/kotlin/com/readmates/admin/takedown/api/PlatformAdminPublicTakedownIntegrationTest.kt`
- Modify: `front/tests/e2e/platform-admin-public-takedown.spec.ts`
- Modify: `front/tests/e2e/platform-admin-public-convergence.spec.ts`
- Modify: `front/features/archive/route/account-settings-route.tsx`
- Modify: `front/features/archive/route/profile-update-controller.ts`
- Modify: `front/features/current-session/route/current-session-route.tsx`
- Modify: `front/features/notifications/route/member-notification-settings-route.tsx`
- Modify: `front/features/notifications/route/member-notifications-route.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Modify: `front/features/host/aigen/ui/RegenerateModal.tsx`
- Modify: `front/features/host/aigen/ui/PreviewView.tsx`
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
- Modify: `front/features/host/route/host-operations-route.tsx`
- Modify: `front/features/host/ui/host-operations-page.tsx`
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Modify: `front/features/host/route/host-meeting-ledger-route.tsx`
- Modify: `front/features/host/route/host-meeting-workspace-actions.ts`
- Modify: `front/features/host/route/host-meeting-workspace-route.tsx`
- Modify: `front/features/host/route/host-members-route.tsx`
- Modify: `front/features/host/route/host-invitations-route.tsx`
- Modify: `front/features/host/route/host-notification-composer-controller.tsx`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/route/host-session-ledger-route.tsx`
- Modify: `front/features/host/ui/host-invitations.tsx`
- Modify: `front/features/host/ui/host-members.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-workspace.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- Modify: `front/features/host/route/host-draft-route-navigation-guard.ts`
- Modify: `front/features/host/hooks/use-session-record-draft-controller.ts`
- Modify: `front/features/host/route/host-session-editor-route.test.tsx`
- Modify: `front/features/host/route/new-host-meeting-route.tsx`
- Modify: `front/features/host/route/new-host-meeting-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-notifications-route.tsx`
- Modify: `front/features/platform-admin/route/admin-notifications-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx`
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-public-takedown-route.tsx`
- Modify: `front/features/platform-admin/route/admin-public-takedown-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/shared/auth/club-access-query.ts`
- Modify: `front/features/notifications/route/member-notifications-data.ts`
- Modify: `front/features/host/route/host-members-data.ts`
- Modify: `front/features/host/route/host-invitations-data.ts`
- Modify: `front/features/host/route/host-session-editor-actions.ts`
- Modify: `front/features/archive/queries/profile-queries.ts`
- Modify: `front/features/current-session/queries/current-session-queries.ts`
- Modify: `front/features/host/aigen/queries/aigen-job-queries.ts`
- Modify: `front/features/host/queries/host-invitation-queries.ts`
- Modify: `front/features/host/queries/host-members-queries.ts`
- Modify: `front/features/host/queries/host-notification-queries.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/queries/host-session-record-queries.ts`
- Modify: `front/features/host/queries/host-session-recovery-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-notifications-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-operations-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-support-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-takedown-queries.ts`
- Modify: `front/features/archive/route/profile-update-controller.test.tsx`
- Modify: `front/features/archive/route/account-settings-route.test.tsx`
- Modify: `front/features/current-session/route/current-session-route.test.tsx`
- Modify: `front/features/notifications/route/member-notification-settings-route.test.tsx`
- Create: `front/features/notifications/route/member-notifications-route.test.tsx`
- Create: `front/features/notifications/route/member-notifications-data.test.ts`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.test.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.draft-restoration.test.tsx`
- Modify: `front/features/host/aigen/ui/RegenerateModal.test.tsx`
- Create: `front/features/host/aigen/ui/PreviewView.test.tsx`
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.test.tsx`
- Modify: `front/features/host/route/host-operations-route.test.tsx`
- Create: `front/features/host/ui/host-operations-page.test.tsx`
- Modify: `front/features/host/route/host-dashboard-route.test.tsx`
- Modify: `front/features/host/route/host-meeting-ledger-route.test.tsx`
- Create: `front/features/host/route/host-meeting-workspace-actions.test.tsx`
- Modify: `front/features/host/route/host-meeting-workspace-route.test.tsx`
- Modify: `front/features/host/route/host-notification-composer-controller.test.tsx`
- Create: `front/features/host/route/host-notifications-route.test.tsx`
- Create: `front/features/host/route/host-session-ledger-route.test.tsx`
- Create: `front/features/host/ui/host-invitations.test.tsx`
- Create: `front/features/host/ui/host-members.test.tsx`
- Create: `front/features/host/ui/host-session-editor-transition-safety.test.tsx`
- Create: `front/features/host/route/host-members-data.test.ts`
- Modify: `front/features/host/route/host-invitations-data.test.ts`
- Create: `front/features/host/route/host-session-editor-actions.test.ts`
- Create: `front/features/host/route/host-members-route.test.tsx`
- Create: `front/features/host/route/host-invitations-route.test.tsx`
- Modify: `front/features/host/ui/meeting-ledger/upcoming-book-list.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-workspace.test.tsx`
- Create: `front/features/host/ui/session-editor/session-record-completion-panel.test.tsx`
- Modify: `front/tests/unit/frontend-boundaries.test.ts`
- Modify: `front/features/platform-admin/ui/domain-provisioning-panel.test.tsx`
- Modify: `front/shared/auth/club-access-query.test.ts`
- Modify: `front/src/app/layouts/app-route-layout-club-access.test.tsx`
- Modify: `front/features/archive/queries/profile-queries.test.tsx`
- Modify: `front/features/current-session/queries/current-session-queries.test.tsx`
- Modify: `front/features/host/aigen/queries/aigen-job-queries.test.tsx`
- Modify: `front/features/host/queries/host-invitation-queries.test.ts`
- Modify: `front/features/host/queries/host-members-queries.test.ts`
- Modify: `front/features/host/queries/host-notification-queries.hooks.test.tsx`
- Modify: `front/features/host/queries/host-session-queries.hooks.test.tsx`
- Modify: `front/features/host/queries/host-session-record-queries.test.tsx`
- Modify: `front/features/host/queries/host-session-recovery-queries.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-notifications-queries.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-operations-queries.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-queries.test.tsx`
- Create: `front/features/platform-admin/queries/platform-admin-support-queries.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-takedown-queries.test.tsx`
- Read only: `front/features/host/ui/meeting-ledger/upcoming-book-list.tsx`, `front/features/host/ui/session-editor/session-record-workspace.tsx`, `front/features/platform-admin/ui/domain-provisioning-panel.tsx`; these invoke owner-supplied callbacks only and must not import write APIs or register separately.
- Read only: `front/features/host/actions/invitations.ts`, `front/features/current-session/actions/{save-checkin,save-question,save-review,update-rsvp}.ts`; these are direct write exports currently outside the mounted app graph. Inventory evidence must prove no production import path reaches them, and any new mounted consumer must fail the manifest until it is classified and registered.

**Registration matrix:**

| Current producer files | Classification | State and recovery |
| --- | --- | --- |
| `archive/route/account-settings-route.tsx` | register | leave-membership pending/unknown L2; latest auth/membership authoritative refetch; authority loss wins |
| `archive/route/profile-update-controller.ts`, `current-session/route/current-session-route.tsx` | register | dirty form where present; pending L1; current profile/session authoritative refetch |
| `notifications/route/member-notification-settings-route.tsx`, `notifications/route/member-notifications-route.tsx` | register | settings dirty/pending and mark-read pending L1; latest preferences/notification page refetch |
| `host/route/host-session-editor-route.tsx`, `host/route/host-meeting-workspace-route.tsx` → `host/ui/host-session-editor.tsx` → `host/ui/session-editor/{session-record-workspace,session-record-completion-panel}.tsx` → `host/aigen/ui/{AiGenerateTab,PreviewView,RegenerateModal}.tsx` | register route owners → prop/callback presentation chain | the two route/controller owners execute and register dirty draft plus start/cancel/commit/regenerate pending; query-owned publishers run only after accepted settlement. Every downstream UI file imports no query/API/router and only invokes injected callbacks; job/status authoritative recovery or existing job identity remains route-owned |
| `host/route/host-operations-route.tsx` → `host/ui/host-operations-page.tsx` → `host/club/ui/ClubAiDefaultsSection.tsx` | register route owner → prop/callback presentation chain | the route owns AI-default query/mutation execution, pending L1 registration, and accepted-only query-owned publication; both UI layers render injected state/callbacks and import no query/API/router. Club/session authoritative refetch remains the recovery source |
| `host/route/host-members-route.tsx` → `host/ui/host-members.tsx` | register composer→owner chain | composer injects classified member/invitation factories; member profile/lifecycle uses its existing response/conflict contract; invitation operations follow the L1 rule below |
| `host/route/host-invitations-route.tsx` → `host/ui/host-invitations.tsx`, plus the invitation section inside `host/ui/host-members.tsx` | register composer→owner chains | create/reissue/revoke are conservative L1 because current requests expose no idempotency or receipt identity. Response loss yields `still-unknown`, never auto-replays, and detached observation uses uncached `listInvitations`; cache-writing `refreshInvitations` is allowed only after the owner's handle settles `"accepted"` |
| `host/route/host-meeting-ledger-route.tsx`, `host/route/host-meeting-workspace-actions.ts`, `host/route/host-meeting-workspace-route.tsx`, `host/route/host-session-editor-route.tsx`, `host/ui/host-session-editor.tsx`, `host/route/host-session-ledger-route.tsx`, `host/route/new-host-meeting-route.tsx` | register through the shared host workflow adapter | dirty draft and pending L1/L2; history/receipt recovery already owned by each command |
| `host/route/host-notification-composer-controller.tsx`, `host/route/host-notifications-route.tsx` | register through the shared notification workflow adapter | dirty preview; pending/unknown L3; same dispatch/receipt identity |
| `notifications/route/member-notifications-data.ts`, `host/route/host-members-data.ts`, `host/route/host-invitations-data.ts`, `host/route/host-session-editor-actions.ts` | modify factory + register owner chain | execution returns an observation only. Invalidation, `setQueryData`, row/UI update, refetch, receipt callback, success/error copy, and navigation are explicit publication functions invoked only after the registering owner's `settle(...)` returns `"accepted"`. For invitations, `listInvitations` is the detached no-cache observation path and `refreshInvitations` remains an accepted-owner-only cache writer |
| `host/ui/meeting-ledger/upcoming-book-list.tsx`, `host/ui/session-editor/session-record-workspace.tsx`, `platform-admin/ui/domain-provisioning-panel.tsx` | verified-no-change leaf delegates | call only an owner-supplied callback; source/test assertions forbid direct write API imports and map each callback to its registering route owner |
| the 15 exact `*/queries/*-queries.ts` files listed in Files | modify factory + register owner chain | remove automatic `onSuccess`/`onError` cache writes, invalidation, refetch, receipt callbacks, and user-visible publication. Mutation execution returns domain observation only; an explicit publisher owned by the current route/controller may run after `"accepted"`. Factory tests prove mutation completion alone is side-effect-free and owner tests prove accepted settlement publishes exactly once |
| `platform-admin/api/platform-admin-takedown-{contracts,api}.ts`, `model/platform-admin-takedown-model.ts`, `queries/platform-admin-takedown-queries.ts`, takedown route/UI | modify wire adapter + factory + register owner chain | align strict preview/receipt parsing to the current server DTO and shared server-shaped fixtures. Honor `confirmEnabled=false`/`activationBoundary`, translate the four server reason categories in UI, render receipt `reasonRedacted` and the three convergence outcome fields, and remove client calls/UI for server-absent convergence GET/retry routes. Confirm execution sends exactly one request. After normal unmount/response loss, the registered receipt capsule may perform at most one separately observed ADR-0040 replay lookup with the byte-identical preview/request/idempotency identity (the same confirm endpoint is allowed because the server checks completed replay before preview expiry), then clears that private request in `finally`; it never creates a new identity/effect. Authority loss clears active and retired capsules first and makes zero replay requests. Only an accepted owner invokes query-owned publication; no server command/policy changes |
| `src/app/layouts/app-route-layout.tsx` → `shared/auth/club-access-query.ts` | verified-no-change mounted ambient write | `touchClubAccessOnce` is a best-effort, response-ignored access timestamp with no cache/UI/return-target publication and is not a user command; exact source and request-count tests keep it outside pending registration. Any later response consumer or publication reclassifies it as `modify` |
| `host/actions/invitations.ts`, `current-session/actions/{save-checkin,save-question,save-review,update-rsvp}.ts` | out-of-domain unreachable exports | exact import-graph evidence proves no mounted production consumer. A new production import fails inventory until the action is assigned to a registering owner; "out-of-domain" cannot be justified by directory location alone |
| `platform-admin/route/admin-shell-layout.tsx` | register | onboarding dirty/pending L2; existing preview/receipt identity |
| `platform-admin/route/admin-today-route.tsx` | register | pending/unknown L1; case detail + history refetch |
| `platform-admin/route/admin-club-detail-route.tsx`, `platform-admin/route/admin-support-route.tsx` | register | dirty review, pending/unknown L2/L3; existing receipt/command recovery helper |
| `platform-admin/route/admin-notifications-route.tsx`, `platform-admin/route/admin-ai-ops-route.tsx`, `platform-admin/route/admin-public-takedown-route.tsx` | register | pending/unknown L3; existing receipt/convergence identity |

**Steps:**

- [ ] Characterize each existing local blocker/recovery path before registering it; registration composes with existing guards and does not delete domain-specific confirmation.
- [ ] RED: define `MutationProducerClassification { path; exportName?: string; classification: "register" | "modify" | "verified-no-change" | "out-of-domain"; ownerPaths: string[]; recoveryClass: "L1" | "L2" | "L3" | "none"; evidenceTokens: string[] }`. Build the candidate set from production import reachability starting at mounted app/route/shell entries, plus a repository-wide exported-write scan; do not treat five feature-directory roots as the producer boundary. Scan `front/src/app`, `front/shared`, and all `front/features` for TanStack `useMutation`/`.mutate`/`.mutateAsync`, `fetch`/client calls using write HTTP methods, direct imported write verbs (`save|update|delete|create|revoke|leave|mark|submit|confirm|commit|retry|restore|open|close|publish|unpublish|reopen|process|send|cancel|regenerate|touch`), and `actions.*` callbacks. Fail on every detected file/export absent from the typed manifest, every unclassified reachable consumer, every `verified-no-change` entry with cache/UI/callback publication, and every `out-of-domain` entry that gains a mounted import. Require at least one registering mounted owner for each `modify` factory. Negative fixtures must catch unclassified `regenerateItem` in a feature and `touchClubAccess` from app/shared.
- [ ] RED: extend `tests/unit/frontend-boundaries.test.ts` so UI detection covers nested `features/**/ui/**`, not only `features/<single-segment>/ui/**`. It must fail fixtures where nested host AI/default UI imports a query, API, route, app, page, router, or performs direct `fetch`, while the route-owned prop/callback chains above pass.
- [ ] RED: switching space while every registered producer class is dirty/pending/unknown invokes the correct block or recovery; unregister on unmount and purge on authority loss.
- [ ] RED: each recovery partition—member L1/L2, host L1/L2, host notification L3, Today L1, admin club/support L2/L3, admin notification/AI/takedown L3—proves both unmount and authority-loss late responses cannot mutate Query cache, UI, receipt callbacks, success/error copy, navigation, or return target. Spy on request count as well as each publication surface. Both paths use the original operation identity through side-effect-free detached recovery; only a separately current owner/generation may trigger its own refetch.
- [ ] RED: shared `platform-admin-takedown-preview.server.json` and `platform-admin-takedown-receipt.server.json` are asserted by the server integration response and passed through the frontend strict parsers. The preview proves `confirmEnabled`, `activationBoundary`, `remoteCopyLimitation`; the receipt proves `reasonRedacted`, `bffEvictionOutcome`, `cdnPurgeOutcome`, `browserRevalidationOutcome`, `remoteCopyLimitation`, and rejects invented `committedClubGeneration`/`limitationCode`. API/query/route/UI tests prove no convergence GET/retry request is offered against an absent server route.
- [ ] RED: every modified action/query factory proves its mutation execution is observation-only: no automatic `onSuccess`/`onError` invalidation, `setQueryData`, refetch, receipt callback, success/error message, or navigation occurs before owner settlement. Each mounted owner proves `"accepted"` publishes once and `"obsolete"` publishes zero times. Takedown `mutationFn` makes exactly one confirm request. After normal unmount/transport loss, the detached receipt capsule makes at most one additional replay-lookup request whose `previewId`, `reasonCategory`, `reason`, and `idempotencyKey` are byte-identical, uses no fresh identity, publishes nothing, and clears all retained fields on success/failure/throw. In the authority-loss case it clears first, returns `authority-lost`, and the request spy remains at the original single call.
- [ ] RED: the takedown interleaving is exact: `beginPending → unregister/unmount → authority loss → late settlement/reconciliation`. It returns `authority-lost`; original confirm request count remains 1; replay is 0; Query cache/UI/receipt callback/success·error copy/navigation/return target/sessionStorage writes are 0; retained canonical fields are cleared; no retired/detached capsule remains. Keep a separate normal-unmount test for same-identity one-time lookup so zero replay is not accidentally generalized to the non-authority-loss path.
- [ ] RED: host invitation create/reissue/revoke response loss resolves to L1 `still-unknown` in both mounted and obsolete owner states. Each case makes exactly one create/reissue/revoke request, never replays `revokeInvitation`, never reports definite success/failure, never calls `refreshInvitations`, and never changes rows/cache/success UI; detached recovery may call uncached `listInvitations` only. `host-invitations-data.test.ts` proves `listInvitations` performs no Query-cache write while `refreshInvitations` is cache-writing; `host-invitations.test.tsx` and `host-members.test.tsx` prove only `"accepted"` settlement may invoke it.
- [ ] GREEN: features call only the shared registration port; app controller remains the sole navigation coordinator.
- [ ] Run the complete Task 2.4 focused partition below and require PASS before its commit:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  src/app/space-transition-producer-inventory.test.ts \
  src/app/global-space-transition.test.ts \
  src/app/global-space-transition-controller.test.tsx \
  src/app/host-authority-loss-controller.test.tsx \
  src/app/app-route-security-controller.test.tsx \
  tests/unit/frontend-boundaries.test.ts \
  features/archive/route/account-settings-route.test.tsx \
  features/archive/route/profile-update-controller.test.tsx \
  features/current-session/route/current-session-route.test.tsx \
  features/notifications/route/member-notification-settings-route.test.tsx \
  features/notifications/route/member-notifications-route.test.tsx \
  features/notifications/route/member-notifications-data.test.ts \
  features/host/aigen/ui/AiGenerateTab.test.tsx \
  features/host/aigen/ui/AiGenerateTab.draft-restoration.test.tsx \
  features/host/aigen/ui/RegenerateModal.test.tsx \
  features/host/aigen/ui/PreviewView.test.tsx \
  features/host/club/ui/ClubAiDefaultsSection.test.tsx \
  features/host/route/host-operations-route.test.tsx \
  features/host/ui/host-operations-page.test.tsx \
  features/host/route/host-dashboard-route.test.tsx \
  features/host/route/host-meeting-ledger-route.test.tsx \
  features/host/route/host-meeting-workspace-actions.test.tsx \
  features/host/route/host-meeting-workspace-route.test.tsx \
  features/host/route/host-members-route.test.tsx \
  features/host/route/host-invitations-route.test.tsx \
  features/host/route/host-notification-composer-controller.test.tsx \
  features/host/route/host-notifications-route.test.tsx \
  features/host/route/host-session-editor-route.test.tsx \
  features/host/route/new-host-meeting-route.test.tsx \
  features/host/route/host-session-ledger-route.test.tsx \
  features/host/route/host-members-data.test.ts \
  features/host/route/host-invitations-data.test.ts \
  features/host/route/host-session-editor-actions.test.ts \
  features/host/ui/host-members.test.tsx \
  features/host/ui/host-invitations.test.tsx \
  features/host/ui/host-session-editor-transition-safety.test.tsx \
  features/host/ui/meeting-ledger/upcoming-book-list.test.tsx \
  features/host/ui/session-editor/session-record-workspace.test.tsx \
  features/host/ui/session-editor/session-record-completion-panel.test.tsx \
  features/platform-admin/route/admin-shell-layout.test.tsx \
  features/platform-admin/route/admin-today-route.test.tsx \
  features/platform-admin/route/admin-club-detail-route.test.tsx \
  features/platform-admin/route/admin-support-route.test.tsx \
  features/platform-admin/route/admin-notifications-route.test.tsx \
  features/platform-admin/route/admin-ai-ops-route.test.tsx \
  features/platform-admin/route/admin-public-takedown-route.test.tsx \
  features/platform-admin/api/platform-admin-takedown-contracts.test.ts \
  features/platform-admin/api/platform-admin-takedown-api.test.ts \
  features/platform-admin/model/platform-admin-takedown-model.test.ts \
  features/platform-admin/ui/admin-public-takedown-workbench.test.tsx \
  features/platform-admin/ui/domain-provisioning-panel.test.tsx
```
- [ ] Replace the obsolete retry-flow assertion in `platform-admin-public-convergence.spec.ts` with server-shaped receipt outcome rendering plus negative evidence that no convergence GET/retry route is requested or offered. Run the focused takedown browser contract before commit:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec playwright test \
  tests/e2e/platform-admin-public-takedown.spec.ts \
  tests/e2e/platform-admin-public-convergence.spec.ts \
  --project=chromium
```
- [ ] Run the factory/publication fence and require PASS; this command is part of Task 2.4, not optional supporting coverage:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  shared/auth/club-access-query.test.ts \
  src/app/layouts/app-route-layout-club-access.test.tsx \
  features/archive/queries/profile-queries.test.tsx \
  features/current-session/queries/current-session-queries.test.tsx \
  features/host/aigen/queries/aigen-job-queries.test.tsx \
  features/host/queries/host-invitation-queries.test.ts \
  features/host/queries/host-members-queries.test.ts \
  features/host/queries/host-notification-queries.hooks.test.tsx \
  features/host/queries/host-session-queries.hooks.test.tsx \
  features/host/queries/host-session-record-queries.test.tsx \
  features/host/queries/host-session-recovery-queries.test.tsx \
  features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx \
  features/platform-admin/queries/platform-admin-notifications-queries.test.tsx \
  features/platform-admin/queries/platform-admin-operations-queries.test.tsx \
  features/platform-admin/queries/platform-admin-queries.test.tsx \
  features/platform-admin/queries/platform-admin-support-queries.test.tsx \
  features/platform-admin/queries/platform-admin-takedown-queries.test.tsx
```
- [ ] Commit: `feat(app): register workflow transition safety`

---

## Stage 3 — Admin Shell, IA, Copy, And Visual Contract

### Task 3.1: 네 운영 축과 active-nav를 고정한다

**Files:**

- Modify: `front/features/platform-admin/model/admin-route-catalog.ts`
- Modify: `front/features/platform-admin/model/admin-route-catalog.test.ts`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.tsx`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.test.tsx`
- Create: `front/features/platform-admin/ui/admin-mobile-navigation.tsx`
- Create: `front/features/platform-admin/ui/admin-mobile-navigation.test.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`

**Route ownership:**

```text
오늘 할 일: /admin, /admin/today
클럽 관리: /admin/clubs, /admin/clubs/:clubId, /admin/support, ?onboarding=1
서비스 상태: /admin/health, /admin/notifications, /admin/ai-ops
처리 기록: /admin/audit, /admin/analytics
비상 레인: /admin/public-takedown
```

**Steps:**

- [ ] RED: every current route has exactly one primary owner or emergency lane; capability filtering never promotes a nested route to a fifth axis.
- [ ] RED: desktop `aria-current`, mobile four tabs, deep-link active state, support/analytics mapping.
- [ ] GREEN: update catalog/nav and preserve route URLs.
- [ ] Commit: `feat(admin): align navigation to four operating jobs`

### Task 3.2: 용어와 semantic state를 pure model로 고정한다

**Files:**

- Modify: `front/features/platform-admin/model/admin-copy.ts`
- Modify: `front/features/platform-admin/model/admin-copy.test.ts`
- Create: `front/features/platform-admin/model/admin-status-language.ts`
- Create: `front/features/platform-admin/model/admin-status-language.test.ts`

**Steps:**

- [ ] RED: navigation, case lifecycle, platform role detail labels, audit outcome, health availability/freshness mappings.
- [ ] RED: unknown enum renders `확인 필요` in primary text and raw value only in technical disclosure.
- [ ] GREEN: remove `Today`, `Club registry`, `Pipeline`, `Ledger`, `Job`, `Event`, raw role/status from primary UI.
- [ ] Add a source scan test that fails when the banned labels reappear outside allowlisted technical disclosure/tests.
- [ ] Commit: `refactor(admin): centralize operator language`

### Task 3.3: shell responsibility와 CSS ownership을 분리한다

**Files:**

- Create: `front/features/platform-admin/route/admin-shell-controller.tsx`
- Create: `front/features/platform-admin/route/admin-onboarding-controller.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx`
- Create: `front/features/platform-admin/ui/admin-shell.css`
- Create: `front/features/platform-admin/ui/admin-page-patterns.css`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/src/styles/globals.css`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`

**Ownership:**

- Shell controller: capability load, platform authority loss, alarm composition.
- Clubs onboarding controller: existing `?onboarding=1`, dirty/pending reporting, preview/commit.
- Shell UI: header/rail/mobile nav/Outlet only.
- Global CSS: token/reset only; admin shell/page selectors move to feature CSS.

**Steps:**

- [ ] Characterize current onboarding close/block/authority-loss tests before moving code.
- [ ] RED: shell renders without onboarding mutation hooks; `?onboarding=1` still opens from clubs route; pending commit blocks transition.
- [ ] GREEN: remove render-time state writes and use reducer/effect-driven controllers.
- [ ] Update the producer manifest owner from `admin-shell-layout.tsx` to `admin-onboarding-controller.tsx`, then rerun `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/space-transition-producer-inventory.test.ts features/platform-admin/route/admin-shell-layout.test.tsx`; stale old-owner classification must fail before the manifest update.
- [ ] Move duplicate selectors once, verify computed layout in CT before deleting globals.
- [ ] Commit: `refactor(admin): separate shell and onboarding ownership`

### Task 3.4: 실제 shell 포함 visual baseline을 만든다

**Execution dependency:** Task 4.1의 `무시`/미전송 사유 제거와 honest-action assertions가 GREEN 및 커밋된 뒤에만 실행한다. 즉 실제 순서는 Stage 3.1–3.3 → Task 4.1 → Task 3.4 → Task 4.2–4.3이다.

**Files:**

- Create: `front/features/platform-admin/route/admin-shell-layout.ct.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts`
- Modify tracked screenshots under `front/__screenshots__/features/platform-admin/` generated by CT.

**Steps:**

- [ ] Before any snapshot update, rerun `front/features/platform-admin/ui/admin-operation-state-actions.test.tsx` and assert `무시`와 미전송 사유 입력이 DOM에 없다.
- [ ] Add shell-included fixtures for Today desktop, four-axis nav, space menu, 390 mobile shell, 320 long-copy shell.
- [ ] Assert Pretendard, 1240px max content, 44px control minimum, quiet normal state, no horizontal scroll.
- [ ] Use approved PNGs as review reference only; do not render them in the app.
- [ ] Run `npx --yes corepack@0.35.0 pnpm --dir front test:ct:update:docker`, inspect every changed PNG, then run `npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker` without update.
- [ ] Commit: `test(admin): lock redesigned shell visual contract`

---

## Stage 4 — Today Operations Desk

### Task 4.1: action contract를 정직하게 만든다

**Files:**

- Modify: `front/features/platform-admin/ui/admin-operation-state-actions.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-state-actions.test.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
- Modify: `front/features/platform-admin/api/platform-admin-operations-api.test.ts` only to assert the existing request body remains exact.

**Steps:**

- [ ] RED: UI never shows `무시` or `병합`; snooze asks only for the time; request body is exactly `expectedVersion + snoozedUntil`.
- [ ] RED: `allowedActions` omission removes the action even for OWNER; client never reconstructs it from role.
- [ ] GREEN: delete UI-only reason state/arguments and map only acknowledge/snooze/resolve to clear Korean verbs.
- [ ] Add a regression test proving no collected input is discarded by the route.
- [ ] Commit: `fix(admin): align case actions with server contract`

### Task 4.2: Today controller를 reducer로 분리한다

**Files:**

- Create: `front/features/platform-admin/model/admin-today-state.ts`
- Create: `front/features/platform-admin/model/admin-today-state.test.ts`
- Create: `front/features/platform-admin/route/use-admin-today-controller.ts`
- Create: `front/features/platform-admin/route/use-admin-today-controller.test.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`
- Modify: `front/features/platform-admin/model/platform-admin-operations-snapshot.ts`

**State machine covers:** list snapshot/poll merge, selected case, pending-new signal, mutation target, action feedback, permission loss, conflict, pending/unknown outcome, next selection.

**Steps:**

- [ ] RED: current render-time `setSnapshotTrack/setUrgentTrack` behavior as reducer transitions.
- [ ] RED: URL selection, poll freeze, pending-new acceptance, load-more dedupe, resolve conflict, authority loss, unknown recovery.
- [ ] GREEN: route becomes query/URL/mutation prop assembly; pure reducer owns transitions.
- [ ] Reclassify Today registration ownership to `use-admin-today-controller.ts` only if the mutation call site moves there; rerun `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/space-transition-producer-inventory.test.ts features/platform-admin/route/use-admin-today-controller.test.tsx features/platform-admin/route/admin-today-route.test.tsx` so both stale and duplicate ownership fail.
- [ ] Keep query keys/invalidation behavior unchanged unless a failing test proves a contract bug.
- [ ] Commit: `refactor(admin): isolate today workflow state`

### Task 4.3: 38:62 desktop와 URL-addressable mobile flow를 구현한다

**Files:**

- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx`
- Create: `front/features/platform-admin/ui/use-admin-content-width.ts`
- Create: `front/features/platform-admin/ui/use-admin-content-width.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-page-patterns.css`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts`

**DOM order:**

1. queue title/count and compact secondary filters
2. selected docket heading
3. `무슨 일인가`
4. `왜 중요한가`
5. `확인한 근거` with source/as-of/threshold
6. `다음 행동`
7. `최근 처리 기록`

**Steps:**

- [ ] RED: a `ResizeObserver`-backed content-width hook chooses ≥960 split and <960 list/detail independent of viewport width; queue 340px/docket 560px minimum, no horizontal scroll, and 900px viewport behavior are covered.
- [ ] RED: mobile `case` + `mode=detail` query state survives reload/Back/Forward and returns focus to selected queue row.
- [ ] RED: after mutation, result remains in current detail until explicit next; durable result link goes to audit rather than a synthetic recent projection.
- [ ] RED: raw case/source IDs are absent from primary view and present only in technical disclosure.
- [ ] RED: mobile primary action priority is `ACKNOWLEDGE → RESOLVE → SNOOZE`; all other server-allowed actions stay under `다른 처리`.
- [ ] GREEN: implement approved hierarchy with one deterministic primary mobile action plus `다른 처리`.
- [ ] Run Today CT/E2E at 320, 390, 768, 900, 1024, 1440 and 200% zoom browser check.
- [ ] Commit: `feat(admin): build today operations desk`

---

## Stage 5 — Club Management

### Task 5.1: club list를 운영자 판단 순서로 재구성한다

**Files:**

- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx`
- Modify: `front/features/platform-admin/model/platform-admin-club-triage-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-club-triage-model.test.ts`
- Modify: `front/features/platform-admin/ui/admin-clubs-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-clubs-ledger.test.tsx`
- Modify: `front/features/platform-admin/route/admin-clubs-route.ct.tsx`
- Create: `front/features/platform-admin/ui/admin-club-management.css`

**Steps:**

- [ ] RED: primary row contains club name, translated current state, required action, recent signal; slug/ID/domain raw value is in detail disclosure.
- [ ] RED: normal row is quiet; only actionable/stale/partial rows get semantic emphasis.
- [ ] RED: no fabricated `마지막 확인` when response lacks a timestamp.
- [ ] GREEN: derive a pure club-row view model and render stable long-name wrapping.
- [ ] Commit: `feat(admin): clarify club management ledger`

### Task 5.2: club detail와 support를 같은 관리 문법으로 정리한다

**Files:**

- Modify: `front/features/platform-admin/route/admin-club-detail-route.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-club-operations-page.tsx`
- Modify: `front/features/platform-admin/ui/admin-club-operations-page.test.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.ct.tsx`
- Modify: `front/features/platform-admin/ui/admin-club-management.css`

**Steps:**

- [ ] Preserve exact capability, preview/confirm, receipt/convergence, conflict and authority-loss behavior with characterization tests.
- [ ] Reorder detail as `기본 정보 → 현재 상태 → 영향 → 가능한 조치 → 최근 처리 기록`.
- [ ] Keep support reasonCategory/expiry/receipt contract unchanged; show support under `클럽 관리` active-nav.
- [ ] Ensure platform scope shows only aggregate/operational facts, not member reading content.
- [ ] Commit: `feat(admin): unify club and support operations`

---

## Stage 6 — Service Status

### Task 6.1: health를 quiet-normal narrative로 재구성한다

**Files:**

- Modify: `front/features/platform-admin/model/platform-admin-health-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-health-model.test.ts`
- Modify: `front/features/platform-admin/ui/admin-health-grid.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-card.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-deploy-strip.tsx`
- Modify: `front/features/platform-admin/route/admin-health-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-card.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-deploy-strip.test.tsx`
- Create: `front/features/platform-admin/ui/admin-service-status.css`

**Steps:**

- [ ] RED: FRESH/REFRESHING/STALE/UNAVAILABLE and OK/WARN/CRIT/UNKNOWN map to distinct sentences; disabled/no-data are view-model semantics, not invented wire enums.
- [ ] RED: all-normal renders one quiet summary and source names without a green badge wall; abnormal source shows reason, observed time, and a public-safe static impact/next-action map keyed by known card ID. Unknown ID uses `상태를 확인할 수 없습니다` and no fabricated impact.
- [ ] RED: only existing DB pool, Redis, Kafka lag, outbox, notification dispatch, AI provider, outbound resilience, deploy sources are shown; no invented API latency source.
- [ ] GREEN: implement narrative model/UI and retain retry/freshness behavior.
- [ ] Commit: `feat(admin): make service status actionable and quiet`

### Task 6.2: notifications와 AI를 service detail로 정리한다

**Files:**

- Modify: `front/features/platform-admin/route/admin-notifications-route.tsx`
- Modify: `front/features/platform-admin/ui/admin-notifications-page.tsx`
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.ts`
- Modify: `front/features/platform-admin/route/admin-notifications-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-notifications-page.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-notifications-queries.test.tsx`
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-service-status.css`

**Steps:**

- [ ] Preserve notification replay and AI cancel/retry ADR-0040 L3 receipt/convergence behavior.
- [ ] Show operator sentence, freshness, failure cluster/run-attempt evidence, and next safe action before raw event/job identifiers.
- [ ] Remove duplicate H1 and raw `Job/Event` primary labels.
- [ ] Show manual replay warning without claiming it cancels automatic retry.
- [ ] Commit: `feat(admin): align delivery and ai status details`

---

## Stage 7 — Processing Records

### Task 7.1: audit row와 detail hierarchy를 사용자 문장으로 바꾼다

**Files:**

- Modify: `front/features/platform-admin/model/platform-admin-audit-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.test.ts`
- Modify: `front/features/platform-admin/route/admin-audit-route.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`

**Steps:**

- [ ] RED: row reads `시각 · 누가 · 대상에 무엇을 함 · 결과`; exact audit mapping is `SUCCESS→완료`, `FAILED→실패`, `DENIED→차단됨`, `PREPARED→실행 전 준비됨`, `UNKNOWN→결과 확인 필요`. `진행 중`은 actual convergence `PENDING` source에만 사용한다.
- [ ] RED: source/action/receipt IDs remain in detail, not primary row; reason absence is explicit without inventing a reason.
- [ ] RED: existing cursor, source filter, no-store search, role/capability redaction and case deep links remain intact.
- [ ] GREEN: reuse existing audit union; do not expand `JdbcAdminAuditLedgerAdapter.kt` for visual-only needs.
- [ ] Commit: `feat(admin): present processing records as operator sentences`

### Task 7.2: analytics를 처리 기록의 부록으로 정리한다

**Files:**

- Modify: `front/features/platform-admin/route/admin-analytics-route.tsx`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.tsx`
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.ts`
- Modify: `front/features/platform-admin/route/admin-analytics-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`
- Create: `front/features/platform-admin/ui/admin-processing-records.css`

**Steps:**

- [ ] Keep aggregate-only DTO and `EXPORT_ANALYTICS` gate unchanged.
- [ ] Render decision-relevant definitions/availability before values; use tabular numerals only for comparison.
- [ ] Map analytics to `처리 기록` active-nav and label it `분석 부록` inside the page.
- [ ] Do not add a KPI wall to Today or service status.
- [ ] Commit: `feat(admin): integrate analytics as a records appendix`

### Task 7.3: 긴급 공개 회수를 공통 셸·카피·모바일 handoff에 맞춘다

**Files:**

- Modify: `front/features/platform-admin/route/admin-public-takedown-route.tsx`
- Modify: `front/features/platform-admin/route/admin-public-takedown-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-public-takedown-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-public-takedown-workbench.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts`
- Create: `front/features/platform-admin/ui/admin-emergency-lane.css`

**Steps:**

- [ ] Characterize the Task 2.4-corrected L3 preview/confirm/receipt outcome, capability deny, fail-closed activation, and response-loss recovery before visual changes. Do not restore the removed nonexistent convergence GET/retry client flow.
- [ ] RED: desktop uses common shell/type/copy; compact UI offers desktop handoff as primary while direct URL/API retains the same capability and safe-command checks.
- [ ] RED: no viewport/user-agent value enters authorization or command payload.
- [ ] GREEN: align page hierarchy and Korean copy without changing server takedown command semantics/policy or the Task 2.4-corrected frontend wire adapter.
- [ ] Commit: `feat(admin): align emergency takedown presentation`

---

## Stage 8 — Whole-Product Proof And Decision Closeout

### Task 8.1: focused and canonical automated gates를 실행한다

**Frontend focused:**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  tests/unit/frontend-boundaries.test.ts \
  tests/unit/cloudflare-bff.test.ts \
  tests/unit/auth-context.test.tsx \
  shared/auth/available-spaces.test.ts \
  shared/model/global-space.test.ts \
  shared/ui/space-transition-safety-context.test.tsx \
  src/app/global-space-continuity.test.ts \
  src/app/global-space-transition.test.ts \
  src/app/global-space-transition-controller.test.tsx \
  src/app/host-authority-loss-controller.test.tsx \
  src/app/app-route-security-controller.test.tsx \
  src/app/space-transition-producer-inventory.test.ts \
  src/app/routes/admin.test.tsx \
  shared/ui/global-space-switcher.test.tsx \
  features/platform-admin/model/admin-route-catalog.test.ts \
  features/platform-admin/model/admin-copy.test.ts \
  features/platform-admin/model/admin-today-state.test.ts \
  features/platform-admin/route/use-admin-today-controller.test.tsx \
  features/platform-admin/route/admin-shell-layout.test.tsx \
  features/platform-admin/route/admin-today-route.test.tsx \
  features/platform-admin/ui/admin-operation-state-actions.test.tsx \
  features/platform-admin/api/platform-admin-takedown-contracts.test.ts \
  features/platform-admin/api/platform-admin-takedown-api.test.ts \
  features/platform-admin/model/platform-admin-takedown-model.test.ts \
  features/platform-admin/ui/admin-public-takedown-workbench.test.tsx \
  features/platform-admin/ui/admin-health-grid.test.tsx \
  features/platform-admin/ui/admin-clubs-ledger.test.tsx \
  features/platform-admin/ui/admin-audit-ledger.test.tsx
```

The focused command must also cover the direct-write owners introduced in Task 2.4. Run this second bounded partition command before canonical `pnpm test`:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  features/archive/route/account-settings-route.test.tsx \
  features/archive/route/profile-update-controller.test.tsx \
  features/current-session/route/current-session-route.test.tsx \
  features/notifications/route/member-notification-settings-route.test.tsx \
  features/notifications/route/member-notifications-route.test.tsx \
  features/notifications/route/member-notifications-data.test.ts \
  features/host/aigen/ui/AiGenerateTab.test.tsx \
  features/host/aigen/ui/AiGenerateTab.draft-restoration.test.tsx \
  features/host/aigen/ui/RegenerateModal.test.tsx \
  features/host/aigen/ui/PreviewView.test.tsx \
  features/host/club/ui/ClubAiDefaultsSection.test.tsx \
  features/host/route/host-operations-route.test.tsx \
  features/host/ui/host-operations-page.test.tsx \
  features/host/route/host-dashboard-route.test.tsx \
  features/host/route/host-meeting-ledger-route.test.tsx \
  features/host/route/host-meeting-workspace-actions.test.tsx \
  features/host/route/host-meeting-workspace-route.test.tsx \
  features/host/route/host-members-route.test.tsx \
  features/host/route/host-invitations-route.test.tsx \
  features/host/route/host-notification-composer-controller.test.tsx \
  features/host/route/host-notifications-route.test.tsx \
  features/host/route/host-session-editor-route.test.tsx \
  features/host/route/new-host-meeting-route.test.tsx \
  features/host/route/host-session-ledger-route.test.tsx \
  features/host/route/host-members-data.test.ts \
  features/host/route/host-invitations-data.test.ts \
  features/host/route/host-session-editor-actions.test.ts \
  features/host/ui/host-members.test.tsx \
  features/host/ui/host-invitations.test.tsx \
  features/host/ui/host-session-editor-transition-safety.test.tsx \
  features/host/ui/meeting-ledger/upcoming-book-list.test.tsx \
  features/host/ui/session-editor/session-record-workspace.test.tsx \
  features/host/ui/session-editor/session-record-completion-panel.test.tsx \
  features/platform-admin/route/admin-shell-layout.test.tsx \
  features/platform-admin/route/admin-today-route.test.tsx \
  features/platform-admin/route/admin-club-detail-route.test.tsx \
  features/platform-admin/route/admin-support-route.test.tsx \
  features/platform-admin/route/admin-notifications-route.test.tsx \
  features/platform-admin/route/admin-ai-ops-route.test.tsx \
  features/platform-admin/route/admin-public-takedown-route.test.tsx \
  features/platform-admin/ui/domain-provisioning-panel.test.tsx
```

Rerun the Task 2.4 factory/publication fence before canonical `pnpm test`; a passing owner test cannot substitute for a missing factory side-effect assertion:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  shared/auth/club-access-query.test.ts \
  src/app/layouts/app-route-layout-club-access.test.tsx \
  features/archive/queries/profile-queries.test.tsx \
  features/current-session/queries/current-session-queries.test.tsx \
  features/host/aigen/queries/aigen-job-queries.test.tsx \
  features/host/queries/host-invitation-queries.test.ts \
  features/host/queries/host-members-queries.test.ts \
  features/host/queries/host-notification-queries.hooks.test.tsx \
  features/host/queries/host-session-queries.hooks.test.tsx \
  features/host/queries/host-session-record-queries.test.tsx \
  features/host/queries/host-session-recovery-queries.test.tsx \
  features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx \
  features/platform-admin/queries/platform-admin-notifications-queries.test.tsx \
  features/platform-admin/queries/platform-admin-operations-queries.test.tsx \
  features/platform-admin/queries/platform-admin-queries.test.tsx \
  features/platform-admin/queries/platform-admin-support-queries.test.tsx \
  features/platform-admin/queries/platform-admin-takedown-queries.test.tsx
```

**Server focused/canonical:**

```bash
./server/gradlew -p server unitTest \
  --tests '*ResolveAuthAccessProjectionServiceTest'
./server/gradlew -p server integrationTest \
  --tests '*AuthMeControllerTest' \
  --tests '*DevLoginControllerTest'
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

**Frontend canonical:**

```bash
npx --yes corepack@0.35.0 pnpm --dir front lint
npx --yes corepack@0.35.0 pnpm --dir front test
npx --yes corepack@0.35.0 pnpm --dir front build
npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
```

**E2E focused/full:**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec playwright test \
  tests/e2e/admin-shell.spec.ts \
  tests/e2e/admin-today.spec.ts \
  tests/e2e/admin-health.spec.ts \
  tests/e2e/admin-club-operations.spec.ts \
  tests/e2e/admin-clubs-triage.spec.ts \
  tests/e2e/admin-notifications.spec.ts \
  tests/e2e/platform-admin-ai-ops.spec.ts \
  tests/e2e/platform-admin-public-takedown.spec.ts \
  tests/e2e/platform-admin-public-convergence.spec.ts \
  tests/e2e/admin-audit-ai-ops-drilldown.spec.ts \
  tests/e2e/admin-support.spec.ts \
  tests/e2e/admin-analytics.spec.ts \
  tests/e2e/multi-club-flow.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts \
  --project=chromium
npx --yes corepack@0.35.0 pnpm --dir front test:e2e
```

**Steps:**

- [ ] Run each command fresh and record exit code; no skipped command is reported as passed.
- [ ] Exercise platform-only, member-only, host+member, platform+member, platform+host+member, authority loss, direct denied URL.
- [ ] Exercise loading, true empty, filtered empty, stale, partial, 403, 409, invalid cursor, pending timeout, unknown outcome.
- [ ] Verify 320, 390, 768, 900, 1024, 1440px, 200% zoom, keyboard, focus return, reduced motion, long Korean/English wrapping.
- [ ] Run a manual screen-reader pass on representative desktop and mobile flows: current-space/menu announcement, Today queue→detail reading order, confirm/fail-closed boundary, authority-loss announcement, and receipt/result outcome. If assistive technology is unavailable, record `not measured` and do not claim the screen-reader contract verified.
- [ ] Inspect all tracked CT changes against the 7 approved assets; record intentional differences caused by real data/accessibility constraints.

### Task 8.2: novice comprehension과 residual risk를 기록한다

**Files:**

- Create only if the study is actually run: `docs/reports/2026-08-30-admin-novice-comprehension.md` using public-safe aggregate results; set the document's `실행일` field to the real study date.
- Modify: `CHANGELOG.md` under Unreleased.

**Steps:**

- [ ] Run the three 30-second tasks with at least five first-time operators, or record `not measured` with reason. Do not synthesize results. `not measured` does not by itself block ADR-0050 acceptance, but it blocks any claim that the 30-second comprehension goal was verified.
- [ ] Record task success counts, confusing labels, viewport, and changes made; no names, emails, or private club data.
- [ ] Review branch against the immutable `BASE_TIP..HEAD` recorded after Stage 0 integration, not the moving branch name, using `docs/development/release-readiness-review.md`.
- [ ] Confirm no unexpected server migration, BFF mutation, deploy, provider, or production-data action occurred.
- [ ] Whether or not the study report exists, run the exact conditional documentation gate below. A created report is never omitted from whitespace or public-safety validation:

```bash
closeout_docs=(
  docs/development/architecture.md
  front/DESIGN.md
  docs/development/adr/0050-platform-admin-today-operations-desk.md
  docs/development/adr/0051-global-platform-and-club-space-transition.md
  docs/development/adr/README.md
  docs/development/technical-decisions.md
  CHANGELOG.md
)
if [[ -f docs/reports/2026-08-30-admin-novice-comprehension.md ]]; then
  closeout_docs+=(docs/reports/2026-08-30-admin-novice-comprehension.md)
fi
git diff --check -- "${closeout_docs[@]}"
if rg -n '(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)' "${closeout_docs[@]}"; then
  echo 'public-safety scan failed' >&2
  exit 1
fi
```

### Task 8.3: active docs와 ADR status를 실제 구현에 맞춘다

**Files:**

- Modify: `docs/development/architecture.md`
- Modify: `docs/agents/front.md` to document observation-only mutation execution, query-owned deferred publishers, accepted-owner invocation, and the no-query/API/router nested `features/**/ui/**` boundary; do not introduce a presentation-layer mutation exception.
- Modify: `front/DESIGN.md`
- Modify: `docs/development/adr/0050-platform-admin-today-operations-desk.md`
- Modify: `docs/development/adr/0051-global-platform-and-club-space-transition.md`
- Modify: `docs/development/adr/README.md`
- Modify: `docs/development/technical-decisions.md`
- Modify: `CHANGELOG.md`

**Acceptance rule:**

- Both decisions implemented and all canonical evidence green: move ADR-0050/0051 to `Accepted` and update both indexes.
- One decision incomplete or any required proof missing: keep that ADR `Proposed`, describe the exact remaining obligation, and do not claim the redesign complete.
- `docs/development/architecture.md` describes delivered behavior only, not unimplemented target wording.

**Steps:**

- [ ] Update current route/shell/auth projection/transition/recovery facts with code references.
- [ ] Run `python3 -B scripts/check-agent-guidance.py` and resolve only errors introduced by this branch; pre-existing base failures are reported separately.
- [ ] Run Task 8.2's conditional closeout-doc gate after the final documentation edit; do not replace it with a fixed file list that can omit the novice report.
- [ ] Request independent whole-branch code and UX review, fix bounded findings, rerun affected gates.
- [ ] Commit: `docs(admin): accept operations product decisions` only for ADRs whose acceptance rule is met.
- [ ] If either ADR remains Proposed, commit the truthful active-doc/CHANGELOG/residual-risk state as `docs(admin): record operations redesign status` instead.

## Requirement Coverage

| 승인 요구 | Task | Evidence |
| --- | --- | --- |
| 필요한 것만 보이는 운영 제품 | 3.1, 3.2, 4–7 | route inventory + copy scan + CT/E2E |
| 새 운영자가 이해하는 Today | 4.1–4.3, 8.2 | component/route/E2E + novice task or `not measured` |
| 실제 운영 status | 6.1–6.2 | health freshness/partial tests + browser states |
| 운영자·호스트·멤버 전환 | 1–2 | server projection + transition model + multi-role E2E |
| 브랜드 톤·멤버 폰트 | 3.2–3.4 | token assertions + tracked CT |
| desktop/mobile 일관성과 완결성 | 3.4, 4.3, 8.1 | 320–1440 CT/E2E + keyboard/zoom |
| 쉬운 용어, AI스러운 카피 제거 | 3.2, 4–7 | copy unit/source scan + visual review |
| 코드 품질·레이어·SOLID | 1.1, 2.1–2.2, 3.3, 4.2 | ArchUnit/frontend boundary + focused ownership tests |
| safe command와 결과 확인 | 2.1–2.2, 4.1, 5.2, 6.2, 7.1 | pending/unknown/receipt/history recovery tests |
| 시안 7종 구현 권위 | 3.4, 4–7, 8.1 | shell-inclusive CT and reviewed diff |

## Non-Goals And Explicit Follow-Ups

- `무시`, case `병합`, conditional signal-reopen snooze semantics는 구현하지 않는다. 필요성이 별도 검증되면 typed server semantics와 새 decision review를 먼저 한다.
- 새 admin aggregate/KPI backend, API availability card, club `lastCheckedAt`, `recentlyHandled` projection을 만들지 않는다.
- `JdbcAdminAuditLedgerAdapter.kt`의 source-reader 분리는 이 UI 작업이 해당 adapter를 확장하지 않으므로 별도 structural follow-up이다.
- Public takedown server command semantics/capability/idempotency/activation policy, notification retry policy, AI provider behavior, club host/member domain mutation을 변경하지 않는다. Broken frontend takedown wire parsing and nonexistent convergence client calls are explicitly in scope for correction.
- Production deploy, live provider smoke, billable action, real operator study participant recruitment는 별도 실행 권한이 필요하다.

## Final Completion Checklist

- [ ] `availableSpaces v1` is backend-first, additive, membership-state-aware, deterministically ordered, and action-neutral.
- [ ] Both shells use the same two-level product-space concept and server-authorized subset.
- [ ] Full return target is revalidated before restore and authority loss purges sensitive state.
- [ ] Dirty/pending/unknown transitions never duplicate a command or report unknown as success.
- [ ] Four primary admin axes own every current route exactly once.
- [ ] Today uses honest actions, 38:62 wide layout, URL-addressable compact flow, and durable audit return.
- [ ] Club/status/records screens use the same copy, freshness, evidence, and action grammar.
- [ ] Actual AdminShell CT covers desktop/mobile, long copy, menu, and quiet normal state.
- [ ] Frontend/server canonical gates and relevant E2E are green or explicitly reported as skipped/failed.
- [ ] Public-safety scan contains no real member/deployment/secret data.
- [ ] ADR-0050/0051 remain `Proposed` until their implementation and active-doc proof are complete.
