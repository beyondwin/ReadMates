# Stage 5 Task 4 gate fix 1 brief — account trigger accessibility contract

Fix only the fresh full-Vitest failure found at gate source `2b6cc84e14236f43feec76618f5d6a55dc0317da`.

## Fresh failure

`PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front test` ran 431 files / 3891 tests: 430 files and 3890 tests passed; `front/tests/unit/spa-layout.test.tsx` failed at line 226 because it expected the two closed account triggers to expose two distinct `aria-controls` values, but the Task 7 approved accessibility fix now omits `aria-controls` while each controlled dialog is unmounted.

## Required closure

1. Reproduce the single focused test RED first.
2. Inspect the current account trigger/dialog lifecycle and Task 7 accessibility contract. Closed visible triggers must not reference nonexistent targets; when a dialog is opened, the active trigger must reference the mounted controlled element with a valid unique id and correct expanded state.
3. If production behavior already satisfies that contract, update only the stale test to prove closed and opened desktop/mobile semantics. If production is incomplete, make the smallest TDD fix in the owning account component.
4. Run the focused `spa-layout.test.tsx` plus the exact Task 7 account/a11y unit tests affected by the assertion; exact changed-file ESLint, `git diff --check`, targeted public-safety and delta SHA-256 manifest.
5. Do not run the full frontend suite, build, server, CT, E2E or public-release checks; the controller resumes the same stage gate after scoped review.
6. Record exact `source hash → literal command → result → finding closure` in `task-4-gate-fix-1-report.md`, using `<node24-bin>`.
7. Force-add ignored brief/report/manifest and commit exactly `test(host): align account trigger accessibility contract` if test-only; use `fix(host): align account trigger accessibility contract` only if production changes.

Preserve external mockups, baselines, user runtimes and all unrelated code.
