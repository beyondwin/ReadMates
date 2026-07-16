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

Result: `BUILD SUCCESSFUL`; 30 tests, 0 failures. The initial gate suite included redundant failure-label parameterizations; the review follow-up below replaces them with direct outcome-dispatch coverage.

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
- The gate dispatches `TRANSIENT_FAILURE` to `onError` and `SUCCESS`/`IGNORED_FAILURE` to `onSuccess`. Mapping timeout, HTTP, policy, schema, parse, and grounding failures to those outcomes remains a Task 6 coordinator responsibility.
- Permit outcome and close are idempotent; `close()` releases the semaphore in `finally`, including reconciliation-failure paths.
- Configuration enforces timeout `(0, 4m]`, concurrency `1..16`, positive backoffs, and base not greater than max; YAML values remain environment-backed.
- Gate metric APIs accept only enum-backed provider/status/reason values and expose no attempt/job/trace/model/exception/URL/status-text tags.
- Application code and the outbound port contain no Resilience4j dependency.

## Remaining concern

The repository-wide server CI gate remains blocked by the out-of-scope ktlint findings listed above; Task 5 focused verification and architecture checks are green.

## Review follow-up — linearized permit lifecycle

Review found that independent `recorded` and `closed` atomics allowed this interleaving: `close()` returned circuit permission and released the semaphore, then a later `record()` still updated the circuit. This was invalid for HALF_OPEN probe accounting.

RED command:

```bash
./server/gradlew -p server unitTest --tests '*ResilientProviderCallGateTest'
```

Result: 11 tests executed, 1 expected failure: `close winning the lifecycle race prevents later circuit recording` observed a failed circuit call after close.

The permit now uses one synchronized `ACTIVE -> RECORDED -> CLOSED` lifecycle. The coordinator's normal flow is `record(outcome, elapsed)` exactly once followed by `close()` from `finally`. A close that wins while active returns circuit permission and releases the semaphore exactly once; every later record/close is a no-op. A successful record accounts the circuit before entering `RECORDED`, and close after that releases only the semaphore.

The follow-up also proves that a HALF_OPEN circuit permission acquired before a semaphore rejection is returned by successfully reaching the same semaphore rejection on the next probe. Misleading failure-label parameterizations were replaced by three direct dispatch tests for `SUCCESS`, `IGNORED_FAILURE`, and `TRANSIENT_FAILURE`; raw failure classification remains outside the gate.

GREEN evidence:

```bash
./server/gradlew -p server unitTest --tests '*ResilientProviderCallGateTest' --tests '*AiGenerationMetricsTest'
./server/gradlew -p server architectureTest
./server/gradlew -p server detekt
git diff --check
```

Result: focused unit tests 23/23, architecture tests 22/22, Detekt and diff-check all passed.
