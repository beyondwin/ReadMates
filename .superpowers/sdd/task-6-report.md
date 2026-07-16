# Task 6 Report: Centralize Bounded AI Provider Calls

## Outcome

Task 6 now owns grounded generation and regeneration provider calls through one pure policy and one physical-call coordinator. The policy caps every job at three physical calls and allows at most one fallback, schema correction, and section repair. Redis reservation independently enforces both the hard call ceiling and the once-per-job branch modes across crashes and redelivery.

The coordinator executes the required lifecycle in this order:

1. `gate.tryAcquire`
2. `reservations.reserve`
3. exactly one `generate` or `repair`
4. `reservations.reconcile`
5. provider-attempt audit
6. `permit.record`
7. `permit.close`

No backoff sleep occurs while a permit is held. Grounded generation and regeneration route through the coordinator, and the worker marks unresolved in-flight attempts unknown before a redelivered grounded generation. Regeneration first acquires its admission lease, then performs recovery, so a losing concurrent request cannot mark the winner's live attempt unknown.

## TDD Evidence

- Policy/coordinator RED: the focused test command failed to compile because `GroundedProviderCallPolicy` and `GroundedProviderCallCoordinator` did not exist.
- Executor RED: constructor and routing assertions failed before both grounded executors used the coordinator.
- Persisted branch replay RED: the Redis test failed to compile because `ModeAlreadyUsed` did not exist; it passed after the atomic Lua reservation rule was added.
- Regeneration concurrency RED: cost denial observed `markCalls == 1`; after admission-before-recovery ordering it observes zero recovery calls.
- Property test explores all 55,986 outcome sequences through length six and proves ordinal `<= 3`, fallback `<= 1`, schema correction `<= 1`, and section repair `<= 1`.
- Recording coordinator tests prove gate/reservation rejection causes zero transport calls, actual usage reconciles as `ACTUAL`, uncertain transport failure reconciles as `ESTIMATED_UNKNOWN`, and reconciliation failure causes no second physical request in the invocation.

## Crash And Redelivery Proof

- `AiGenerationJobConsumerIntegrationTest` proves a thrown worker invocation is redelivered by Kafka.
- `RedisProviderCallReservationAdapterTest` simulates a crash after reservation/provider acceptance and before reconciliation, marks the first attempt `UNKNOWN`, and proves total reservations cannot exceed three.
- A second Redis replay test proves `FALLBACK`, `SCHEMA_CORRECTION`, and `SECTION_REPAIR` cannot each be reserved twice for the same job, even when policy memory is reconstructed by redelivery.

## Verification

Passed:

```text
./server/gradlew -p server unitTest --tests '*GroundedProviderCallPolicyTest' --tests '*GroundedProviderCallCoordinatorTest' --tests '*GroundedGenerationExecutorTest' --tests '*GroundedRegenerationExecutorTest' --tests '*AiGenerationWorkerTest' --tests '*AiGenerationWorkerFailoverTest' --tests '*ProviderFallbackChainTest'
./server/gradlew -p server integrationTest --tests '*AiGenerationJobConsumerIntegrationTest' --tests '*RedisProviderCallReservationAdapterTest'
./server/gradlew -p server detekt
./server/gradlew -p server architectureTest
git diff --check
```

The repository-wide ktlint wrapper remains blocked by pre-existing findings outside Task 6: the Task 5 `ResilientProviderCallGateTest` expression-body finding and package-name findings read from the root checkout. Task 6-owned source and tests have no remaining ktlint findings.

## Step 7 Sequencing Exception And Task 11 Ledger

Literal deletion of `incrementLlmCallCount`, `reserveLlmCall`, `LlmCallReservation`, `recordUsage`, and `renewAdmission` would break the still-compiled legacy direct-provider pipeline assigned to Task 11. Per the approved sequencing decision, Task 6 does not invent a second legacy coordinator or pull Task 11 forward.

- Grounded generation, grounded regeneration, and the coordinator have zero call sites for those old accounting APIs.
- Remaining APIs are explicitly deprecated as `LEGACY transition bridge; remove with direct-provider sources in Task 11`.
- `AiGenerationWorker` old API references remain only inside its legacy branch.
- **Mandatory Task 11 deletion item:** delete all deprecated accounting declarations, Redis implementations, fakes/tests, and legacy worker/service call sites after the legacy direct-provider sources are removed.

## Review

Independent review found durable once-only mode enforcement and regeneration recovery ordering as important issues. Both were fixed with the RED/GREEN cases above. Remaining risk is limited to the explicitly deferred Task 11 legacy bridge and the unrelated repository ktlint baseline.
