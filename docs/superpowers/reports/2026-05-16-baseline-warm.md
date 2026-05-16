# baseline (warm) — branch `main` @ 55407e6

Generated: 2026-05-16
Host: Darwin (Apple Silicon)
Java: 21 (toolchain)
Gradle: 9.x
Mode: warm (`--rerun-tasks` between runs, caches kept hot)

> **Note:** Measurement here uses `--rerun-tasks` (force test re-execution,
> compile cache preserved) rather than `prep_warm` from the harness. This
> isolates the test-runtime delta from compile-time noise, which is the
> direction spec §3.3 wants for warm measurement of L1/L2.

## L1 — `./gradlew check`

```
run 1: 71.27 sec
run 2: 69.47 sec
run 3: 65.28 sec
median: 69.47 sec  min: 65.28  max: 71.27
```

## L2 — `./gradlew unitTest`

```
run 1: 28.53 sec   (cache-populating run)
run 2: 14.26 sec
run 3: 12.92 sec
median: 14.26 sec  min: 12.92  max: 28.53
```

Note: run 1 captured the JIT/daemon warmup penalty (28s vs ~13s).
Effective steady-state is ~13–14s.

## Not measured in this pass

- L3 (`architectureTest`), L4 (`integrationTest`), L5–L7 (frontend, coverage):
  deferred. Low signal vs effort for this autonomous pass.
- Cold mode: deferred (3–5× slower per run; budget exhausted).
- CI baseline (C1/C2/C3): requires push permission + 3× workflow run;
  performed via PR push as part of the After measurement instead.
