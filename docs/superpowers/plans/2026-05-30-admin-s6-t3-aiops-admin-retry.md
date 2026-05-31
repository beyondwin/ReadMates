# Admin vNext S6-T3 — AI Ops Admin Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `RETRY_COMMIT` admin action to `/admin/ai-ops` that recovers a stuck `COMMITTING` AI-generation job back to `SUCCEEDED` so the host can re-commit it, OWNER/OPERATOR-gated and audit-ready.

**Architecture:** Server adds a new `RetryAiOpsJobCommitUseCase` implemented by `AiGenerationOpsService`. The action reuses the *exact* `COMMITTING → SUCCEEDED` recovery transition the commit service already performs on every internal commit failure (`AiGenerationJobStore.transitionStatus`). It introduces **no** new terminal state or transition semantics, writes **no** session content (the host re-commits), and crucially **does not delete the transient payload** (the result snapshot must survive for the host's re-commit — the key difference from force-cancel). Frontend adds the action to the union type, an API wrapper, a TanStack mutation, a UI button, and route wiring, mirroring the existing force-cancel slice end-to-end.

**Tech Stack:** Kotlin/Spring Boot (hexagonal: port-in interface + `@Service`), JUnit5 + AssertJ + MockMvc standalone; React/Vite + TanStack Query, Vitest + Testing Library, Playwright e2e with route mocking.

**Source spec:** `docs/superpowers/specs/2026-05-30-admin-vnext-s6-aiops-depth-s9-host-reinforcement-design.md` §5.2 (Slice B). This is the **first of three** sequential slices (B → C → D); this plan implements **only** Slice B.

**Key semantics (read before starting):** The host's `COMMIT_RETRY` is a pure frontend re-entry into the commit flow — there is no server commit-retry use-case to delegate to. Admin `RETRY_COMMIT` therefore means: a job stuck in `COMMITTING` (commit process died mid-flight; it is exactly a stale candidate) is reset to `SUCCEEDED`, unblocking the host to retry the commit themselves. See spec §5.2 "재정의 노트".

---

## File Structure

**Server — modify:**
- `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt` — add `RETRY_COMMIT` to `AiOpsAction` enum.
- `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt` — add `RetryAiOpsJobCommitUseCase` interface.
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt` — implement `retryCommit`, add `RETRY_COMMIT_STATUSES`, extend `availableActions`.
- `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt` — add `POST /jobs/{jobId}/retry-commit`, inject the use case.

**Server — modify tests:**
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt`
- `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt`

**Frontend — modify:**
- `front/features/platform-admin/model/platform-admin-domain-types.ts` — extend `PlatformAdminAiOpsAction` union.
- `front/features/platform-admin/api/platform-admin-api.ts` — add `retryCommitPlatformAdminAiJob`.
- `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts` — add `useRetryCommitPlatformAdminAiJobMutation`.
- `front/features/platform-admin/ui/platform-admin-ai-ops.tsx` — add `onRetryCommit` prop + button.
- `front/features/platform-admin/route/admin-ai-ops-route.tsx` — wire the mutation.

**Frontend — modify tests:**
- `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- `front/tests/e2e/platform-admin-ai-ops.spec.ts`

**Docs — modify:**
- `CHANGELOG.md` — Unreleased → Engineering entry.

---

## Task 1: Add `RETRY_COMMIT` to the action enum

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt:56`

- [ ] **Step 1: Extend the enum**

Change line 56 from:

```kotlin
enum class AiOpsAction { FORCE_CANCEL }
```

to:

```kotlin
enum class AiOpsAction { FORCE_CANCEL, RETRY_COMMIT }
```

- [ ] **Step 2: Compile to confirm no breakage**

Run: `./server/gradlew -p server compileKotlin`
Expected: BUILD SUCCESSFUL (the `when`/`if` over actions in `AiGenerationOpsService` does not exhaustively match on this enum, so no new compile error is expected).

- [ ] **Step 3: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt
git commit -m "feat(aigen): add RETRY_COMMIT to ai-ops action enum"
```

---

## Task 2: Add the `RetryAiOpsJobCommitUseCase` port

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt`

- [ ] **Step 1: Add the interface**

Append after the `ForceCancelAiOpsJobUseCase` interface (after line 38):

```kotlin
interface RetryAiOpsJobCommitUseCase {
    fun retryCommit(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult
}
```

(`AiOpsAdminActionResult`, `CurrentPlatformAdmin`, and `UUID` are already imported in this file.)

- [ ] **Step 2: Compile**

Run: `./server/gradlew -p server compileKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt
git commit -m "feat(aigen): add RetryAiOpsJobCommitUseCase port"
```

---

## Task 3: Service — `retryCommit` recovers a stuck COMMITTING job (failing test first)

**Files:**
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt`

- [ ] **Step 1: Write the failing tests**

In `AiGenerationOpsServiceTest.kt`, add these three tests after the existing `force cancel returns safe ops code...` test (after line 99). Note `AiGenerationTestFixtures.jobRecord(...)` is the fixture used elsewhere in this file; pass `status = JobStatus.COMMITTING`.

```kotlin
    @Test
    fun `operator can retry-commit a stuck committing job back to succeeded`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.COMMITTING, stage = JobStage.READY)
        jobStore.save(job)

        val result = service.retryCommit(admin(PlatformAdminRole.OPERATOR), job.jobId)

        assertThat(result.previousStatus).isEqualTo(JobStatus.COMMITTING)
        assertThat(result.nextStatus).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(jobStore.load(job.jobId)?.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(jobStore.transientPayloadDeleted).doesNotContain(job.jobId)
        assertThat(actionAudit.entries.single().action).isEqualTo("RETRY_COMMIT")
        assertThat(actionAudit.entries.single().previousStatus).isEqualTo("COMMITTING")
        assertThat(actionAudit.entries.single().nextStatus).isEqualTo("SUCCEEDED")
    }

    @Test
    fun `support admin cannot retry-commit`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.COMMITTING, stage = JobStage.READY)
        jobStore.save(job)

        assertThatThrownBy {
            service.retryCommit(admin(PlatformAdminRole.SUPPORT), job.jobId)
        }.isInstanceOf(AccessDeniedException::class.java)
        assertThat(jobStore.load(job.jobId)?.status).isEqualTo(JobStatus.COMMITTING)
        assertThat(actionAudit.entries).isEmpty()
    }

    @Test
    fun `retry-commit rejects a job that is not committing`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)
        jobStore.save(job)

        assertThatThrownBy {
            service.retryCommit(admin(PlatformAdminRole.OPERATOR), job.jobId)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)
        assertThat(actionAudit.entries).isEmpty()
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.AiGenerationOpsServiceTest"`
Expected: FAIL — compile error `unresolved reference: retryCommit` (the method does not exist yet).

