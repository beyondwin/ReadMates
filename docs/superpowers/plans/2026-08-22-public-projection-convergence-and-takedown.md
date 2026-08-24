# Public Projection Convergence and Takedown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록 게시·수정·내리기 뒤 origin과 cache가 어떤 generation을 제공하는지 추적하고, provider 장애에도 immutable mutation receipt를 바꾸지 않으며, 민감 정보 오게시를 platform-admin이 fail-closed로 긴급 회수할 수 있게 한다.

**Architecture:** Flyway V54는 public-effect mutation receipt의 `convergenceId`, mutable work/lease outbox, 별도 append-only convergence event ledger를 저장한다. Session/sessionrecord transaction owners write generation and initial work through their own output ports, so they do not import publication. Publication scheduler claims work and records `PENDING`/terminal events under an idempotent provider attempt token. Redis keys and HTTP validators include generation, public reads verify an authoritative DB marker before returning a cached body, and Cloudflare cache is bounded to the emergency freshness ceiling. Flyway V55와 `admin/takedown` slice는 platform-admin preview/confirm, origin deny, generation rotation, immutable admin receipt를 host flow와 분리한다. Frontend는 origin result와 provider convergence를 별도 상태로 표현한다.

**Tech Stack:** Kotlin, Spring Boot, JDBC, MySQL 8, Flyway, Redis optional cache, provider-neutral purge port, JUnit/Testcontainers; React, TanStack Query, TypeScript/Zod, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

ADR impact: new — ADR-0036, ADR-0037; constraining references — ADR-0012, ADR-0033

## Global Constraints

- DB/origin projection is authoritative. Redis and CDN are auxiliary; provider failure never rolls back or hides a committed origin deny.
- Mutation receipt is immutable after the domain commit. Provider status must never update receipt fields.
- Mutable work/lease state is operational only. Provider attempt events are append-only `PENDING|SUCCEEDED|FAILED`; current convergence is derived only from those events.
- Every public-effect mutation rotates or records the applicable generation in the same transaction as origin truth and its feature-owned immutable mutation receipt.
- General record update/revoke target is ≤120 seconds for a new/revalidated browser read. Emergency takedown target is ≤60 seconds for a new navigation/read after commit.
- Every takedown-eligible public detail response has browser/edge freshness ≤60 seconds before the takedown feature can be enabled. The current policy is `max-age=120, stale-while-revalidate=600`; after deploying the new policy, wait at least the full previous 720-second browser lifetime before enabling confirm. CDN/BFF purge does not shorten a browser cache already holding the old policy.
- Unpublish/takedown origin denies immediately and must not allow stale-while-revalidate to re-serve a known revoked body.
- The SLA does not claim remote erasure of already-rendered, downloaded, saved, or offline disconnected copies. Confirmation copy and incident docs state this limit.
- Provider error body, private content, meeting URL/passcode, admin reason text, token, and purge credential are not persisted or exposed.
- Emergency takedown is platform-admin-only. Host membership does not authorize it and host mutation receipts are not reused.
- `SUPPORT`, inactive admin, preview mismatch, generation mismatch, expired preview, or blank reason fails closed.
- Application service owns multi-port transaction; provider call occurs after commit through convergence processing.
- Public/guest DTO allowlists and canonical URLs/SEO metadata remain unchanged.
- Session/sessionrecord never import publication application types. Their transaction-owned output ports write the V54 generation/work contract; publication owns read/cache/provider processing.
- V54/V55 operational work rows may expire, but immutable convergence/admin rows use redacted UUID snapshots and no destructive FK to deletable session/publication content. Seven-day resource hard deletion must succeed while immutable event/receipt bytes remain available only to authorized audit paths.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Generation-scoped origin/cache and immutable receipt | 1 |
| Append-only provider attempts and host convergence UI | 2 |
| Platform-admin preview/confirm and 60-second deny | 3 |
| Admin operator UI, retry, incident/audit evidence | 4 |

## Dependency Order

Server safety plan Task 7 is a hard prerequisite. `1 → 2 → 3 → 4`. Rollout plan Task 4 Steps 1–4 must create the protected evidence schema/workflow/verifier before Task 1 Step 8 can deploy R2a or emit cache evidence. Task 2의 server service/API는 Task 1 직후 진행할 수 있지만 host judgment-rail 통합 step은 shared-shell plan Task 10 뒤에 실행한다. Task 3 reuses server-safety Task 5 HMAC identity and this plan's convergence work/event contract but has a distinct admin key scope and receipt type.

## File Responsibility Map

