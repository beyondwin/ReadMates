# Stage 4 Task 4 report — named invitation links and host club settings

## Authority and scope

- Base: `2a6b90834b6cf57f59d58924ccb5781e62a2a62a`.
- Plan SHA-256: `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`.
- ADR-0048 SHA-256: `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- Task brief SHA-256: `337a1bfad712391d6a85831d9079d52d09b0b8fad8e947d5cbf67f44559c17dd`.
- ADR impact: `none`.
- Migration tail was V63 before implementation. Task 4 owns exactly V64 and V65.
- The external `design/mockups/2026-08-30-admin-operations-redesign/` tree remained untouched and unstaged.

## Delivered contract

- V64 stores only the unique SHA-256 token hash for named links. Raw `lnk_` tokens and share paths are never stored; creation discloses a relative same-origin path once, while replay/list/history omit it.
- Management is the exact `/api/host/invitation-links` GET/POST/PUT/history family, club-scoped to an ACTIVE HOST with optimistic revisions, idempotent receipts, append-only allowlisted events and cursor pages.
- Public preview strictly discriminates `EMAIL` and `NAMED_LINK` tokens into one redacted response. Named-link OAuth accepts only as MEMBER, reuses an already-active membership without consumption, and serializes final-use consumption under a row lock.
- V65 owns `host_settings_revision`, allowlisted history, command receipts and bound close previews. Settings use the exact `/api/host/club-settings...` family, including co-host promotion/demotion and dedicated `/end/preview` plus `/end/confirm`; no generic delete endpoint was introduced.
- The settings route now contains named links with one-time copy, editable settings with visible revision/stale recovery, guarded close preview/confirm and a visibly separate link to the existing email invitation feature.
- Frontend responses are feature-owned strict Zod contracts. Query keys contain explicit club and paging identity, and mutations invalidate only the named-link or club-settings scope.
- The local E2E helper gained a named-link-only fixture branch. It never calls Google, email or any external provider and operates only against the isolated Playwright database.

## Sealed evidence

| Source hash / surface | Command | Result | Finding closure |
|---|---|---|---|
| Plan and ADR hashes above | `shasum -a 256 <plan> <adr> <task-brief>` | exact authority hashes | authority and ADR scope closed |
| V63 migration tail | `find server/src/main/resources/db/mysql/migration -name 'V*.sql' -print \| sort -V \| tail -5` | V61, V62, V63, V64, V65 | exact migration numbering closed |
| Task 4 Kotlin sources | Task-4-filtered `./server/gradlew --no-configuration-cache -p server ktlintFormat` | success after auto-format and explicit wildcard/line fixes | Task 4 Kotlin format closed; accidental unchanged-file formatting was exactly reversed |
| Task 4 frontend sources | Node 24 `npx --yes corepack@0.35.0 pnpm --dir front exec eslint <Task-4 files>` | 0 errors | focused frontend static check closed |
| Named links/settings services | `./server/gradlew -p server unitTest --tests <four Task-4 classes>` | 14/14: link 5, token 1, settings 6, legacy accept 2 | idempotency, revision, role, close binding and validation closed |
| Public preview security | `./server/gradlew -p server unitTest --tests RateLimitFilterTest` | 13/13 | preview rate limit and token-safe keying closed |
| OAuth/concurrency/contracts | `./server/gradlew -p server integrationTest --tests NamedInvitationLinkOAuthDbTest --tests <two focused contract methods>` | 5/5: OAuth/race 3, fixture 1, Zod 1 | redaction, paused/cross-club denial, final-use serialization, fixture contracts closed |
| Legacy accept and BFF secret | `./server/gradlew -p server integrationTest --tests InvitationControllerDbTest --tests BffSecretFilterTest` | 15/15: legacy controller 11, BFF secret 4 | password POST remains 410 and protected host API trust boundary closed |
| Frontend API/query/UI/public/BFF/router | Node 24 `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run <eight focused files>` | 8 files, 152/152 | strict parsing, club/paging keys, one-time copy, stale/unknown states, redaction, generic BFF preservation closed |
| Isolated browser fixture | `PLAYWRIGHT_PORT=3314 READMATES_API_BASE_URL=http://127.0.0.1:18114 PLAYWRIGHT_WORKERS=1 ... playwright test ... --grep 'named link stays redacted'` | Chromium 1/1 | settings UI through redacted named preview and fixture Google membership closed |
| Deterministic Zod fixtures | run `zod:export-fixtures`, hash seven Task-4 fixtures, repeat and `diff -u` | identical second export | deterministic fixtures closed |
| Patch hygiene | `git diff --check` | clean | whitespace closed |
| Public/token safety | targeted scan for private paths, private keys, provider keys and long `lnk_` literals across intended files | no secret/token/private-path finding; one `BEGIN PRIVATE KEY` occurrence is an existing negative assertion in the contract test | public repository safety closed |

