# ReadMates Residual Risk Closure

작성일: 2026-06-02
상태: DRAFT DESIGN SPEC

## 1. 배경

현재 ReadMates `main`은 `origin/main`보다 23커밋 앞서 있으며, 최근 변경은 `/admin/analytics` 운영 신뢰도, frontend/server contract confidence, host/member visual evidence, member reading momentum, notes/analytics query-plan guard를 포함한다.

직전 전체 분석에서 프런트 기본 검증, route-heavy E2E, public release candidate, public release scanner는 통과했다. 그러나 서버 통합 테스트에서 `MySqlQueryPlanTest`가 실패했고, 일부 문서는 이 실패 전 상태의 "리스크 없음" 결론을 아직 담고 있다. 따라서 현재 브랜치는 ship-ready가 아니다.

이 문서는 남은 리스크를 모두 닫기 위한 설계 기준을 고정한다. 실행 순서와 파일별 작업은 `docs/superpowers/plans/2026-06-02-readmates-residual-risk-closure-implementation-plan.md`를 따른다.

## 2. Source of Truth

- Agent router: `AGENTS.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Docs guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- Release readiness checklist: `docs/development/release-readiness-review.md`
- Test guide: `docs/development/test-guide.md`
- Current analytics confidence design: `docs/superpowers/specs/2026-06-01-readmates-ops-depth-confidence-evidence-design.md`
- Current contract/visual/reading momentum design: `docs/superpowers/specs/2026-06-01-readmates-contract-visual-reading-momentum-umbrella-design.md`

Current behavior must be verified against code, tests, scripts, and migrations. Historical `docs/superpowers/*` notes can provide context but must not override current source files.

## 3. Release Invariants

1. The current `origin/main..HEAD` branch cannot be described as residual-risk-free while a relevant integration test is failing.
2. Notes feed query paths must use targeted indexed access on source tables, especially `questions`, because member notes is a user-facing read path and the branch explicitly claims query-plan confidence.
3. Release-readiness documentation must reflect the verification that actually ran after the fix, not stale evidence from before the failure.
4. Frontend/server contract confidence must catch nested contract drift for the newly expanded surfaces, not only top-level response keys.
5. DEV-only frontend Zod schemas must be wired into API clients where the branch claims runtime/dev contract confidence.
6. Public release safety must remain clean: no real member data, secrets, private domains, local absolute paths, OCI/provider identifiers, or token-shaped examples.

## 4. Findings To Close

### P0: `MySqlQueryPlanTest` fails for notes feed `questions`

Evidence from 2026-06-02 validation:

```text
./server/gradlew -p server integrationTest \
  --tests com.readmates.contract.FrontendZodSchemaContractTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

Result:

```text
MySqlQueryPlanTest > notes feed union branches use indexed access on every source table() FAILED
EXPLAIN plan should use targeted indexed access for questions (notes feed question branch)
questions accessType=ALL, key=null
```

Relevant production SQL:

- `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
  - `loadNoteSessions(...)` already pins `questions force index (questions_club_session_created_idx)`.
  - `loadNotesFeed(...)` still uses plain `from questions` inside the union branch.

Decision:

- Apply the same targeted index policy to the `loadNotesFeed(...)` question branch.
- Keep the test SQL in `MySqlQueryPlanTest.NOTES_FEED_PLAN_SQL` aligned with production SQL so the guard tests the real query shape.
- Do not weaken `assertUsesIndexFor(...)`.
- Do not remove the notes feed guard or widen the accepted access types to hide the failure.

Acceptance criteria:

- `MySqlQueryPlanTest.notes feed union branches use indexed access on every source table` passes.
- The EXPLAIN row for `questions` uses a targeted access type and a non-empty key.
- `JdbcNotesFeedAdapter.loadNotesFeed(...)` and the test query both include the intentional indexed access strategy.

### P0: Release-readiness docs claim no residual risk while a guard fails

Evidence:

- `docs/development/release-readiness-review.md` says `MySqlQueryPlanTest` revalidated notes feed query-plan confidence.
- The same branch currently fails that test.

Decision:

- After the SQL/test fix passes, update release-readiness notes with the new 2026-06-02 closure evidence.
- The document must explicitly name the prior failure and the exact command that closed it.
- The document must keep "tests are evidence, not proof" semantics.

Acceptance criteria:

- Release-readiness docs no longer imply that the branch had no residual risk before the 2026-06-02 repair.
- The new note separates:
  - failed evidence observed before repair,
  - repair action,
  - verification commands that passed after repair,
  - remaining skipped validation, if any.

### P1: Contract confidence is shallow for expanded surfaces

Evidence:

- `FrontendZodSchemaContractTest` compares only top-level keys.
- `docs/development/adr/0009-frontend-backend-contract-via-zod.md` explicitly acknowledges that nested object field changes are not detected.
- New current-session and admin analytics fixture files contain nested structure, but the server test does not use that nested structure yet.

Decision:

- Upgrade the server contract comparison to recursively compare object key sets.
- For arrays, compare the first fixture element against the first actual element when both arrays are non-empty.
- Treat empty arrays as "shape unavailable" for nested array element checks, but continue checking the array key itself.
- Keep value semantics out of this test. This remains a shape-drift guard, not a content correctness test.

Acceptance criteria:

- A missing nested field such as `currentSession.attendees[0].rsvpStatus` is detectable when the fixture and actual response both have representative elements.
- Current fixtures continue to pass after the recursive comparison.
- ADR-0009 is updated so it no longer claims the server test is top-level only after the implementation lands.

### P1: DEV-only Zod schemas are not wired into the new API clients

Evidence:

- Host contracts already expose parser functions such as `parseHostSessionDetailResponse(...)` and host API clients call them in DEV mode.
- `CurrentSessionResponseSchema` and `AdminAnalyticsOverviewSchema` exist, but:
  - `getCurrentSession(...)` returns `readmatesFetch<CurrentSessionResponse>(...)` directly.
  - `fetchAdminAnalyticsOverview(...)` returns `readmatesFetch<AdminAnalyticsOverview>(...)` directly.

Decision:

- Add parser functions for current-session and admin analytics overview.
- Use those parsers in the corresponding API clients.
- Keep production behavior unchanged: parser functions return the value as-is outside DEV mode.

Acceptance criteria:

- DEV-mode unit tests prove valid payloads parse.
- DEV-mode unit tests prove missing nested required fields throw.
- API client tests or contract tests prove the parser functions are called for fetched values.
- Production build remains free of runtime Zod validation cost.

### P2: Verification command expectations need to match the repository's actual Gradle lanes

Evidence:

- `./server/gradlew -p server clean test` produced `BUILD SUCCESSFUL`, but `test SKIPPED`.
- The meaningful server checks for this branch are `integrationTest`, `architectureTest`, and targeted query-plan/query-budget tests.

Decision:

- Do not treat `clean test` alone as sufficient server evidence for this branch.
- Update docs and release-readiness evidence to name the exact server lanes that passed.

Acceptance criteria:

- Final verification includes targeted `integrationTest` for contract/query-plan/query-budget.
- `architectureTest` is run or explicitly reported as cache-backed evidence.
- If `clean test` remains skipped, final reporting says so plainly.

## 5. Scope

In scope:

- Notes feed SQL plan repair.
- Matching EXPLAIN guard repair.
- Release-readiness and test-guide documentation alignment.
- Recursive server contract shape comparison.
- DEV parser wiring for current-session and admin analytics overview.
- Focused unit/integration/E2E/public-release verification.

Out of scope:

- New routes, new product features, or visual redesign.
- Production runtime Zod validation for every API.
- Full OpenAPI generation.
- Pixel-diff visual regression policy.
- Public release scanner rule relaxation.
- Historical planning note rewrites beyond the new spec/plan and current release-readiness docs.

## 6. Architecture

### Server

The notes feed remains in the read-side `note` slice. `JdbcNotesFeedAdapter` owns SQL details. The application layer and controllers do not change.

The contract test remains a server integration test using MockMvc plus frontend fixture files. It becomes a deeper shape guard without becoming an OpenAPI validator.

### Frontend

The frontend keeps route-first dependency direction:

```text
src/app -> src/pages -> features -> shared
```

Current-session contract stays canonical in `front/shared/model/current-session-contracts.ts` because member home and host consumers already share it. Admin analytics overview keeps its schema in the platform-admin feature API contract.

Parser functions follow the existing host contract pattern:

```text
readmatesFetch<unknown>(...)
  -> parseFeatureResponse(value)
  -> typed response in DEV, cast in production
```

### Docs

Docs changes are factual corrections and execution guidance. They must avoid real deployment identifiers and keep public-safe wording.

## 7. Verification Matrix

Required after implementation:

```bash
git diff --check origin/main..HEAD
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts tests/e2e/host-club-operations.spec.ts tests/e2e/member-reading-momentum.spec.ts
./server/gradlew -p server integrationTest --tests com.readmates.contract.FrontendZodSchemaContractTest --tests com.readmates.performance.ServerQueryBudgetTest --tests com.readmates.performance.MySqlQueryPlanTest
./server/gradlew -p server architectureTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Optional but useful if execution changes broader frontend contract code:

```bash
pnpm --dir front zod:export-fixtures
git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
```

## 8. Completion Criteria

The remediation is complete only when:

- The P0 notes feed query-plan integration test passes.
- Release-readiness docs record the repaired evidence.
- Recursive contract shape checks pass for current fixtures.
- DEV parser wiring exists for current-session and admin analytics overview.
- Public-safe visual evidence E2E still passes.
- Public release candidate check passes.
- Final status names skipped or cache-backed validation accurately.
