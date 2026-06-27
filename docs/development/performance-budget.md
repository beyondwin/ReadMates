# Frontend Performance Budget

ReadMates tracks production-build asset size as local release-readiness evidence. The budget is a frontend build-quality gate; it is not a production smoke replacement.

## Commands

Run the production build and budget report:

```bash
npx --yes pnpm@10.33.0 --dir front build
npx --yes pnpm@10.33.0 --dir front build:budget
```

Run the combined alias:

```bash
npx --yes pnpm@10.33.0 --dir front performance:budget
```

Run Lighthouse against production build output through Vite preview:

```bash
npx --yes pnpm@10.33.0 --dir front lighthouse:preview -- --group public --limit 2
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

## Budget Meaning

Hard-gated JavaScript buckets fail the command when a chunk exceeds its limit. The first implementation gates split vendor chunks, host route chunks, app entry, and ordinary route chunks according to the source-controlled budget config.

Global CSS is measured but not hard-failed in this iteration. A future CSS boundary design should decide whether to split page-level styles before turning CSS size into a hard gate.

## Release Evidence Boundary

Passing local performance budget evidence means production build assets stayed within the repo-defined size budget. It does not prove production OAuth, VM health, provider-console state, release tag workflows, OCI compose promotion, or post-deploy smoke.
