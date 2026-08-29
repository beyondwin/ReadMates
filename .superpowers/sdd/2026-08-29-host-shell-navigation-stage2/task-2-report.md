# Stage 2 Task 2 Report — host shell composition primitives

## Status and scope

- BASE verified clean at `2d46fd18e030ea2866cacf35faf71ac806564893`.
- Task brief SHA-256: `040b1038bb95ff4289ad503a548f41db17a16f53107b319128b91bfb12511e6e`.
- ADR impact: `update` — implements only the shell-composition portion of Proposed ADR-0048. No new ADR; ADR-0048 remains Proposed.
- Evidence is local repository/browser-component evidence. No layout wiring, route registration or redirect, server code, E2E, deployment, or production state changed.
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

## Source hash → command → result → closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `e010e0fd21df71b704969653721bfcdc26526dfcdaf5a48e4531bcc8c58ffdbc` (`host-workspace-switcher.tsx`) | focused Vitest above | GREEN, `18/18` | One trigger owns club/workspace selection, renders the requested `AvatarChip` immediately, preserves safe targets supplied by the URL-owned route model adapter, retains workspace on club change, explains unavailable host access, uses unique labelled IDs, and dismisses on Escape with focus restoration. |
| `472780a7f054ce964c37e4a6c552bce82566470b9fb3b37232797479cd34eba5` (`host-primary-navigation.tsx`) | focused Vitest above | GREEN, `18/18` | Desktop renders `운영실 · 일정과 모임 · 사람 · 기록`; mobile shortens only the meeting label; current and denied states remain semantic and discoverable. |
| `17e0321f5e9390bf870c7b97fd2314726f16c150705f6e17fe62a16b22ff8813`, `e9ca5e94b9ae65eac23f8493cbe305ee1a472fafff6a8c022e92cf365ce6a73e` (`host-utility-actions.tsx` and test) | review-fix focused Vitest above | RED `1/4`, then GREEN `4/4` | `초대와 설정`, `멤버 시야`, notification, and `새 모임` remain separate from primary navigation; unread count is announced, and simultaneous desktop/mobile copies use unique permission-reason IDs whose `aria-describedby` resolves to each instance's own reason. |
| `6722c66cbe6afe1cd8de9099570ada7f7a0ae8782abdcafb64d4afafcacbfc5c`, `48b82ff4577af55355611e8f64661e2e436fe570c7b1effe5e142f956f2828ad` (`app-club-shell` model/UI) | focused Vitest above | GREEN, `18/18` | One generic responsive context slot can replace the two legacy selectors; the default member/host selector pair and shared shell regions remain unchanged when no slot is supplied. |
| `e4c799411de911e2bc3ae39883d893a5511ebb8f50b2d41acf3434cd6ceaa1d4` (`host-shell.css`) | `PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/shell/host-shell.ct.tsx` | GREEN, `2/2` at `390×844` and `1440×900` | Long Korean/English identity does not cause horizontal overflow; visible controls are at least 44px; keyboard focus is visible; reduced-motion transition duration stays below the 20ms contract; requested avatar artwork is present. |
| focused TypeScript/TSX source and tests | focused ESLint over the 11 changed TS/TSX files | exit `0`, no findings | New feature UI remains prop/callback driven and shared shell boundaries keep their repository lint contract. |

## Operate/harden closure

- Existing paper/ink tokens and Pretendard remain the only visual system; no global theme, decorative gradient, glass treatment, or new artwork was added.
- Permission-denied destinations stay visible with reasons; long labels wrap; interaction targets are 44px; focus and reduced-motion states are explicit.
- The Impeccable mechanical detector ran once after the UI pass and returned `[]`.
- `AvatarChip` uses the requested existing artwork on the initial render. Its established fallback lifecycle remains unchanged.

## Verification notes and residual risk

- Fresh focused Task 2 Vitest after review fix: passed, `19/19`; the utility-only TDD cycle passed `4/4` after its expected RED.
- Focused Chromium CT from the Task 2 implementation: passed, `2/2` across 390 and 1440 widths. It was not rerun for review fix round 1 because no CSS or visual surface changed.
- Focused ESLint: passed for the two TypeScript/TSX files changed in review fix round 1; the original Task 2 lint set also passed.
- Final staged `git diff --check` and targeted public-safety scan: passed with no findings.
- Full frontend lint/test/build, E2E, and route wiring were intentionally not run under the Task 2 stop conditions. Layout injection remains Task 3; canonical route elements and legacy redirect work remain later Stage 2 tasks.