| Responsibility | Files |
| --- | --- |
| Public generation/ledger schema | V54, publication model/ports/persistence |
| Provider processing/cache | publication convergence service/scheduler/provider adapter, Redis/public controller |
| Host convergence status | host/publication web DTO and frontend host API/query/UI |
| Emergency takedown server | V55 and new `admin/takedown` slice, shared admin actor/audit |
| Emergency takedown UI | platform-admin API/model/query/route/UI and admin route catalog |

---

### Task 1: Add public projection generations and append-only convergence storage

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V54__public_projection_convergence.sql`
- Create: `server/src/main/kotlin/com/readmates/publication/application/model/PublicConvergenceModels.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/port/out/PublicConvergencePort.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicConvergenceAdapter.kt`
- Modify: public-effect application services from the server safety plan
- Modify: their existing transaction-owned output ports/adapters to write generation, receipt linkage, and initial convergence work without importing publication types
- Modify: `server/src/main/kotlin/com/readmates/publication/application/port/out/PublicReadCachePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/application/port/out/LoadPublishedPublicDataPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/redis/RedisPublicReadCacheAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicController.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt`
- Modify: `front/functions/api/bff/[[path]].ts`
- Modify: `front/functions/_shared/cache.ts`
- Modify: `front/tests/unit/cache.test.ts`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Create: `front/tests/e2e/public-projection-cache-safety.spec.ts`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Create: `server/src/test/kotlin/com/readmates/publication/api/PublicProjectionGenerationIntegrationTest.kt`

**Interfaces:**

```kotlin
data class PublicProjectionGeneration(
    val publicationId: UUID,
    val generation: Long,
    val liveRecordRevision: Long?,
    val originReadable: Boolean,
)
data class PublicMutationConvergenceReceipt(
    val mutationReceiptId: String,
    val convergenceId: UUID,
    val committedGeneration: Long,
)
enum class ConvergenceAttemptStatus { PENDING, SUCCEEDED, FAILED }
data class PublicConvergenceWork(
    val convergenceId: UUID,
    val nextAttemptNo: Int,
    val leaseOwner: String?,
    val leaseExpiresAt: Instant?,
)
data class PublicConvergenceEvent(
    val convergenceId: UUID,
    val attemptNo: Int,
    val eventSeq: Int,
    val status: ConvergenceAttemptStatus,
    val observedAt: Instant,
    val resultCategory: String?,
)
```

V54 stores generation/current origin projection, the immutable receipt-to-convergence link, a mutable `public_convergence_work` lease/outbox row, and append-only `public_convergence_events`. `(convergence_id, attempt_no)` names one provider invocation; events use `(convergence_id, attempt_no, event_seq)` for `PENDING` then one terminal outcome. Provider idempotency token is derived from `convergenceId + attemptNo`. Work rows may be claimed/released; receipt and event rows are never updated/deleted. Immutable linkage/events retain redacted publication/session UUID snapshots without a destructive content FK. It does not store raw provider response.

- [ ] **Step 1: Write RED migration and immutability tests.** Assert V54 upgrade/backfill; work lease schema; attempt/event ordering uniqueness; no update/delete path for receipt or events; current projection derives only from events with deterministic tie-break. Hard-delete an expired synthetic session/publication, assert deletion succeeds, operational rows follow their retention, and redacted immutable link/event bytes remain.
- [ ] **Step 2: Write RED origin/cache unit, integration, and pre-R2 browser tests.** Cover publish, correction, public placement, notes unpublish, public revoke, old body plus stale generation pointer, old-generation Redis hit, Redis unavailable, marker miss/DB failure, and stale-while-revalidate after revoke. The browser spec uses a controllable cache clock/fake edge to cover general 120 seconds, emergency ≤60 policy, a browser holding the old `120+600` response, Back/reload/new navigation, and no revoked-body SWR. The read path must validate current generation and `originReadable` from DB before returning Redis body; marker failure falls back to authoritative DB read or fails closed, never to cached allow.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.publication.api.PublicProjectionGenerationIntegrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/public-projection-cache-safety.spec.ts`

  Expected: FAIL because generation and convergence storage do not exist.

