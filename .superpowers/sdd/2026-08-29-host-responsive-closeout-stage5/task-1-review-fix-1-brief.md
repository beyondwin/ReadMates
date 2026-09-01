# Stage 5 Task 1 review fix 1 brief

Fix only the single IMPORTANT finding from the fresh Task 1 review, from base `7ae84d5fec9542f9ea4360c3a2ce352118dc3dfa`.

## Finding

`front/features/host/ui/meeting-workspace/host-lifecycle-responsive.ct.tsx` injects a synthetic `--m-nav-h: 56px` at every width. Runtime uses a 64px mobile navigation height and hides mobile chrome at 768px, while the diary sticky CTA remains active through 899px. The current 768px assertion therefore approves clearance above a nonexistent bottom nav and does not exercise a nonzero safe-area inset.

## Required closure

1. RED first at the real 767/768 boundary with a nonzero test safe-bottom value.
2. At 767px, prove the sticky CTA clears the real mobile tab bar plus safe-bottom inset.
3. At 768–899px, prove the sticky CTA no longer retains bottom-nav clearance while remaining usable and unclipped.
4. Use runtime CSS variables/contract instead of a per-fixture invented nav height. If production CSS is wrong, make the smallest correction in the owning stylesheet; otherwise correct only the CT fixture/assertions.
5. Do not change other breakpoints, workbox behavior, lifecycle semantics, screenshots/baselines, routes, server or docs.
6. Run the exact focused lifecycle CT on host and canonical Docker where feasible, exact changed-file lint, `git diff --check`, targeted safety, and a delta SHA-256 manifest/report. Do not rerun Task 1's other 16 unchanged CT cases.
7. Force-add the ignored brief/report/manifest and commit exactly `fix(host): align lifecycle sticky safe area`.

Return RED/GREEN, runtime-vs-fixture conclusion, exact Docker evidence or honest environment limit, manifest, commit SHA and skipped checks.