## Fixture SHA-256 seals

- `host-invitation-links.json`: `458ff8cca9ebe47caa207dd92757ad604f740357269324f8f3e80c9190e61471`
- `host-club-settings.json`: `6c5d7fb30358ec609de3a81d1da651daa318e18fa859edfc59f1ffdfab2d3fde`

## Review round 1 closure (2026-08-30)

| Finding | RED | GREEN / closure |
|---|---|---|
| Same-key concurrency | `NamedInvitationLinkOAuthDbTest`: concurrent create failed to converge | club-row `FOR UPDATE` serialization; identical create/update converge to one receipt/event, conflicting canonical replay remains `INVITATION_LINK_IDEMPOTENCY_CONFLICT`; 5/5 DB tests |
| OAuth-derived event digests | persisted ACCEPTED hashes matched subject/email-derived digests | random operation digest plus link/revision-scoped request digest; persistence assertion proves neither hash is the prior OAuth/email derivative |
| V65 constraints | cross-club consumed receipt was admitted by the prior single-column FK | action allowlist contract and `(id, club_id)` parent unique/FK; migration contract 2/2 rejects invalid action and cross-club receipt |
| TZDB timezone | `+09:00` was accepted | membership in `ZoneId.getAvailableZoneIds()` required; unit tests 11/11 across link/settings services |
| Zod token families | common nullable object and `{6,}` named token admitted mixed/short shapes | strict discriminated EMAIL/NAMED_LINK union, exact redaction and `lnk_` + 43; contract tests 10/10, invite/BFF regression 47/47, fixture export hashes identical across two runs |
| Recoverable UI commands | focused component RED: 4/6 recovery/edit cases failed | create/update/close unknown state preserves the original idempotency key, stale/unknown actions refetch, preview errors retry, edit exposes name/maxUses/expiresAt; component suite 6/6 |

Focused verification: named OAuth/concurrency DB 5/5; V65 migration 2/2; frontend contracts/UI 14/14; invite/BFF 47/47; isolated named-link Chromium E2E 1/1. Exact changed-file ESLint and `git diff --check` passed. Repository-wide `tsc --noEmit` and `ktlintCheck` remain skipped as gates: both report pre-existing failures outside Task 4 (archive/current-session type debt; notification ktlint debt), with no changed Task 4 file named by the Kotlin report. No real OAuth/email/provider call or non-fixture club close was performed. The changed-source delta is sealed in `task-4-review-1-manifest.sha256`.

## Review round 2 closure (2026-08-30)

The remaining V65 receipt-action finding was isolated to `host_club_command_receipts.action`. RED proved an otherwise valid receipt with `UNSAFE_ACTION` was accepted (migration contract 3 tests, 1 failure). V65 now constrains receipts to exactly `SETTINGS_UPDATED`, `CO_HOST_PROMOTED`, `CO_HOST_DEMOTED`, and `CLUB_ENDED`; the exact migration contract is GREEN 3/3 and preserves the history allowlist plus cross-club consumed-receipt rejection. `git diff --check` passed for the two-file surface. The review-2 delta is sealed in `task-4-review-2-manifest.sha256`; all other closed findings and evidence were reused unchanged.
- `zod-schemas/host-invitation-link-list.json`: `6532e5efe0e4ba2c0d16386d06b0ab4a1e15ad6f4a184b4c87afe5239edfb161`
- `zod-schemas/host-invitation-link-history.json`: `69d39ae1524956e683d5c86ce0f10065a845cdfb011877ef837b74258584c681`
- `zod-schemas/host-club-settings.json`: `6c5d7fb30358ec609de3a81d1da651daa318e18fa859edfc59f1ffdfab2d3fde`
- `zod-schemas/host-club-close-preview.json`: `39a984ca5c04a9c541d1af52b4c9f4fe7aae4908844d576dc49edac793567448`
- `zod-schemas/host-club-close-result.json`: `35dfebbe5f3a4b61fce5ee5e58d87988b5289ad47a21aad5c87a89a5328ee8cb`

The per-file implementation manifest is sealed in `task-4-manifest.sha256`; it intentionally excludes itself and this report to avoid recursive hashes.

## Explicitly skipped

- Full frontend lint/test/build, full server CI/integration suite, full Playwright suite, CT/screenshots, Stage 4 gates and public-release gates were not run; those belong to Stage closeout or Tasks 8/9.
- The unchanged Task 2 whole-server ktlint residual was not modified or re-proved. Only Task 4 paths were formatted and checked.
- No live OAuth/provider/email action, real club termination, push, PR, tag or deployment was performed.
