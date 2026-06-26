# ReadMates Server Read-Model Performance Confidence v2 Design

## Purpose

ReadMates already has query-budget and MySQL query-plan guardrails for several important server read paths. The next useful improvement is to make those guardrails stronger for read models that compose multiple sections of member-facing state:

- `current-session`
- `archive` detail and member archive reads

The goal is not to change product behavior. The goal is to prove that these read paths remain bounded as seeded data grows, and to document the evidence well enough that future release-readiness reviews can use it.

## Scope

In scope:

- Add public-safe synthetic large fixture coverage for `current-session`.
- Add large-fixture and EXPLAIN coverage for the `archive` session detail read path.
- Extend `ServerQueryBudgetTest` and `MySqlQueryPlanTest` where the current test shape already fits.
- Keep cleanup deterministic so performance fixtures do not leak into other integration tests.
- Update contributor-facing confidence docs where they are stale, especially the server-state migration section in `docs/showcase/engineering-confidence.md`.

Out of scope:

- API response shape changes.
- Frontend route, BFF, auth, or UI changes.
- New production DB migrations unless query-plan evidence proves an index is required.
- Broad SQL rewrites or package refactors without a failing budget or EXPLAIN reason.
- Turning duration smoke checks into hard release gates.

## Architecture

The implementation should keep the existing server architecture boundary:

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

Performance confidence belongs in tests and test fixtures, not in controllers or application services. Production code should only change when a guard exposes a concrete SQL or query-shape problem.

Primary components:

- `LargeReadPathFixture`: public-safe synthetic data seeding and cleanup for high-volume read scenarios.
- `ServerQueryBudgetTest`: endpoint-level query count guard using real MockMvc requests.
- `MySqlQueryPlanTest`: MySQL EXPLAIN guard for core SQL fragments and indexes.
- `docs/development/test-guide.md`: command and interpretation guidance if the verification workflow changes.
- `docs/showcase/engineering-confidence.md`: current confidence map and known follow-up surfaces.

## Data Flow

1. The integration test seeds a large but deterministic synthetic read scenario under a fixture club.
2. The test calls the real server endpoint through MockMvc.
3. `QueryCounter` records prepared statement count for the request.
4. The assertion checks that the read path stays inside a fixed budget with a reason that explains why the number is acceptable.
5. Separate EXPLAIN tests assert that the SQL touches expected tables through indexed access.
6. Cleanup runs after every test so seeded rows do not affect unrelated integration tests.

Fixture values must remain public-safe. Use placeholder titles, authors, display names, masked or example emails only when needed, deterministic UUIDs, and no private domains, deployment state, secrets, OCIDs, raw tokens, or real member data.

## Target Read Paths

### Current Session

`JdbcCurrentSessionAdapter` composes the current member session from the open session, attendee list, requester RSVP/check-in/reviews/questions, board questions, and board long reviews. The existing budget test only covers an empty-state current-session response.

The v2 guard should add a seeded current-session scenario with enough participants and reading artifacts to prove that the query count remains bounded. If EXPLAIN evidence shows weak access paths, add query-plan assertions for the relevant participant, question, review, and highlight queries.

### Archive Detail

`archive` already has a higher query budget for hydrated detail and indexed-access coverage for the paged sessions query. The v2 guard should focus on session detail because the existing budget reason says it hydrates several independent detail sections without batching.

The implementation should add a large-fixture archive detail scenario and EXPLAIN coverage for the detail SQL. Do not expand every archive endpoint in one pass.

## Failure Handling

Query count failure:

- Treat as a likely accidental N+1 or new hydration section.
- Inspect the changed SQL and service orchestration before raising the budget.
- Increase a budget only when the added query is deliberate, bounded, and documented in the assertion reason.

EXPLAIN failure:

- Check whether fixture size, MySQL statistics, or SQL shape caused the plan change.
- Prefer a small SQL adjustment when the existing schema can support the desired access path.
- Add a migration only when the missing index is proven by query-plan evidence and the change is release-worthy.

Duration smoke failure:

- Use as a diagnostic signal, not the first hard gate.
- Keep query count and EXPLAIN index use as the primary regression defenses.

Cleanup failure:

- Fail the test and fix the fixture cleanup. A performance fixture that contaminates other tests is not acceptable evidence.

## Documentation

Update documentation only where it describes current confidence gates or current follow-up candidates.

Expected documentation touch points:

- `docs/showcase/engineering-confidence.md`: align the frontend server-state migration section with the current completed status and name the server read-model performance work as the active follow-up.
- `docs/development/test-guide.md`: update only if new commands or interpretation rules are added.
- `docs/development/release-readiness-review.md`: update only during implementation closeout if the branch changes release-risk evidence.

Historical `docs/superpowers` planning records should not be rewritten.

## Verification

Primary targeted verification:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

Server boundary verification:

```bash
./server/gradlew -p server architectureTest
./server/gradlew -p server check
```

Docs verification:

```bash
git diff --check -- <changed-docs>
```

If public-facing docs, release candidate behavior, scanner behavior, or release-readiness documentation changes, also run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

## Acceptance Criteria

- `current-session` has a large-fixture query-budget guard that exercises a non-trivial read model.
- The `archive` session detail read path has stronger large-fixture and EXPLAIN coverage.
- New fixture setup and cleanup are deterministic and safe to repeat.
- Any changed production SQL remains behind existing server clean-architecture boundaries.
- No API response shape, auth, BFF, frontend route, or UI behavior changes are introduced.
- Budget reasons explain the product intent behind the limit instead of recording a number without context.
- Stale confidence documentation is corrected.
- Verification commands are run or explicitly reported as skipped with reasons.

## Implementation Planning Notes

- Current-session must get endpoint-level large-fixture query-budget coverage. Add EXPLAIN assertions for the participant and artifact queries when those SQL fragments can be tested without creating brittle duplicated SQL.
- Archive session detail must get endpoint-level large-fixture coverage and EXPLAIN coverage for the detail SQL.
- Keep `LargeReadPathFixture` as one helper only while it remains easy to scan. If current-session and archive setup make it hard to read, split the helper into read-path-specific fixture methods or files during implementation.
