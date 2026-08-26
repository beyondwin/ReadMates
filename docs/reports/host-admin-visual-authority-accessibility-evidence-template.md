# Host/admin visual authority accessibility evidence

This tracked file records measured vs not-measured evidence for the host Focus Deck and admin Editorial Operations Ledger. Do not enter operator names, account or member data, machine identifiers, local paths, private URLs, timestamps, spoken transcripts, screenshots, recordings, or free-form notes here.

## Manual screen readers

| Case | Status |
| --- | --- |
| VoiceOver with Safari | `not measured` |
| NVDA with Chrome | `not measured` |

Until a human performs those cases, they remain `not measured` and must not be reported as passed.

## Automated checks run in this docs task

| Command | Result |
| --- | --- |
| `git diff --check -- front/DESIGN.md docs/development/architecture.md docs/development/adr/0044-host-focus-deck-primary-action-composition.md docs/development/adr/0045-host-admin-focus-deck-editorial-ledger-composition.md docs/development/adr/README.md docs/development/technical-decisions.md CHANGELOG.md docs/reports/host-admin-visual-authority-accessibility-evidence-template.md` | empty output, exit 0 |
| `./scripts/build-public-release-candidate.sh` | candidate built at `.tmp/public-release-candidate`, exit 0 |
| `./scripts/public-release-check.sh .tmp/public-release-candidate` | `Public-release check passed.` / gitleaks `no leaks found`, exit 0 |

This task did not re-run frontend lint, unit, CT, e2e, or browser gates.

## Automated accessibility helpers on this branch (prior tasks, not re-run here)

Repository evidence from earlier commits on `codex/readmates-host-admin-visual-authority`. Commands used Corepack fallback `npx --yes corepack@0.35.0 pnpm --dir front ...` because `corepack` was not on PATH.

| Command | Output recorded then | What it covers |
| --- | --- | --- |
| `npx --yes corepack@0.35.0 pnpm --dir front test:ct` | 75 passed | Focus Deck and editorial-ledger CT, including 44px targets, visible focus, reduced motion, no horizontal overflow, no nested live regions |
| `npx --yes corepack@0.35.0 pnpm --dir front test:e2e:visual-authority-browsers` | 21 passed | Chromium + Firefox + mobile WebKit smoke for host Focus Deck and admin Today/Clubs/Service/Review |
| `npx --yes corepack@0.35.0 pnpm --dir front test:e2e` host-session-record-revisions (protected set after `480b7aa5`) | 20 passed including 9 revision cases | Focus Deck `region "지금 할 일"`; Folio complementary count 0 |

Tracked screenshot ownership is in `front/DESIGN.md`. 1024px is in the viewport contract and browser smoke; it has no tracked PNG.

## Not claimed

- VoiceOver/Safari landmark order, focus restoration, or live-region announcement
- NVDA/Chrome equivalent
- Production or live-operator screen-reader sessions
- Server API, schema, or auth contract change
