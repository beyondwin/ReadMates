# Build & Test Speed Measurement Harness

Wallclock harness backing the work tracked in
[`docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md`](../../docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md).

## Quick start

```bash
# Baseline (run once before applying optimization changes)
scripts/bench/measure-local.sh baseline cold
scripts/bench/measure-local.sh baseline warm

# After each task is applied
scripts/bench/measure-local.sh after-task1 cold
scripts/bench/measure-local.sh after-task1 warm
```

Outputs land at `docs/superpowers/reports/2026-05-16-<label>-<mode>.md` with
3-run wallclock + median for each measurement ID (L1..L7).

## Measurement IDs

| ID  | Command                                  | Notes                          |
|-----|------------------------------------------|--------------------------------|
| L1  | `./gradlew check`                        | Server full verification        |
| L2  | `./gradlew unitTest`                     | Unit tests only                 |
| L3  | `./gradlew architectureTest`             | ArchUnit boundary tests         |
| L5  | `pnpm --dir front test`                  | Front-end Vitest                |
| L6  | `pnpm --dir front build`                 | Front-end production build      |
| L7  | `pnpm --dir front test:coverage`         | Front-end coverage              |

`L4` (`integrationTest`) is not in the default sweep because it requires a
running Docker daemon. Run manually when needed.

## Modes

- **cold** — Drops `~/.gradle/caches/build-cache-*`, `server/.gradle`,
  `server/build` between runs. Closer to a fresh CI runner.
- **warm** — Runs the command once and discards, then records the next run.
  Tests the steady-state developer experience with caches hot.

## CI baseline (optional, manual)

CI measurements are not driven by this script. To capture them:

```bash
# Push 3 measurement-only commits to a work branch (e.g., bench/baseline)
gh run list --workflow=ci.yml --branch=<branch> --limit 3 \
  --json databaseId,conclusion,createdAt
gh run view <run-id> --json jobs \
  --jq '.jobs[] | {name, conclusion, startedAt, completedAt}'
```

Record `backend`, `frontend`, `e2e (1/3)` durations in the matching
`docs/superpowers/reports/2026-05-16-*-ci.md` file.

## Sweep helper

`scripts/bench/sweep-forks.sh` (added in Task 3) walks
`maxParallelForks=1..4` via the `-PmaxForks=` project property and records
the median wallclock for `unitTest` at each setting.
