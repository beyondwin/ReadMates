# Frontend Performance Budget

ReadMates tracks production-build asset size as local release-readiness evidence. The budget is a frontend build-quality gate; it is not a production smoke replacement.

## Commands

Run the production build and budget report:

```bash
corepack pnpm --dir front build
corepack pnpm --dir front build:budget
```

Run the combined alias:

```bash
corepack pnpm --dir front performance:budget
```

Run the production-build host meeting workspace budget:

```bash
corepack pnpm --dir front test:host-workspace-performance
```

Run Lighthouse against production build output through Vite preview:

```bash
corepack pnpm --dir front lighthouse:preview -- --group public --limit 2
```

## Artifacts

Build budget output is written under:

```text
.tmp/performance/build-budget.json
.tmp/performance/build-budget.md
```

Preview Lighthouse output is written under:

```text
.tmp/performance/lighthouse-preview/<timestamp>/
```

These files are local evidence only and should not be committed.

The host meeting workspace harness writes one public-safe summary to
`front/output/performance/host-meeting-workspace-summary.json`. It performs exactly five cold Chromium runs with 500 synthetic members and records every raw value plus the median. The summary contains no member names, identifiers, URLs, traces, HAR files, or private fixtures.

## Host meeting workspace budgets

The production-build harness fails closed when a mark is missing, a value is non-finite, the run count is not five, or the synthetic member count is not 500. Every raw run must satisfy:

| Metric | Budget |
| --- | ---: |
| UTF-8 decoded meeting JSON | 500 KiB |
| Route data ready to first usable control | 1,000 ms |
| Search/filter input to first RAF after DOM commit | 100 ms |
| Authoritative single-row save accepted to affected row commit | 100 ms |
| Forced-GC heap increase when entering the ledger | 25 MiB |

The harness uses a fresh browser context, disabled cache, fixed network conditions, fixed 4x CPU throttling, and forced garbage collection for each run. These synthetic results are regression budgets, not production RUM or device-lab claims.

## Budget Meaning

Hard-gated JavaScript and CSS buckets fail the command when a chunk exceeds its limit. JavaScript budgets use raw bytes to keep parse and execution cost visible. Global CSS uses gzip transfer bytes because bundled font-face unicode ranges are repetitive on disk but compress substantially over the network.

The global CSS bundle is hard-gated at 50 kB gzip. Raw and gzip sizes remain visible together in the generated report, so both parse volume and transfer cost can be reviewed while the gate protects the user-facing download boundary.

Preview Lighthouse starts a local public-safe API mock upstream and points the Vite preview proxy at that mock through `READMATES_API_BASE_URL`. The smoke therefore does not require a running local Spring API for public routes, and expected preview shutdown is treated as cleanup instead of a command failure.

## Release Evidence Boundary

Passing local performance budget evidence means production build assets stayed within the repo-defined size budget and the preview diagnostic could render the selected routes without local backend proxy failures. It does not prove production OAuth, VM health, provider-console state, release tag workflows, OCI compose promotion, or post-deploy smoke.
