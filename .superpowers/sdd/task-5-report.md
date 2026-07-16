# Task 5 Report — AI Provider Circuit And Concurrency Gate

## Status

Implemented the approved Task 5 server slice: a Resilience4j-free application port, per-provider circuit/semaphore adapter, bounded configuration, bounded gate metrics, and an explicit architecture boundary.

## RED evidence

Command:

```bash
./server/gradlew -p server unitTest --tests '*ResilientProviderCallGateTest' --tests '*ServerArchitectureBoundaryTest'
```

Result: `BUILD FAILED` in `compileTestKotlin`, as expected, because `ProviderCallGate`, `ProviderPermitDecision`, `ProviderCircuitOutcome`, `ProviderGateRejection`, `ResilientProviderCallGate`, `ProviderCalls`, and the new metric APIs did not exist.

## GREEN evidence

```bash
./server/gradlew -p server unitTest --tests '*ResilientProviderCallGateTest' --tests '*AiGenerationMetricsTest'
```

Result: `BUILD SUCCESSFUL`; 30 tests, 0 failures (18 gate tests including parameterized classifications, 12 metric tests).

```bash
./server/gradlew -p server architectureTest
```

Result: `BUILD SUCCESSFUL`; 22 architecture tests, 0 failures.

```bash
./server/gradlew -p server detekt
git diff --check
```

Result: both passed.

The full `./scripts/server-ci-check.sh` reached and passed compilation, Detekt, architecture tests, and unit tests, but exited non-zero at `ktlintMainSourceSetCheck` for pre-existing/out-of-scope paths: `RedisProviderCallReservationAdapter.kt:117-124` indentation plus package-name scanner findings in the source checkout's `AiGenerationWebDtos.kt` and `AiGenerationErrorHandler.kt`. No Task 5 file remained in the final ktlint violation list.

## Self-review

- Circuit permission is acquired before the fair, non-blocking provider semaphore; a semaphore rejection releases circuit permission.
- OpenAI, Claude, and Gemini own independent semaphores and dedicated `aigen-provider-*` circuits.
- `TRANSIENT_FAILURE` uses `onError`; success and all ignored policy/content failure classes use `onSuccess`.
- Permit outcome and close are idempotent; `close()` releases the semaphore in `finally`, including reconciliation-failure paths.
- Configuration enforces timeout `(0, 4m]`, concurrency `1..16`, positive backoffs, and base not greater than max; YAML values remain environment-backed.
- Gate metric APIs accept only enum-backed provider/status/reason values and expose no attempt/job/trace/model/exception/URL/status-text tags.
- Application code and the outbound port contain no Resilience4j dependency.

## Remaining concern

The repository-wide server CI gate remains blocked by the out-of-scope ktlint findings listed above; Task 5 focused verification and architecture checks are green.
