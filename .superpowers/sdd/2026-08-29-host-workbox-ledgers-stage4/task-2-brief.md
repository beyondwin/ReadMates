# Stage 4 Task 2 brief — editable snapshot-bound manual notification

## Scope

Implement only Stage 4 plan Task 2 from base `e22a4369fa653d5c7df100473b3206d9ab3e3eca`.

- Recheck migration tail once and create `V63__manual_notification_custom_copy_snapshot.sql` when V63 is still free.
- Extend the existing manual notification selection/preview/confirm vertical slice additively across server persistence/service/web DTOs and the existing host frontend API/controller/composer/workbench.
- Update strict frontend Zod fixtures/export and both server fixture/Zod contract tests.
- Update only the focused server/frontend/E2E tests named by the Stage 4 plan.

## Required contract

- The operator may edit subject and body before preview. Validation is server authoritative and mirrored by the UI; blank/oversized/invalid copy is rejected without persistence or dispatch.
- A canonical content hash is computed from the exact normalized subject/body. Preview persists and returns the exact copy and hash; confirm must bind to that preview, not recompute from a mutable template.
- The preview binds the exact session `scheduleRevision`, selected target membership snapshot revision/hash, target IDs and eligibility fingerprint. Persistence must not store email, raw provider content, token, or unrelated identity/history data.
- Preview is read-only: opening, selecting, editing and `POST .../preview` never creates an outbox event, delivery or dispatch.
- Confirm locks the preview and re-reads the current session schedule revision plus ACTIVE/eligible target membership facts. Any schedule, target-set or eligibility drift returns controlled `409 MANUAL_NOTIFICATION_PREVIEW_STALE` before outbox/dispatch mutation and requires a new preview.
- Exact copy echoed in preview and exact copy used for confirmed dispatch must remain byte/contract consistent.
- Preserve existing duplicate/resend confirmation, idempotency, unknown-outcome and reconciliation behavior. A stale/invalid preview must not consume a successful idempotency result.
- Existing endpoint/security topology remains; do not add a new send-on-open endpoint or weaken trusted-BFF/CSRF/origin policy.
- UI copy remains editable and explicit-confirm. Changing copy/selection/session/template after preview invalidates the old preview and removes its confirm affordance.
- No real email/provider action is executed. E2E must be local-safe/intercepted and prove preview-before-confirm.

## TDD and focused evidence

1. RED server contract/service/persistence/controller tests for copy validation/hash/echo, schedule revision, target snapshot fingerprint/expiry, preview no-send, stale schedule, stale membership/eligibility, and zero dispatch/outbox on every rejected confirm.
2. RED frontend API/controller/UI tests for editable copy, preview request/echo, preview invalidation after edits, explicit confirm, stale 409 recovery and no automatic send.
3. Implement the smallest V63/model/port/service/store/web/frontend changes. Do not broaden into Stage 4 workbox source aggregation or schedule-review route composition.
4. Run focused `HostManualNotificationServiceTest`, `JdbcManualNotificationDispatchAdapterTest`, `HostNotificationControllerTest`, contract tests, named frontend API/controller/composer/preview/workbench tests, exact lint, local-safe manual-notification E2E, `git diff --check`, and targeted public-safety scan.
5. Run fixture export, stage only intended JSON, rerun export, and require fixture diff stability. Do not run full frontend/server/CT/E2E lanes at this task boundary.
6. Commit Task 2 files plus this brief and a `task-2-report.md`; report RED/GREEN commands and per-file SHA-256. Preserve external untracked design/mockups.

## Exclusions

- No external email/provider delivery.
- No Stage 4 workbox five-source projection, cursor, API or deferral route.
- No named invitation links, club settings or person detail.
- No unrelated architecture baseline, visual snapshot or public docs change.
