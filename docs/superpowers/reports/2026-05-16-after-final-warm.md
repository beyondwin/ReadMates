# after-final (warm) — branch `readmates-build-test-speed-20260516-123042` @ b20cd08

Generated: 2026-05-16
Host: Darwin (Apple Silicon)
Java: 21 (toolchain)
Gradle: 9.x
Mode: warm (`--rerun-tasks` between runs, caches kept hot)

## L1 — `./gradlew check`

```
run 1: 20.45 sec
run 2: 20.25 sec
run 3: 20.08 sec
median: 20.25 sec  min: 20.08  max: 20.45
```

## L2 — `./gradlew unitTest`

```
run 1: 19.14 sec   (cache-populating)
run 2: 14.05 sec
run 3: 12.55 sec
median: 14.05 sec  min: 12.55  max: 19.14
```

## Flaky verification — `./gradlew unitTest --rerun-tasks` × 3

| Run | Status   | Wallclock |
|-----|----------|-----------|
| 1   | SUCCESS  | 19.14 sec |
| 2   | SUCCESS  | 14.05 sec |
| 3   | SUCCESS  | 12.55 sec |

294 tests across 58 unit-tagged test classes, **0 failures, 0 errors**
across all 3 runs. JUnit5 class-level parallel + `maxParallelForks=2`
introduced no flakiness in this audit.

Spec §5 acceptance:

- **A1** (`:test` not running tests at `check`) — PASS via task graph and
  manual `./gradlew :test` (no JUnit XML output, only 4 compile-chain
  actionable tasks executed).
- **A2** (unit class count) — PASS. 58 unit-tagged test class XMLs
  produced, matches the audit-expected count.
- **A4** (`L1 warm ≥ 25% reduction`) — **PASS, -70.85%** (69.47s → 20.25s).
- **A5** (unit tests PASS + JaCoCo ≥ 0.23) — PASS, all 294 tests green.
- **A6** (integration/architecture PASS) — `:check` now depends on
  `:architectureTest`; ran inside the L1 measurements. Integration tests
  (Docker required) deferred to CI run.
- **A7** (E2E unchanged) — deferred to CI push.

A3 (CI backend ≥ 30%): deferred to CI push as part of PR.
A8 (spec §7 populated): see §7 update commit accompanying this report.
