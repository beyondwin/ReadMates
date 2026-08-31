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

## Range-review round 1 — record-owned deep-route continuity

- Review BASE: `e4b6dece3980c540f1b669b388fa931dc53665ea`.
- TDD RED used Node `v24.18.0` through the portable `<node24-bin>` launcher. The focused four-suite run failed only the eight newly asserted ownership contracts: record-list detail state (`1`), cross-club record-workflow fallback (`2`), and mobile title/back ownership (`5`); the other `169` tests passed.
- GREEN reused the same route and query owners. It passed `4` files and `177` tests. No CT or E2E was needed because the changed contract is fully exercised through the real data-router link transition plus route-model and shell component tests.

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `d037540ce9cd783b339238e1dc5606965137a6822b1a6bd412172fab86a96fa7` (`front/src/app/workspace-route-model.ts`) | `<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/host-routes/records-route-element.test.tsx src/app/workspace-route-model.test.ts src/app/layouts/app-route-layout.test.tsx tests/unit/responsive-navigation.test.tsx` | GREEN, `177/177` | Actual host closing and feedback-document deep routes are classified as `record-workflow`; cross-club switching falls back to the target club's canonical `/host/records`. Normal `/sessions/:id` remains meeting-owned, and role-switch correspondence behavior is unchanged. |
| `7ab95cdc63286c8c1996b8c02315b4465ea16889e8f32e981ba9c32550ce841f`, `d1303c846dc2206c5da57f9d629ccbf8056f0f144f0415576e34b9813b21f26f` (`app-route-layout.tsx`, `mobile-header.tsx`) | same focused GREEN command | GREEN, `177/177` | Record-owned closing, feedback-document, and explicitly record-owned detail routes keep `기록` current/title ownership. With no return state, closing and feedback-document return to canonical records; direct meeting detail still returns to meetings. |
| `5de6f4fe744a91e86a802b5cfff9c2b71eca24232637b9f283ee0e0c1413910c`, `79df239d14103fad56fb1c34b3be693abe8fc77bcc534461e95ab3d1579cb729`, `f6cee1373415bb46c7e70632d16c41b187b0ed93f50919f5d3192ccfed5ecae4` (focused route/shell tests) | exact changed-file ESLint under Node `v24.18.0` and repository-pinned pnpm | exit `0`, no findings | The route-family and mobile ownership regression tests satisfy repository lint rules. |

Round-close safety: `git diff --check` passed. The targeted changed-file scan found no machine-local absolute path, private key marker, token prefix, or BFF secret name. Full frontend gates and the separate mixed-authority review finding remain outside this round.