- [ ] **Step 4: Implement V54, producer-owned generation CAS, and immutable receipt link.** Domain transaction commits origin result, generation, feature-owned receipt, and initial convergence work atomically through the transaction owner's port. Publication reads/processes the shared tables but session/sessionrecord add no dependency on publication.
- [ ] **Step 5: Make origin, Redis, BFF, and browser boundaries generation/freshness aware.** Check authoritative marker before cached body, key Redis by generation, carry generation in validators/metadata, refuse revoked origin and unsafe SWR, and ensure BFF never caches deny/private/no-store/Set-Cookie/unsafe-Vary responses. Set every takedown-eligible public detail response to browser/edge `max-age<=60`; do not rely on changing headers after an incident.
- [ ] **Step 6: Run GREEN and existing cache/public regressions.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.publication.api.PublicProjectionGenerationIntegrationTest --tests com.readmates.publication.api.PublicControllerDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.publication.application.service.PublicQueryServiceCacheTest --tests com.readmates.publication.adapter.out.redis.RedisPublicReadCacheAdapterCircuitBreakerTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.publication.adapter.out.redis.RedisPublicReadCacheAdapterTest`

  Run: `corepack pnpm --dir front exec vitest run tests/unit/cache.test.ts tests/unit/cloudflare-bff.test.ts`

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/public-projection-cache-safety.spec.ts`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(publication): version public projections and convergence`

- [ ] **Step 8: Gate takedown activation in separately approved R2a and emit distinct cache evidence.** Deploy the A7+C1 backend and ≤60-second public-detail/BFF cache policy in an immutable R2a artifact while the browser host-client bundle remains v2 and takedown confirm remains disabled. The protected workflow first primes a browser with the pre-change response and records `preChangeCachedAt`, then records `policyDeployedAt`; wait until at least 720 seconds after the later timestamp. Run `public-projection-cache-safety.spec.ts` against origin, BFF, CDN, and that browser. CI binds R2a tag/git SHA/backend digest/Pages digest, the C1 safety source-set digest, four timestamps, exact cases, and results into ignored `front/output/host-rollout/cache-safety.manifest.json`, uploads and attests it, then runs the pinned `gh attestation verify` plus `verify-host-client-rollout-evidence.py --kind cache-safety`. Provider purge is supplementary evidence, never a substitute for the 720-second browser window. This distinct R2a evidence is a prerequisite for R2b v3 Pages, but does not require the Task 4 operator UI.

---

### Task 2: Process provider convergence and expose honest host status

**Files:**
- Create: `server/src/main/kotlin/com/readmates/publication/application/port/out/PublicCachePurgePort.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/service/PublicConvergenceService.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/adapter/in/scheduling/PublicConvergenceScheduler.kt`
- Create: provider-neutral HTTP adapter under `server/src/main/kotlin/com/readmates/publication/adapter/out/`
- Create: `server/src/main/kotlin/com/readmates/publication/config/PublicConvergenceProperties.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `.env.example`
- Add convergence DTO/query to host publication controller/application ports
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify after shared-shell plan Task 10 creates it: `front/features/host/ui/meeting-workspace/meeting-judgment-rail.tsx`
- Create: `server/src/test/kotlin/com/readmates/publication/application/service/PublicProjectionConvergenceIntegrationTest.kt`
- Create: `front/features/host/model/public-convergence-model.ts`
- Create: `front/features/host/model/public-convergence-model.test.ts`

**Interfaces:**

```kotlin
interface PublicCachePurgePort {
    fun requestPurge(command: PublicCachePurgeCommand): ProviderAttemptResult
}

data class PublicConvergenceView(
    val convergenceId: UUID,
    val originResult: String,
    val committedGeneration: Long,
    val status: String,
    val lastAttemptAt: Instant?,
    val retryable: Boolean,
)
```

Frontend labels distinguish `origin 반영 완료`, `회수 진행 중`, and `회수 실패`; provider failure cannot be rendered as mutation failure or silently as success.

