# Stage 1 Task 5 — schedule-seen BFF contract

Status: complete in the isolated `codex/host-lifecycle-operating-room` worktree.

## Scope and source

- BASE: `919c7ddd0d7b120014a669cf4c885dc1313e3018` (verified at task start).
- ADR impact: `none` — this is characterization coverage for the existing generic BFF contract; ADR-0049 remains Proposed.
- Changed surface: `front/tests/unit/cloudflare-bff.test.ts` and this report only.
- Source SHA-256 at verification: `88cca22f82b5eeb5e4ecd8d4212f1ce8a641247bc67ce678ab517ace0d0b95bf`.
- Path clarification: browser `PUT /api/bff/api/sessions/current/schedule-seen` is forwarded by the catch-all to upstream `PUT /api/sessions/current/schedule-seen`.
- Plan SHA-256 correction: old `5bcd10023d831664eba2fb76dae3b6014ea7825c8f4b1a1e53c0e86163ba39bb` → new `0da45b5726c5e2ec68623136ee8ad78eab5b662c321ef721b286fd38497a544f`; the old value contained the missing catch-all `api` segment in the Task 5 literal. This is a typo correction only and does not reopen any other authority finding or change the approved generic-proxy decision.

## Characterization and GREEN evidence

- Added one focused test for `PUT /api/bff/api/sessions/current/schedule-seen`.
- The test proves the exact upstream URL, PUT method, JSON request-body preservation, same-origin mutation headers, normalized `clubSlug` and request-host club context forwarding, and byte-for-byte/status/content-type preservation of an upstream 409 problem response.
- Browser-forged `X-Readmates-Club-Slug` is present in the input and is not trusted; the query-selected normalized slug is forwarded instead.
- Characterization result: existing generic proxy behavior passed without production changes.
- GREEN command (Node 24 and pinned launcher):
  - `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts`
  - `1` test file passed; `77` tests passed; `0` failed.
- `git diff --check` passed.

## Closure

- No parallel endpoint-specific Function or production BFF correction was needed.
- Stage-wide gates and `progress.md` were intentionally not touched or run per the task brief.
