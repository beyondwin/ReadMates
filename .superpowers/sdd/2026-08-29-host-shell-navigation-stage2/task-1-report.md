# Stage 2 Task 1 Report — canonical host destination ownership

## Status and scope

- BASE verified clean at `57bca8ca14e98a98d2edb14e34827c8712f6c8b7`.
- Task brief SHA-256: `27a93ccfa42a162197b329b4ffcc1e29331798804fd54e02044190f9ca8e2a82`.
- ADR impact: `update` — implements only the route-ownership portion of Proposed ADR-0048. No new ADR; ADR-0048 remains Proposed.
- Evidence is local repository evidence. No route element, shell visual, server, legacy redirect, deployment, or production state changed.
- Commands used Corepack `0.35.0` with repository-pinned pnpm `11.13.1`. The available Node runtime was `v26.7.0`, outside the repository's declared `24.x` engine, so runtime-parity remains unmeasured.

## TDD RED → GREEN

RED was established before production changes:

```text
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/host-route-destination-inventory.test.ts src/app/workspace-route-model.test.ts
```

Result: `2` files ran, `14` tests failed and `65` passed. The failures were the intended missing contracts: four canonical areas, five utility/action destinations, new canonical paths/hrefs, detail return ownership, and canonical safe fallbacks.

After minimal production changes, the same focused command passed: `2` files and `78` tests, `0` failures.

## Source hash → command → result → closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `83d09891608e98b956ff7f864fcb803c576e67d2a6167f861bcc2cbbe7bba924` (`front/shared/routing/host-route-destinations.ts`) | focused Vitest above | GREEN, `78/78` | Canonical `operatingRoom`, `meetings`, `people`, `records`, `settings`, `notifications`, session actions/details, and `personDetail` have unscoped hrefs; `today`, `members`, `invitations`, and `operations` remain exported compatibility aliases. |
| `71d074419f9dac8a0cbeda09fbd087cd90abb1bb1ef3578c40fab65c026e39b9` (`front/src/app/route-continuity.ts`) | focused Vitest above | GREEN, `78/78` | Inventory owns exactly four primary and five utility/action entries, plus scoped counterparts. Session/person/record details point back to meetings/people/records respectively. |
| `6841ccc76c905002cf30c72bcccd41561a4fd8990eef5752945c060f0eb86e84` (`front/src/app/workspace-route-model.ts`) | focused Vitest above | GREEN, `78/78` | Same-club unavailable details and cross-club changes discard entity identifiers and fall back to canonical `sessions`, `people`, or `records`; legacy members/invitations map safely to people/settings. |
| `8277102f9ae7c1b59118ccf272b9416b75f727c64fc8ea15b17988ba54e931a3`, `b0ed3b1b2ab35df9856b9df71822365f9a4ff3e5a4969269a7f78b0d8c441206` (focused tests) | focused ESLint over the five changed TypeScript files | exit `0`, no findings | Focused test and implementation sources satisfy the repository lint rules. |

## Compatibility and ownership closure

- Primary: operating room → `/app/host`; meetings → `/app/host/sessions`; people → `/app/host/people`; records → `/app/host/records`.
- Utility/action: settings, same-club member view, notifications, account, and new meeting are inventoried separately from primary navigation.
- Compatibility: `/app/host`, `/members`, `/invitations`, and `/operations` aliases remain available; this task does not register, remove, or redirect routes.
- Return ownership: session detail → sessions; person detail → people; closed record ownership → records.
- Cross-club continuity never carries `sessionId` or `membershipId` into the target club.

## Verification notes and residual risk

- Focused ESLint: passed for all five changed TypeScript files.
- `git diff --check`: exit `0`, no output.
- Targeted private-path, secret-prefix, and private-key pattern scan over all changed source/test/report files: exit `0`, no findings.
- A baseline invocation used `pnpm --dir front test -- ...`; the package script treated the separator as a full Vitest run, so it ran `402` files and `3,600` tests, all passing. All RED/GREEN verification after that used `pnpm exec vitest` and stayed focused.
- Full lint, test, build, CT, and E2E gates were intentionally not run for Task 1. New canonical route elements and legacy redirect closure remain Tasks 4 and 5.
