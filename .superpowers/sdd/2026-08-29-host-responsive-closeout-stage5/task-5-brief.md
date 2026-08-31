# Stage 5 Task 5 brief — synchronize active lifecycle documentation

Implement only Stage 5 plan Task 5 from base `0d74311462cce30994da6e49bbe4f6526a2de5d3`.

- Authority: Stage 5 plan SHA-256 `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- ADR impact: `update`; update the content of ADR-0048/0049 but keep both `Proposed`. Task 6 alone decides acceptance after full gates.
- Read the current root/docs/execution guide and only the target sections needed. Do not reopen the authority design, historical ADR-0046 or approved PNGs; cite current code/tests/reports by path/hash instead.
- Preserve external mockups and public-repo safety. Never persist local absolute paths, secrets, real member data, private domains, deployment state or token-shaped examples.

## Exact active-doc scope

1. `CHANGELOG.md` `Unreleased`: replace the superseded 3-tab host IA claim with the actual four canonical areas and compatibility redirects; summarize schedule-seen, operating-room phases, immutable workbox, manual notification recovery, people/settings/named-link behavior and additive V61–V65 migration/operator implications. Do not claim production rollout/deploy.
2. `front/DESIGN.md`: document 390/768–1199/1200+ responsive order/composition, single accessible primary CTA, 44px/mobile-safe-area, keyboard/focus/reduced-motion and bounded custom DOM/ARIA evidence.
3. `docs/development/architecture.md`: document canonical routes, exact schedule-seen write timing/privacy/access independence, hostworkspace one-way dependency, immutable workbox snapshot/source-derived completion, notification idempotency/reconciliation and V61–V65 ownership/deployment order.
4. ADR-0048 and ADR-0049: make their verification/evidence sections match implemented code/tests and honest residuals. Keep `Status: Proposed`; do not rewrite durable decisions or historical ADR-0046.
5. ADR index and `docs/development/technical-decisions.md`: synchronize current Proposed status and concise decision/evidence links, with no duplicate authority.
6. `docs/development/host-redesign-mockups/README.md`: add only current code-native CT/E2E evidence links/provenance; retain 07–17 as design references and do not treat them as runtime proof.

## Evidence and exit

1. Verify every behavior statement against current source/test/report paths; use exact hashes from the Stage 5 ledger where available. Do not rerun code/browser gates.
2. Run `git diff --check -- <changed docs>`, targeted relative-link checks, stale-language scan for old 3-tab/today/members/invitations mappings, generic local-path/token/private-data scan and a SHA-256 manifest.
3. Record exact `source hash → literal command → result → finding closure` in `task-5-report.md`. Use `<node24-bin>` only if a Node command is actually needed.
4. Force-add ignored brief/report/manifest plus intended active docs and commit exactly `docs(host): synchronize lifecycle operating room truth`.

## Exclusions

- No code/tests/baselines, no Task 4 full matrix, no ADR status acceptance, no whole-branch review.
- No production/deploy/tag/PR/push/provider/OAuth/email/real club-end action.

Return changed docs, corrected stale claims, exact docs checks, final ADR statuses, manifest and commit SHA.