- [ ] **Step 3: Implement `retryCommit` in the service**

In `AiGenerationOpsService.kt`:

1. Add the import at the top (alongside the other `port.in` imports, around line 15-18):

```kotlin
import com.readmates.aigen.application.port.`in`.RetryAiOpsJobCommitUseCase
```

2. Add the interface to the class declaration (line 41-44). Change:

```kotlin
) : GetAiOpsSummaryUseCase,
    ListAiOpsJobsUseCase,
    GetAiOpsJobUseCase,
    ForceCancelAiOpsJobUseCase {
```

to:

```kotlin
) : GetAiOpsSummaryUseCase,
    ListAiOpsJobsUseCase,
    GetAiOpsJobUseCase,
    ForceCancelAiOpsJobUseCase,
    RetryAiOpsJobCommitUseCase {
```

3. Add the method immediately after `forceCancel` (after line 179, before `safeMissingLiveJob`):

```kotlin
    override fun retryCommit(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult {
        if (admin.role !in ACTION_ROLES) {
            throw AccessDeniedException("Platform admin role ${admin.role} cannot retry AI generation commits")
        }
        val record =
            jobStore.findJobById(jobId)
                ?: throw safeMissingLiveJob(jobId)
        if (record.status !in RETRY_COMMIT_STATUSES) {
            throw AiGenerationException.IllegalGenerationState(jobId, record.status.name, "admin retry-commit")
        }
        val reset =
            jobStore.transitionStatus(
                jobId = jobId,
                expected = RETRY_COMMIT_STATUSES,
                next = JobStatus.SUCCEEDED,
                stage = JobStage.READY,
                progressPct = 100,
                error = null,
            )
        if (!reset) {
            throw AiGenerationException.IllegalGenerationState(
                jobId = jobId,
                currentStatus = jobStore.load(jobId)?.status?.name ?: "MISSING",
                attemptedAction = "admin retry-commit",
            )
        }
        // Intentionally NOT calling deleteTransientPayload: the host needs the
        // result snapshot to survive so it can re-commit the recovered job.
        adminActionAuditPort.record(
            AiGenerationAdminActionAuditEntry(
                jobId = jobId,
                clubId = record.clubId,
                sessionId = record.sessionId,
                adminUserId = admin.userId,
                adminRole = admin.role,
                action = AiOpsAction.RETRY_COMMIT.name,
                previousStatus = record.status.name,
                nextStatus = JobStatus.SUCCEEDED.name,
                result = "SUCCESS",
                safeErrorCode = null,
                createdAt = clock.instant(),
            ),
        )
        return AiOpsAdminActionResult(jobId, record.status, JobStatus.SUCCEEDED)
    }
```