- [ ] **Step 1: Write RED service tests.** Assert two-worker claim race, bounded lease, one logical provider invocation per `(convergenceId, attemptNo)`, PENDING then terminal event, failed attempt followed by a higher-numbered successful attempt, lease expiry, crash after provider success before terminal write, idempotent provider-token replay, max attempts/backoff, low-cardinality metrics, and immutable mutation receipt bytes/row.
- [ ] **Step 2: Write RED frontend model tests.** Assert origin success plus pending/failed provider status, retry eligibility, 120-second expectation copy, and no provider error detail.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.publication.application.service.PublicProjectionConvergenceIntegrationTest`

  Run: `corepack pnpm --dir front exec vitest run features/host/model/public-convergence-model.test.ts`

  Expected: FAIL because the service and UI model do not exist.

- [ ] **Step 4: Implement scheduler/service/provider port with bounded retry.** Claim/update only the mutable work lease. Append the attempt's PENDING event before the provider call and terminal event afterward; a retry after terminal failure increments attemptNo, while crash replay uses the same provider idempotency token. Never rewrite a previous event.
- [ ] **Step 5: Expose authority-checked convergence query and host UI after shared-shell Task 10.** Query returns bounded categories and timestamps only. Retry creates a higher-numbered attempt under the same convergenceId.
- [ ] **Step 6: Run GREEN and cache/front regressions.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.publication.application.service.PublicProjectionConvergenceIntegrationTest`

  Run: `corepack pnpm --dir front exec vitest run features/host/model/public-convergence-model.test.ts features/host/queries/host-session-queries.hooks.test.tsx`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(publication): track cache convergence attempts`

---

### Task 3: Implement platform-admin emergency public takedown

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V55__platform_admin_emergency_public_takedown.sql`
- Create: `server/src/main/kotlin/com/readmates/admin/takedown/adapter/in/web/PlatformAdminPublicTakedownController.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/takedown/adapter/in/web/PlatformAdminPublicTakedownDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/takedown/application/model/PublicTakedownModels.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/takedown/application/port/in/PublicTakedownUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/takedown/application/port/out/PublicTakedownPort.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/takedown/application/service/PublicTakedownService.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/takedown/adapter/out/persistence/JdbcPublicTakedownAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/security/Actors.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/audit/adapter/out/persistence/JdbcAdminAuditLedgerAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/takedown/api/PlatformAdminPublicTakedownIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/operations/api/PlatformAdminOperationsApiIntegrationTest.kt`

**Interfaces:**

```kotlin
data class PublicTakedownPreview(
    val previewId: UUID,
    val expiresAt: Instant,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val targetGeneration: Long,
    val currentSurfaces: Set<String>,
)
data class ConfirmPublicTakedownCommand(
    val previewId: UUID,
    val reasonCategory: String,
    val reason: String,
    val idempotencyKey: String,
)
```

Add `PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN` and grant it only to active OWNER/OPERATOR policy mappings. `PublicTakedownService` authorizes with `actor.can(EMERGENCY_PUBLIC_TAKEDOWN)`, never a raw role enum comparison.

Admin idempotency scope is `(platformAdminUserId, EMERGENCY_PUBLIC_TAKEDOWN, clubId, publicationId, key)`. Preview fixes target identity/generation/TTL. Confirm canonicalization includes a reason HMAC but audit stores only category and redacted reason summary.

- [ ] **Step 1: Write RED capability/preview tests.** Active OWNER and OPERATOR actors with `EMERGENCY_PUBLIC_TAKEDOWN` can preview/confirm. An OPERATOR-shaped actor without the capability, SUPPORT, inactive admin, cross-target, blank reason, expired preview, generation mismatch, and target mismatch fail closed.
- [ ] **Step 2: Write RED idempotency/convergence tests.** Same key/request yields one origin deny/admin receipt/purge command; different request conflicts; response loss reconciles; provider retry adds attempt under the same convergenceId. Assert raw reason/private body/provider error absent from DB/log/DTO.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.admin.takedown.api.PlatformAdminPublicTakedownIntegrationTest`

  Expected: FAIL because the takedown slice and V55 do not exist.

- [ ] **Step 4: Implement clean-architecture slice and transaction.** Application service checks `actor.can(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN)`, validates preview and idempotency, denies origin and rotates generation, writes immutable admin receipt with redacted target UUID snapshots and initial convergence work in one transaction. Feature activation fails closed until Task 1 Step 8 evidence proves the previous 720-second browser cache window has expired.
- [ ] **Step 5: Apply emergency cache behavior.** Origin deny, BFF eviction, CDN purge, and browser revalidation are distinct outcomes. Relevant public responses already have ≤60-second freshness before activation; revoke cannot return the old body through SWR. Existing stored/offline copy limitation is returned in preview/receipt copy.
- [ ] **Step 6: Run GREEN and admin auth/audit regressions.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.admin.takedown.api.PlatformAdminPublicTakedownIntegrationTest --tests com.readmates.admin.operations.api.PlatformAdminOperationsApiIntegrationTest`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(admin): add emergency public takedown`

---

### Task 4: Build the operator takedown and convergence experience

**Files:**
- Create: `front/features/platform-admin/api/platform-admin-takedown-contracts.ts`
- Create: `front/features/platform-admin/api/platform-admin-takedown-contracts.test.ts`
- Create: `front/features/platform-admin/api/platform-admin-takedown-api.ts`
- Create: `front/features/platform-admin/model/platform-admin-takedown-model.ts`
- Create: `front/features/platform-admin/model/platform-admin-takedown-model.test.ts`
- Create: `front/features/platform-admin/queries/platform-admin-takedown-queries.ts`
- Create: `front/features/platform-admin/queries/platform-admin-takedown-queries.test.tsx`
- Create: `front/features/platform-admin/route/admin-public-takedown-route.tsx`
- Create: `front/features/platform-admin/route/admin-public-takedown-route.test.tsx`
- Create: `front/features/platform-admin/ui/admin-public-takedown-workbench.tsx`
- Create: `front/features/platform-admin/ui/admin-public-takedown-workbench.test.tsx`
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts`
- Modify: `front/src/app/routes/admin.tsx`
- Create: `front/tests/e2e/platform-admin-public-takedown.spec.ts`
- Create: `front/tests/e2e/platform-admin-public-convergence.spec.ts`

