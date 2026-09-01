# Stage 5 Task 2 review fix 1 brief

Fix only the two IMPORTANT findings from the fresh Task 2 review, from base `d35b423c8a705bbfe8e1699871456fe56e1a7a06`.

## Finding 1 — complete unknown reconciliation in the browser

The abort-after-commit case currently proves unknown receipt, DB dispatch/outbox `1|1`, a ledger link and no immediate resend, but never follows the link to reconcile the exact committed dispatch.

Required closure:

1. Extend only the existing unknown-outcome scenario in `front/tests/e2e/host-workbox-stage4.spec.ts` and its local-safe fixture if necessary.
2. After response loss, open the rendered notification-ledger link and prove the exact session/manual dispatch committed result is visible and attributable to the original operation.
3. Prove the confirm request count remains unchanged throughout navigation/reconciliation, so no second delivery occurs.
4. Use existing notification ledger production behavior. Change production code only if a focused RED demonstrates that the current link/ledger cannot reconcile the receipt.
5. Run only this exact browser case, not the other Task 2 or Stage 4 E2E cases.

## Finding 2 — exact evidence ledger

Update `task-2-report.md` so every evidence row names the exact source/manifest SHA-256, the literal reproducible shell command, the exact result/count and the finding closure. Replace phrases such as `Same changed targets`, `Same final delta`, `Focused Vitest over...`, `Exact ten-file ESLint`, and `Isolated Chromium...`.

## Exit

- Run exact changed-file lint only if code/test changes require it, `git diff --check`, targeted public-safety and a delta SHA-256 manifest.
- Reuse unchanged Task 2 evidence by exact hash; do not rerun full Vitest, four-case E2E, redirects, full gates or unchanged lifecycle tests.
- Force-add ignored brief/report/manifest and commit exactly `test(host): close lifecycle recovery review findings`.
- Preserve the external mockup, user ports/containers, baselines and all provider/OAuth/email/real-club boundaries.

Return the focused RED/GREEN, exact confirm request counts before/after reconciliation, visible committed dispatch identity, report/manifest hashes, commit SHA and skipped checks.