4. Add `JobStage` to imports if not present. Check the existing imports — `JobStatus` is imported (line 14) but `JobStage` may not be. Add alongside it:

```kotlin
import com.readmates.aigen.application.model.JobStage
```

5. Add `RETRY_COMMIT_STATUSES` to the `companion object` (after line 218, alongside `FORCE_CANCEL_STATUSES`):

```kotlin
        val RETRY_COMMIT_STATUSES = setOf(JobStatus.COMMITTING)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.AiGenerationOpsServiceTest"`
Expected: PASS (all tests, including the 5 pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt
git commit -m "feat(aigen): recover stuck committing job via admin retry-commit"
```

---

## Task 4: Service — expose `RETRY_COMMIT` in `availableActions` (failing test first)

**Files:**
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt:212`

- [ ] **Step 1: Write the failing test**

Add after the tests from Task 3:

```kotlin
    @Test
    fun `committing job lists both force-cancel and retry-commit actions`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.COMMITTING, stage = JobStage.READY)
        jobStore.save(job)

        val item = service.list(admin(PlatformAdminRole.OWNER), AiOpsJobFilters(null, null, null, null)).items.single()

        assertThat(item.availableActions)
            .containsExactlyInAnyOrder(AiOpsAction.FORCE_CANCEL, AiOpsAction.RETRY_COMMIT)
    }

    @Test
    fun `running job lists only force-cancel`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)
        jobStore.save(job)

        val item = service.list(admin(PlatformAdminRole.OWNER), AiOpsJobFilters(null, null, null, null)).items.single()

        assertThat(item.availableActions).containsExactly(AiOpsAction.FORCE_CANCEL)
    }
```

Add the import if missing (top of the test file alongside the other `application.model` imports):

```kotlin
import com.readmates.aigen.application.model.AiOpsAction
```

- [ ] **Step 2: Run to verify failure**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.AiGenerationOpsServiceTest"`
Expected: FAIL — `committing job lists both...` fails because `availableActions` currently yields only `FORCE_CANCEL`.

- [ ] **Step 3: Update `availableActions` computation**

In `AiGenerationOpsService.kt`, replace line 212:

```kotlin
            availableActions = if (status in FORCE_CANCEL_STATUSES) setOf(AiOpsAction.FORCE_CANCEL) else emptySet(),
```

with:

```kotlin
            availableActions =
                buildSet {
                    if (status in FORCE_CANCEL_STATUSES) add(AiOpsAction.FORCE_CANCEL)
                    if (status in RETRY_COMMIT_STATUSES) add(AiOpsAction.RETRY_COMMIT)
                },
```

- [ ] **Step 4: Run to verify pass**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.AiGenerationOpsServiceTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt
git commit -m "feat(aigen): expose retry-commit in ai-ops available actions"
```

---

## Task 5: Controller — `POST /jobs/{jobId}/retry-commit` (failing test first)

**Files:**
- Test: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt`

- [ ] **Step 1: Write the failing test + fake**

In `AiGenerationOpsControllerTest.kt`:

1. Add a fake field next to `cancel` (after line 43):

```kotlin
    private val retry = FakeRetryCommitUseCase()
```

2. Pass it into the controller in `setUp()` (the `AiGenerationOpsController(...)` call, after `forceCancelUseCase = cancel,`):

```kotlin
                        retryCommitUseCase = retry,
```

3. Add the import (alongside the other `port.in` imports near line 17):

```kotlin
import com.readmates.aigen.application.port.`in`.RetryAiOpsJobCommitUseCase
```

4. Add the test after the `force cancel delegates to use case` test (after line 177):

```kotlin
    @Test
    fun `retry commit delegates to use case`() {
        retry.result = AiOpsAdminActionResult(sampleJobId, JobStatus.COMMITTING, JobStatus.SUCCEEDED)

        mockMvc
            .post("/api/admin/ai-generation/jobs/$sampleJobId/retry-commit")
            .andExpect {
                status { isOk() }
                jsonPath("$.jobId") { value(sampleJobId.toString()) }
                jsonPath("$.previousStatus") { value("COMMITTING") }
                jsonPath("$.nextStatus") { value("SUCCEEDED") }
            }

        assertThat(retry.calls).containsExactly(admin to sampleJobId)
    }
```

5. Add the fake class after `FakeForceCancelUseCase` (after line 255):

```kotlin
private class FakeRetryCommitUseCase : RetryAiOpsJobCommitUseCase {
    lateinit var result: AiOpsAdminActionResult
    val calls = mutableListOf<Pair<CurrentPlatformAdmin, UUID>>()

    override fun retryCommit(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult {
        calls += admin to jobId
        return result
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.adapter.in.web.AiGenerationOpsControllerTest"`
Expected: FAIL — compile error: `AiGenerationOpsController` has no `retryCommitUseCase` parameter.

- [ ] **Step 3: Implement the controller endpoint**

In `AiGenerationOpsController.kt`:

1. Add the import (alongside the other `port.in` imports, near line 6-9):

```kotlin
import com.readmates.aigen.application.port.`in`.RetryAiOpsJobCommitUseCase
```

2. Add the constructor parameter (after `forceCancelUseCase`, line 27):

```kotlin
    private val retryCommitUseCase: RetryAiOpsJobCommitUseCase,
```

3. Add the endpoint after `forceCancel` (after line 66, before the closing brace):

```kotlin
    @PostMapping("/jobs/{jobId}/retry-commit")
    fun retryCommit(
        admin: CurrentPlatformAdmin,
        @PathVariable jobId: UUID,
    ): AiOpsAdminActionResponse = AiOpsAdminActionResponse.from(retryCommitUseCase.retryCommit(admin, jobId))
```

- [ ] **Step 4: Run to verify pass**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.adapter.in.web.AiGenerationOpsControllerTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt
git commit -m "feat(aigen): add ai-ops retry-commit endpoint"
```

---

## Task 6: Server slice regression

- [ ] **Step 1: Run aigen unit tests + architecture test**

Run: `./server/gradlew -p server unitTest`
Expected: PASS. (No new package boundaries are crossed, so `architectureTest` is not strictly required, but run it if the slice touched the registry: `./server/gradlew -p server architectureTest`.)

- [ ] **Step 2: No commit (verification only).** If anything fails, fix the offending task before proceeding to frontend.

---

## Task 7: Frontend — extend the action union type

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-domain-types.ts:145`

- [ ] **Step 1: Extend the union**

Change line 145 from:

```typescript
export type PlatformAdminAiOpsAction = "FORCE_CANCEL";
```

to:

```typescript
export type PlatformAdminAiOpsAction = "FORCE_CANCEL" | "RETRY_COMMIT";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --dir front exec tsc -p tsconfig.json --noEmit`
Expected: PASS (no usages narrow on the old single-member type).

- [ ] **Step 3: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-domain-types.ts
git commit -m "feat: add RETRY_COMMIT to admin ai-ops action type"
```

---

## Task 8: Frontend — API wrapper

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-api.ts:131-137`

- [ ] **Step 1: Add the wrapper**

After `forceCancelPlatformAdminAiJob` (after line 137), add:

```typescript
export function retryCommitPlatformAdminAiJob(jobId: string) {
  return readmatesFetch<PlatformAdminAiOpsActionResponse>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}/retry-commit`,
    { method: "POST" },
    { clubSlug: undefined },
  );
}
```

(`PlatformAdminAiOpsActionResponse` is already imported at line 5.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --dir front exec tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add front/features/platform-admin/api/platform-admin-api.ts
git commit -m "feat: add admin ai-ops retry-commit api wrapper"
```