**Interfaces:**

```ts
export type AdminTakedownState =
  | { kind: "idle" }
  | { kind: "preview"; preview: TakedownPreview }
  | { kind: "confirming"; preview: TakedownPreview }
  | { kind: "origin-denied"; receipt: TakedownReceipt; convergence: ConvergenceView }
  | { kind: "convergence-failed"; receipt: TakedownReceipt; convergence: ConvergenceView };
```

- [ ] **Step 1: Write RED contracts/model/UI tests.** Assert role/capability gating, explicit target identity/current surfaces/generation, non-blank reason, remote-copy limitation, one primary confirm, response-loss reconciliation, immutable receipt display, separate convergence timeline, and retry adding an attempt rather than repeating takedown.
- [ ] **Step 2: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run features/platform-admin/api/platform-admin-takedown-contracts.test.ts features/platform-admin/model/platform-admin-takedown-model.test.ts features/platform-admin/queries/platform-admin-takedown-queries.test.tsx features/platform-admin/route/admin-public-takedown-route.test.tsx features/platform-admin/ui/admin-public-takedown-workbench.test.tsx`

  Expected: FAIL because the frontend slice does not exist.

- [ ] **Step 3: Implement API/query/route/UI boundaries.** Keep platform-admin system navigation; do not insert club member/host workspace selector. Reuse existing admin command status/audit primitives where their semantics match.
- [ ] **Step 4: Add deterministic browser/edge evidence.** Use a controllable clock and fake edge/provider, never real 60/720-second sleeps. Test origin immediate deny, BFF eviction, CDN attempt, general 120-second convergence matrix, emergency 60-second fresh/revalidated navigation, full old `120+600` browser-window activation guard, provider fail/retry, SUPPORT denial, Back/reload, and no sensitive content in trace/HAR fixtures.
- [ ] **Step 5: Run GREEN and browser tests.**

  Run: `corepack pnpm --dir front exec vitest run features/platform-admin/api/platform-admin-takedown-contracts.test.ts features/platform-admin/model/platform-admin-takedown-model.test.ts features/platform-admin/queries/platform-admin-takedown-queries.test.tsx features/platform-admin/route/admin-public-takedown-route.test.tsx features/platform-admin/ui/admin-public-takedown-workbench.test.tsx`

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/platform-admin-public-takedown.spec.ts tests/e2e/platform-admin-public-convergence.spec.ts`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(admin): operate public takedown convergence`

## Workstream Completion Gate

- [ ] Run `./scripts/server-ci-check.sh` and `./server/gradlew -p server integrationTest`.
- [ ] Run the focused frontend unit tests, Task 1 public cache safety E2E, and both Task 4 platform-admin E2E specs.
- [ ] Prove mutation receipt row/content is unchanged across failed and successful provider attempts.
- [ ] Prove mutable leases drive work only and current convergence projection is derived from append-only events only.
- [ ] Prove architecture tests reject `session→publication` and `sessionrecord→publication`; do not change the feature-dependency baseline to approve producer-port leakage.
- [ ] Prove Redis outage leaves origin truth correct and old generation cannot reappear.
- [ ] Prove general revoke/update ≤120 seconds and emergency takedown ≤60 seconds under origin/BFF/CDN/browser boundaries, including the pre-enable wait for the prior `max-age=120 + stale-while-revalidate=600` browser lifetime.
- [ ] Hard-delete an expired synthetic session/publication and prove operational work follows retention while redacted immutable convergence/admin receipt bytes remain.
- [ ] Prove raw admin reason, provider error, private body, meeting URL/passcode, and credentials are absent from DB/log/DTO/artifacts.
- [ ] Leave ADR-0036/0037 Proposed until deployment/runtime evidence and active runbooks are complete.
