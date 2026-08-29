# Stage 1 schedule-seen browser evidence

## Scope and source seal

- BASE: `485973013086e01cefc6b7f90bcd7c65282d1801`.
- ADR impact: `none` — this test adds browser evidence for Proposed ADR-0049 without changing the product contract.
- Pre-edit search over `front/tests/e2e` found no scenario covering the complete DRAFT → UNSEEN → CURRENT → STALE → CURRENT lifecycle. This test-only task therefore records the missing scenario directly; it does not manufacture an implementation RED.
- Source SHA-256:
  - `front/tests/e2e/schedule-seen-lifecycle.spec.ts`: `442589c84a0b7c5b608a15f35f07e712a8cd2637dab811ea995d662dbb6de9ac`

Commands ran with Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`. Machine-specific launcher paths are intentionally omitted.

## Browser path and finding closure

The single Chromium scenario uses synthetic rows and the existing E2E MySQL/login helpers. It creates one lifecycle session in `sample-book-club` and one unchanged control session in `reading-sai`, then closes every created row in `afterEach`.

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `442589c84a0b7c5b608a15f35f07e712a8cd2637dab811ea995d662dbb6de9ac` | `corepack pnpm --dir front exec playwright test tests/e2e/schedule-seen-lifecycle.spec.ts --project=chromium --workers=1` | `1 passed` in `8.1s`; scenario body `2.6s`. | DRAFT host detail reports schedule-seen unavailable and an exact member write returns `409 CONFLICT`; opening reports the member `UNSEEN`; the first rendered current-session view writes the exact revision and reports `CURRENT`; a host date edit increments only the schedule revision and reports `STALE`; the second rendered view writes the new exact revision and reports `CURRENT`. |
| `442589c84a0b7c5b608a15f35f07e712a8cd2637dab811ea995d662dbb6de9ac` | Same focused Playwright command, first diagnostic run | Timed out while waiting for a new-meeting-only confirmation label. The browser snapshot showed the existing workspace dialog is named `멤버에게 열기`. | The spec now selects the actual existing-workspace dialog and button. No production defect or production-code change was required. |
| `442589c84a0b7c5b608a15f35f07e712a8cd2637dab811ea995d662dbb6de9ac` | `corepack pnpm --dir front exec eslint tests/e2e/schedule-seen-lifecycle.spec.ts` | Exit `0`. | Focused lint is closed. |
| `442589c84a0b7c5b608a15f35f07e712a8cd2637dab811ea995d662dbb6de9ac` | `corepack pnpm --dir front exec tsc --ignoreConfig --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable --types node tests/e2e/schedule-seen-lifecycle.spec.ts` | Exit `0`. | The new spec and its relative helper dependency graph type-check. |
| `442589c84a0b7c5b608a15f35f07e712a8cd2637dab811ea995d662dbb6de9ac` | `git diff --check -- front/tests/e2e/schedule-seen-lifecycle.spec.ts` | Exit `0`. | Whitespace validation is closed. |

## Independence and isolation evidence

- The lifecycle participant starts with synthetic `MAYBE` RSVP and `ABSENT` actual attendance. Both remain byte-for-byte unchanged after the rejected DRAFT write, first schedule-seen write, host schedule edit, and second schedule-seen write.
- A deliberately old `membership_club_access.last_access_at` advances through the authenticated member shell before any schedule-seen fact exists. The same assertion proves the access write does not infer schedule acknowledgement.
- The `reading-sai` control participant retains its RSVP, attendance, seen revision, and seen timestamp across both `sample-book-club` writes. Every BFF request also carries the URL-authoritative lifecycle club slug.
- The two member renders assert the visible current-session heading before accepting the corresponding schedule-seen response, preserving the post-render acknowledgement boundary.

## Validation boundary

- Evidence is repository-local browser/BFF/API/MySQL evidence, not production evidence.
- Only the new Chromium spec and focused lint/type/whitespace checks ran here. Full E2E and stage-wide gates remain controller-owned and were intentionally not repeated.