---

## Task 9: Frontend — TanStack mutation (failing test first)

**Files:**
- Test: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`

- [ ] **Step 1: Write the failing test**

In `platform-admin-ai-ops-queries.test.tsx`:

1. Add `retryCommitPlatformAdminAiJob` to the `vi.mock` factory (line 10-14):

```typescript
vi.mock("@/features/platform-admin/api/platform-admin-api", () => ({
  fetchPlatformAdminAiOpsJobs: vi.fn(),
  fetchPlatformAdminAiOpsSummary: vi.fn(),
  forceCancelPlatformAdminAiJob: vi.fn(),
  retryCommitPlatformAdminAiJob: vi.fn(),
}));
```

2. Add it to the import block (line 16-20):

```typescript
import {
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  forceCancelPlatformAdminAiJob,
  retryCommitPlatformAdminAiJob,
} from "@/features/platform-admin/api/platform-admin-api";
```

3. Add it to the queries import (line 21-26):

```typescript
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsKeys,
  platformAdminAiOpsSummaryQuery,
  useForceCancelPlatformAdminAiJobMutation,
  useRetryCommitPlatformAdminAiJobMutation,
} from "./platform-admin-ai-ops-queries";
```

4. Reset it in `beforeEach` (after line 74):

```typescript
  vi.mocked(retryCommitPlatformAdminAiJob).mockReset();
