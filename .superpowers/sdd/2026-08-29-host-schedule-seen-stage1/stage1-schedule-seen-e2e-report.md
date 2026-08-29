# Stage 1 schedule-seen browser evidence

## Scope and source seal

- BASE: `485973013086e01cefc6b7f90bcd7c65282d1801`.
- Review round 1 BASE: `6f564b15fdfb5b90fd80201470b57e38bc510695`.
- ADR impact: `none` — this test adds browser evidence for Proposed ADR-0049 without changing the product contract.
- Pre-edit search over `front/tests/e2e` found no scenario covering the complete DRAFT → UNSEEN → CURRENT → STALE → CURRENT lifecycle. This test-only task therefore records the missing scenario directly; it does not manufacture an implementation RED.
- Source SHA-256:
  - `front/tests/e2e/schedule-seen-lifecycle.spec.ts`: `b9f2aca9921c5f1fc7da718d9418b4112880ae844fc4c2d4fc08a12d9a804e9f`
  - `front/tests/e2e/readmates-e2e-db.ts`: `35ccde636b234e63e628b16b8a7a2c3fc946d094559abd36b5a8fdd1838c4657`

Commands ran with Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`. Machine-specific launcher paths are intentionally omitted.

## Browser path and finding closure

The single Chromium scenario uses synthetic rows and the existing E2E MySQL/login helpers. It creates one lifecycle session in `sample-book-club` and one unchanged control session in `reading-sai`. The login helper returns the exact generated auth-session ID; the spec tracks only its two successful logins and deletes only those IDs in `afterEach`.

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `b9f2aca9921c5f1fc7da718d9418b4112880ae844fc4c2d4fc08a12d9a804e9f` + `35ccde636b234e63e628b16b8a7a2c3fc946d094559abd36b5a8fdd1838c4657` | `corepack pnpm --dir front exec playwright test tests/e2e/schedule-seen-lifecycle.spec.ts --project=chromium --workers=1` | `1 passed` in `9.3s`; scenario body `2.8s`. | DRAFT host detail reports schedule-seen unavailable and an exact member write returns `409 CONFLICT`; opening reports the member `UNSEEN`; the first rendered current-session view writes the exact revision and reports `CURRENT`; a host date edit increments only the schedule revision and reports `STALE`; the second rendered view writes the new exact revision and reports `CURRENT`. The afterEach assertion also reports all ten lifecycle/auth residue counts as zero. |
| `b9f2aca9921c5f1fc7da718d9418b4112880ae844fc4c2d4fc08a12d9a804e9f` + `35ccde636b234e63e628b16b8a7a2c3fc946d094559abd36b5a8fdd1838c4657` | `corepack pnpm --dir front exec eslint tests/e2e/schedule-seen-lifecycle.spec.ts tests/e2e/readmates-e2e-db.ts` | Exit `0`. | Focused lint is closed. |
| `b9f2aca9921c5f1fc7da718d9418b4112880ae844fc4c2d4fc08a12d9a804e9f` + `35ccde636b234e63e628b16b8a7a2c3fc946d094559abd36b5a8fdd1838c4657` | `corepack pnpm --dir front exec tsc --ignoreConfig --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable --types node tests/e2e/schedule-seen-lifecycle.spec.ts` | Exit `0`. | The new spec and its relative helper dependency graph type-check. |
| `b9f2aca9921c5f1fc7da718d9418b4112880ae844fc4c2d4fc08a12d9a804e9f` + `35ccde636b234e63e628b16b8a7a2c3fc946d094559abd36b5a8fdd1838c4657` | `git diff --check -- front/tests/e2e/schedule-seen-lifecycle.spec.ts front/tests/e2e/readmates-e2e-db.ts` | Exit `0`. | Whitespace validation is closed. |

## Independence and isolation evidence

- The lifecycle participant starts with synthetic `MAYBE` RSVP and `ABSENT` actual attendance. Both remain byte-for-byte unchanged after the rejected DRAFT write, first schedule-seen write, host schedule edit, and second schedule-seen write.
- A deliberately old `membership_club_access.last_access_at` advances through the authenticated member shell before any schedule-seen fact exists. The same assertion proves the access write does not infer schedule acknowledgement.
- The `reading-sai` control participant retains its RSVP, attendance, seen revision, and seen timestamp across both `sample-book-club` writes. Every BFF request also carries the URL-authoritative lifecycle club slug.
- The two member renders assert the visible current-session heading before accepting the corresponding schedule-seen response, preserving the post-render acknowledgement boundary.
- Cleanup deletes auth sessions only by the exact IDs returned by this test's two successful logins. It never deletes sessions by user or email. After cleanup, the focused test queries and asserts zero rows for both synthetic sessions, both participants, both synthetic memberships, their access facts, all three lifecycle/change audit surfaces, mutation receipts, mutation idempotency keys, and the exact tracked auth-session IDs.

## Validation boundary

- Evidence is repository-local browser/BFF/API/MySQL evidence, not production evidence.
- Only the new Chromium spec and focused lint/type/whitespace checks ran here. Full E2E and stage-wide gates remain controller-owned and were intentionally not repeated.
