# Stage 2 Task 2 Report — host shell composition primitives

## Status and scope

- BASE verified clean at `2d46fd18e030ea2866cacf35faf71ac806564893`.
- Gate-finding round 2 BASE verified clean at `c064c285a3209e8764d22fd0acd92e04001d56c8`.
- Stage 2 range-review round 1 BASE verified clean at `46209d56861755690bf396fc5442a2d7b65fc7b2`.
- Task brief SHA-256: `040b1038bb95ff4289ad503a548f41db17a16f53107b319128b91bfb12511e6e`.
- ADR impact: `update` — implements only the shell-composition portion of Proposed ADR-0048. No new ADR; ADR-0048 remains Proposed.
- Original evidence was local repository/browser-component evidence with no layout wiring. Range-review round 1 changes only the Task 2 switcher contract and its existing Task 3 adapter call site; no route registration or redirect, server code, E2E, deployment, or production state changed.
- Commands used Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`.

## TDD RED → GREEN

RED was established before production changes with the focused Vitest command below. Three new suites failed because their source modules did not exist; the shared shell test failed because the responsive context slot did not exist. A later hardening RED caught legacy `호스트 공간` leakage and duplicate labelled IDs when desktop/mobile switchers coexist.

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/ui/shell/host-workspace-switcher.test.tsx features/host/ui/shell/host-primary-navigation.test.tsx features/host/ui/shell/host-utility-actions.test.tsx shared/ui/app-club-shell.test.tsx
```

After minimal production changes, the same focused command passed: `4` files and `18` tests, `0` failures.

Review fix round 1 added a dual-instance regression before changing production code. With two responsive copies, the focused utility suite failed `1/4` because both limited actions referenced `host-utility-settings-reason`. After adding a React `useId()` instance prefix, the same command passed `4/4`; each action now resolves its own permission reason.

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/ui/shell/host-utility-actions.test.tsx
```

Gate-finding round 2 reproduced the repository typography contract failure before changing CSS: the active notification badge `font-size: 0.6875rem` resolved to `11px`, so the suite failed `1/13`. Raising that existing compact type value to `0.75rem` closed the contract at exactly `12px`; the same command then passed `13/13`.

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/typography-contract.test.ts
```

Stage 2 range-review round 1 added mixed-authority club tests before changing production. The primitive and layout suites failed `2/34`: a HOST club A to MEMBER-only club B transition reused the current `host` workspace and produced `/clubs/B/app/host/people` instead of the adapter's precomputed `/clubs/B/app`. Removing the duplicate target builder and consuming `ClubNavigationItem.href` directly made the same command GREEN at `34/34`; a HOST-capable target still preserves `/app/host/people`, and person IDs are not carried.

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/ui/shell/host-workspace-switcher.test.tsx src/app/layouts/app-route-layout.test.tsx
```

## Source hash → command → result → closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `6ac15eaf9d1b46899b91fd564cbfc4f8a2165ac134cbb98160145206d989a194`, `d30e98ac179e8c1ceef3de44cd2041d8273453aa8b8cfb4fb889182503cc72ee`, `7dd1a918c01f8593ffec291e4797806bbe3809dd59f494f9b2091ffbc5003554` (`host-workspace-switcher` source/test/story) | range-review focused Vitest above | RED `2/34`, then GREEN `34/34` | One trigger owns club/workspace selection and consumes each target club's existing authority-safe `href` without recomputation. A MEMBER-only target lands directly in member space; a HOST-capable target preserves the safe route family without entity IDs. Same-club workspace targets, current-club semantics, unavailable-host recovery, `AvatarChip`, unique labels, and Escape focus restoration remain covered. |
| `472780a7f054ce964c37e4a6c552bce82566470b9fb3b37232797479cd34eba5` (`host-primary-navigation.tsx`) | focused Vitest above | GREEN, `18/18` | Desktop renders `운영실 · 일정과 모임 · 사람 · 기록`; mobile shortens only the meeting label; current and denied states remain semantic and discoverable. |
| `17e0321f5e9390bf870c7b97fd2314726f16c150705f6e17fe62a16b22ff8813`, `e9ca5e94b9ae65eac23f8493cbe305ee1a472fafff6a8c022e92cf365ce6a73e` (`host-utility-actions.tsx` and test) | review-fix focused Vitest above | RED `1/4`, then GREEN `4/4` | `초대와 설정`, `멤버 시야`, notification, and `새 모임` remain separate from primary navigation; unread count is announced, and simultaneous desktop/mobile copies use unique permission-reason IDs whose `aria-describedby` resolves to each instance's own reason. |
| `6722c66cbe6afe1cd8de9099570ada7f7a0ae8782abdcafb64d4afafcacbfc5c`, `48b82ff4577af55355611e8f64661e2e436fe570c7b1effe5e142f956f2828ad` (`app-club-shell` model/UI) | focused Vitest above | GREEN, `18/18` | One generic responsive context slot can replace the two legacy selectors; the default member/host selector pair and shared shell regions remain unchanged when no slot is supplied. |
| `c28788d31f91a96a5fca2cf21637e727280fef491135084381af9b0a80e065a4` (`host-shell.css`) | typography-contract Vitest above; `PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/shell/host-shell.ct.tsx` | typography RED `1/13`, then GREEN `13/13`; CT GREEN `2/2` at `390×844` and `1440×900` | The active unread-count badge now meets the repository's 12px visual-text floor while preserving the compact hierarchy, 44px targets, responsive no-overflow geometry, keyboard focus, reduced motion, and requested avatar artwork. |
| focused TypeScript/TSX source and tests | focused ESLint over the 11 changed TS/TSX files | exit `0`, no findings | New feature UI remains prop/callback driven and shared shell boundaries keep their repository lint contract. |

## Operate/harden closure

- Existing paper/ink tokens and Pretendard remain the only visual system; no global theme, decorative gradient, glass treatment, or new artwork was added.
- Permission-denied destinations stay visible with reasons; long labels wrap; interaction targets are 44px; focus and reduced-motion states are explicit.
- The Impeccable mechanical detector ran once after the UI pass and returned `[]`.
- `AvatarChip` uses the requested existing artwork on the initial render. Its established fallback lifecycle remains unchanged.

## Verification notes and residual risk

- Fresh focused Task 2 Vitest after review fix: passed, `19/19`; the utility-only TDD cycle passed `4/4` after its expected RED.
- Typography contract after gate-finding round 2: passed, `13/13`, after reproducing the expected `11px` RED.
- Focused Chromium CT after the CSS fix: passed, `2/2` across 390 and 1440 widths.
- Range-review primitive plus layout RED `2/34` and GREEN `34/34`; no CT rerun was needed because no rendered markup or styling changed.
- Range-review closing Task 2/3 focused unit set passed `48/48`; focused ESLint passed for the five changed TypeScript/TSX files.
- Focused ESLint: passed for the 11 Task 2 TypeScript/TSX files; CSS has no separate repository lint command.
- Final staged `git diff --check` and targeted public-safety scan: passed with no findings.
- Full frontend lint/test/build, E2E, and route wiring were intentionally not run under the Task 2 stop conditions. Layout injection remains Task 3; canonical route elements and legacy redirect work remain later Stage 2 tasks.