```

5. Add the test inside the `"platform admin AI Ops mutation cache behavior"` describe block (after line 129):

```typescript
  it("invalidates summary and ledger queries after retry commit", async () => {
    vi.mocked(retryCommitPlatformAdminAiJob).mockResolvedValue({
      jobId: "job-1",
      previousStatus: "COMMITTING",
      nextStatus: "SUCCEEDED",
    });
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRetryCommitPlatformAdminAiJobMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("job-1");
    });

    expect(retryCommitPlatformAdminAiJob).toHaveBeenCalledWith("job-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: platformAdminAiOpsKeys.all });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --dir front test -- platform-admin-ai-ops-queries`
Expected: FAIL — `useRetryCommitPlatformAdminAiJobMutation` is not exported.

- [ ] **Step 3: Implement the mutation**

In `platform-admin-ai-ops-queries.ts`:

1. Add to the api import (line 2-6):

```typescript
import {
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  forceCancelPlatformAdminAiJob,
  retryCommitPlatformAdminAiJob,
} from "@/features/platform-admin/api/platform-admin-api";
```

2. Add the hook after `useForceCancelPlatformAdminAiJobMutation` (after line 45):

```typescript
export function useRetryCommitPlatformAdminAiJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => retryCommitPlatformAdminAiJob(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminAiOpsKeys.all }),
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --dir front test -- platform-admin-ai-ops-queries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx
git commit -m "feat: add admin ai-ops retry-commit mutation"
```

---

## Task 10: Frontend — UI button (failing test first)

**Files:**
- Test: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`

- [ ] **Step 1: Write the failing tests**

In `platform-admin-ai-ops.test.tsx`, add a committing-job fixture after `runningJob` (after line 44):

```typescript
const committingJob: PlatformAdminAiOpsJobView = {
  ...runningJob,
  jobId: "job-2",
  status: "COMMITTING",
  stage: "READY",
  availableActions: ["FORCE_CANCEL", "RETRY_COMMIT"],
};
```

Add these tests inside the `describe("PlatformAdminAiOps", ...)` block (after line 70):

```typescript
  it("lets owner and operator roles retry-commit a committing job", async () => {
    const onRetryCommit = vi.fn();
    const user = userEvent.setup();

    render(
      <PlatformAdminAiOps role="OPERATOR" summary={summary} jobs={[committingJob]} onRetryCommit={onRetryCommit} />,
    );

    await user.click(screen.getByRole("button", { name: "Retry commit" }));

    expect(onRetryCommit).toHaveBeenCalledWith("job-2");
  });

  it("hides retry-commit from support role", () => {
    render(<PlatformAdminAiOps role="SUPPORT" summary={summary} jobs={[committingJob]} />);

    expect(screen.queryByRole("button", { name: "Retry commit" })).not.toBeInTheDocument();
  });

  it("does not show retry-commit when the job does not offer it", () => {
    render(<PlatformAdminAiOps role="OWNER" summary={summary} jobs={[runningJob]} onRetryCommit={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Retry commit" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --dir front test -- platform-admin-ai-ops.test`
Expected: FAIL — `onRetryCommit` is not a prop and the "Retry commit" button is not rendered.

- [ ] **Step 3: Add the prop and button**

In `platform-admin-ai-ops.tsx`:

1. Add `onRetryCommit` to `PlatformAdminAiOpsProps` (after line 45, the `onForceCancel` line):

```typescript
  onRetryCommit?: (jobId: string) => void;
```

2. Add it to the destructured params (after line 59, `onForceCancel,`):

```typescript
  onRetryCommit,
```

3. Replace the force-cancel button block (lines 166-170) with both buttons:

```tsx
              {canAct ? (
                <div className="platform-admin-ai-ops__job-actions">
                  {job.availableActions.includes("FORCE_CANCEL") ? (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => onForceCancel?.(job.jobId)}>
                      Force cancel
                    </button>
                  ) : null}
                  {job.availableActions.includes("RETRY_COMMIT") ? (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => onRetryCommit?.(job.jobId)}>
                      Retry commit
                    </button>
                  ) : null}
                </div>
              ) : null}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --dir front test -- platform-admin-ai-ops.test`
Expected: PASS (including the pre-existing force-cancel tests — the `Force cancel` button name is unchanged).

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/ui/platform-admin-ai-ops.tsx front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx
git commit -m "feat: render admin ai-ops retry-commit action button"
```

---

## Task 11: Frontend — wire the mutation in the route

**Files:**
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx`

- [ ] **Step 1: Import the new hook**

In the queries import block (line 5-9), add `useRetryCommitPlatformAdminAiJobMutation`:

```typescript
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
  useForceCancelPlatformAdminAiJobMutation,
  useRetryCommitPlatformAdminAiJobMutation,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
```

- [ ] **Step 2: Instantiate and pass it**

After line 26 (`const forceCancel = ...`), add:

```typescript
  const retryCommit = useRetryCommitPlatformAdminAiJobMutation();
```

In the `<PlatformAdminAiOps ... />` JSX, after `onForceCancel={(jobId) => forceCancel.mutate(jobId)}` (line 51), add:

```tsx
        onRetryCommit={(jobId) => retryCommit.mutate(jobId)}
```

- [ ] **Step 3: Typecheck + route test**

Run: `pnpm --dir front exec tsc -p tsconfig.json --noEmit && pnpm --dir front test -- admin-ai-ops-route`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add front/features/platform-admin/route/admin-ai-ops-route.tsx
git commit -m "feat: wire admin ai-ops retry-commit mutation in route"
```

---

## Task 12: E2E — owner sees a retry-commit affordance on a committing job

**Files:**
- Modify: `front/tests/e2e/platform-admin-ai-ops.spec.ts`

- [ ] **Step 1: Add a committing job to the jobs mock and a new test**

In the `**/api/bff/api/admin/ai-generation/jobs` route handler, add a second item to the `items` array (after the existing `job-1` object, inside the array at line 104):

```typescript
        {
          jobId: "job-2",
          club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
          session: { sessionId: "session-2", number: 8, bookTitle: "Stuck Book" },
          status: "COMMITTING",
          stage: "READY",
          provider: "OPENAI",
          model: "gpt-model",
          errorCode: null,
          safeErrorMessage: null,
          costEstimateUsd: "0.1500",
          createdAt: "2026-05-18T00:00:00Z",
          lastUpdatedAt: "2026-05-18T00:02:00Z",
          expiresAt: "2026-05-18T06:00:00Z",
          staleCandidate: true,
          availableActions: ["FORCE_CANCEL", "RETRY_COMMIT"],
        },
```

Add this test at the end of the file (after line 146):

```typescript
test("platform owner sees retry-commit affordance on a committing job", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");

  await page.goto("/admin/ai-ops");

  await expect(page.getByText("Stuck Book")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry commit" })).toBeVisible();
});

test("platform support cannot retry-commit", async ({ page }) => {
  await routePlatformAdminShell(page, "SUPPORT");

  await page.goto("/admin/ai-ops");

  await expect(page.getByText("Stuck Book")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry commit" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `pnpm --dir front test:e2e -- platform-admin-ai-ops`
Expected: PASS. (The pre-existing `force cancel` and `cost window` tests must still pass — adding a second job does not change their assertions, which target `Book`/`Force cancel`.)

- [ ] **Step 3: Commit**

```bash
git add front/tests/e2e/platform-admin-ai-ops.spec.ts
git commit -m "test: cover admin ai-ops retry-commit affordance e2e"
```

---

## Task 13: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md` (Unreleased → `### Engineering`)

- [ ] **Step 1: Add the entry**

Add a new bullet at the top of the `### Engineering` list under `## Unreleased` (describe shipped behavior, not plan language — per closeout roadmap §11):

```markdown
- **platform-admin:** `/admin/ai-ops` now offers an OWNER/OPERATOR `Retry commit` action on jobs stuck in `COMMITTING`. It recovers the job to `SUCCEEDED` (reusing the commit service's existing recovery transition) so the host can re-commit, without admin writing any session content and without deleting the result snapshot. The action is audit-logged (`RETRY_COMMIT`, COMMITTING→SUCCEEDED) and SUPPORT is denied. No new generation state or transition semantics were introduced.
```

- [ ] **Step 2: Sanity-check the changelog renders**

Run: `git diff --check -- CHANGELOG.md`
Expected: no whitespace errors.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: record admin ai-ops retry-commit in changelog"
```

---

## Task 14: Full slice regression

- [ ] **Step 1: Server**

Run: `./server/gradlew -p server unitTest`
Expected: PASS.

- [ ] **Step 2: Frontend lint + unit + build**

Run: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
Expected: PASS.

- [ ] **Step 3: E2E (auth/BFF/admin-route surface touched)**

Run: `pnpm --dir front test:e2e -- platform-admin-ai-ops`
Expected: PASS.

- [ ] **Step 4: Browser smoke QA (manual)**

Start the dev stack, log in as the platform OWNER dev fixture, open `/admin/ai-ops`. Confirm: a `COMMITTING` job shows both `Force cancel` and `Retry commit`; clicking `Retry commit` flips the job to `SUCCEEDED` and the list refetches; SUPPORT sees neither button. If the environment cannot produce a `COMMITTING` job, report that the manual step was skipped and why (the e2e mock covers the affordance).

- [ ] **Step 5: Public-safety scan of changed files**

Confirm no raw provider error, transcript, generated result JSON, member email, secret, OCID, or local path was added to any changed file (UI copy, fixtures, e2e mocks, CHANGELOG).

---

## Cross-cutting hardening checklist (spec §7, touched surface only)

- [ ] **Consistency:** `Retry commit` button uses the same `btn btn-quiet btn-sm` tone as `Force cancel`; the two share a `platform-admin-ai-ops__job-actions` container.
- [ ] **Accessibility:** both buttons are real `<button type="button">` elements with discernible text names, keyboard-focusable in source order.
- [ ] **Mobile:** the job-actions container wraps without overflow on a narrow viewport (verify in the browser smoke QA).
- [ ] **Empty/error:** retry-commit is only offered when `availableActions` includes it; safe failure copy only (no provider raw error surfaced). The recovery path keeps the result snapshot so the host's honest "ready to commit" state is preserved.

---

## Self-Review notes (author)

- **Spec coverage (§5.2):** `RETRY_COMMIT` enum (T1), role-gated use-case delegating to the existing recovery transition with no payload delete (T2–T3), status-driven `availableActions` (T4), audit-ready entry (T3), frontend union/api/mutation/UI/route (T7–T11), e2e (T12), CHANGELOG (T13). The spec's original "delegate to host commit-retry use-case" wording was corrected in §5.2's 재정의 노트 because no such server use-case exists.
- **Type consistency:** server `AiOpsAction.RETRY_COMMIT` ↔ frontend `"RETRY_COMMIT"`; response shape `AiOpsAdminActionResponse {jobId, previousStatus, nextStatus}` ↔ `PlatformAdminAiOpsActionResponse`; endpoint `POST /api/admin/ai-generation/jobs/{jobId}/retry-commit` ↔ api wrapper path. Button accessible name `"Retry commit"` is identical across UI test, e2e test, and component.
- **Dependency on adjacent slices:** none. Slice C (health/audit → ai-ops drilldown) and Slice D (host-surface) are separate plans and are not touched here.
