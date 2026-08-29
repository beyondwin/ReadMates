# Stage 2 Task 3 Report — four-area host shell wiring

## Status and scope

- BASE verified clean at `f7b749ded73fd2b2d433e5f62a4d5aa378dfb5da`.
- Task brief SHA-256: `4d039f0757bd70ac04fb96a213dfb6b0749b3703d88fd2b1610cea797a37786e`.
- ADR impact: `update` — implements only the host layout-composition portion of Proposed ADR-0048. No new ADR; ADR-0048 remains Proposed.
- The change wires the Task 2 shell primitives into the existing host layout. It does not add route elements, remove compatibility routes, change authority purge, add redirects, touch server code, run E2E, or change production state.
- Commands used Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`.

## TDD RED → GREEN

The initial layout RED changed the expected host primary model before production code. The focused layout suite failed `1/16`: the rendered labels were the legacy `오늘 · 모임 · 멤버` instead of the required four-area contract. After the minimal shell injection, it passed `16/16`.

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/layouts/app-route-layout.test.tsx
```

A hardening RED then asserted mobile titles across canonical, compatibility, scoped, and record-owned URLs. It failed the seven host title cases that still exposed legacy area names. After deriving the title from normalized `appPathname()` output, the layout suite passed `26/26` in that cycle.

The closing focused unit command passed `5` files and `45` tests with `0` failures:

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/layouts/app-route-layout.test.tsx shared/ui/app-club-shell.test.tsx features/host/ui/shell/host-primary-navigation.test.tsx features/host/ui/shell/host-utility-actions.test.tsx features/host/ui/shell/host-workspace-switcher.test.tsx
```

Review fix round 1 reproduced the stale direct responsive suite at BASE with `22/73` failures. Updating only its host assertions to the approved four-area labels, hrefs, and ownership contract reduced the RED to `3/73`: desktop record-origin detail, nested record-owner detail, and scoped mobile record-origin detail still selected meetings. Changing the standalone TopNav and MobileTabBar normalization target from meetings to records made the suite GREEN at `73/73`. The closing responsive plus layout command passed `2` files and `99` tests:

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/responsive-navigation.test.tsx src/app/layouts/app-route-layout.test.tsx
```

## Source hash → command → result → closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `eba6fb931448f339a32ee08152bdf17114fa5bada7016186788926276f86a429`, `32c89b1bb5d37c25d0fd2c8a24c72f56c65a73621602af48da0536c712fc9807` (`app-route-layout` source/test) | closing focused Vitest above | GREEN, `45/45` | Host layout renders one combined club/workspace control per responsive spine; desktop and mobile expose the exact four approved primary labels in the same href order; settings, member view, notifications, and new meeting remain outside primary navigation but reachable. Member/guest/admin default shell contracts remain covered by the same focused layout/shared-shell suites. |
| `3c918bf448b38a35e43d902b53b682ab73174dfbd4b1f8649bef7f692a08f92c`, `7744778753b62515afcfb0b2186c63234c06bee9eb4660164113e6ee20c06c43`, `5a43e66f58d401a781e3bc7d50670232ed8def8449dd60f70a35b4008218beae`, `85c2aa559aa78b794ba577279b45706a304491855c2ff3b15dad488c2fa5f2da`, `1085c2c1e010d1ca408247a5bca88d18fd4ef7ab8a7e535a4f54f8788d3bbede` (shared shell/model/copy) | closing focused Vitest above and review closing Vitest | GREEN, `45/45` and `99/99` | The shared shell accepts generic responsive primary and utility composition without changing the default path. Desktop labels are `운영실 · 일정과 모임 · 사람 · 기록`; mobile labels are `운영실 · 모임 · 사람 · 기록`, while their scoped destination hrefs remain identical. Route-aware shared fallbacks now assign validated record-origin session detail to records exactly like the host layout. |
| `37905f964ed1fe0038e810c076922318b5a2ff5b01223668ced44b86a2d73d24` (`responsive-navigation.test.tsx`) | review closing Vitest above | RED `22/73`, narrowed RED `3/73`, then GREEN `73/73`; combined GREEN `99/99` | Direct TopNav and MobileTabBar coverage now asserts exact four-area order, canonical/scoped hrefs, compatibility behavior, utility exclusion, direct record routes, validated record-origin ownership, and rejection of external or cross-club ownership without weakening the member/guest assertions. |
| `e139656ef1a721cbb06f8b02d47bf20504597cace78611ae60307c950d9a108d`, `6cb60d6ad97fc838b1caae0358a5261031b66350636f308b79361b2babcd011f` (`host-shell.css`, `mobile.css`) | focused CT command below | GREEN, `8/8` relevant CT | Mobile host utilities remain separate from the bottom primary navigation and use a 44px disclosure target with visible focus. The bottom navigation keeps safe-area padding, and the content reserve prevents overlap. |
| `ec71e3bf235e9d938c2561b7404dfad5206596afd776998761578bef8cb201f6`, `a91c01a7a0ea962ec93431a99065ff4fe7a8fc99a895a635cdac6f478ee882d1`, `a331e72fad4ec27be8ca05f86bd7deb63912750c695f8ecf8f4dd561031edb27` (focused CT sources) | focused CT command below | GREEN, `8/8` relevant CT | At 390px, scoped host tabs retain exact labels/hrefs, 44px targets, safe-area and no horizontal overflow; desktop retains approved order and typography. Task 2 host primitives remain operable at 390 and 1440. |
| focused TypeScript/TSX source and tests | focused ESLint command below | exit `0`, no findings | The wiring remains within existing component, routing, and lint boundaries. |

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts --workers=1 --grep-invert "desktop avatar" features/host/ui/shell/host-shell.ct.tsx shared/ui/app-club-shell.ct.tsx shared/ui/top-nav.ct.tsx shared/ui/mobile-tab-bar.ct.tsx
```

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec eslint src/app/layouts/app-route-layout.tsx src/app/layouts/app-route-layout.test.tsx shared/model/app-club-shell.ts shared/ui/app-club-shell.tsx shared/ui/top-nav.tsx shared/ui/top-nav.ct.tsx shared/ui/mobile-tab-bar.tsx shared/ui/mobile-tab-bar.ct.tsx shared/ui/app-club-shell.ct.tsx shared/ui/readmates-copy.ts
```

Review fix round 1 linted the exact changed TypeScript/TSX surface:

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec eslint shared/ui/top-nav.tsx shared/ui/mobile-tab-bar.tsx tests/unit/responsive-navigation.test.tsx
```

## Operate/harden closure

- Current-route ownership is computed from the normalized `appPathname()` result. Scoped and unscoped canonical/compatibility paths select the same area, while utility paths do not create a fifth current primary item.
- Record-owned session detail/closing/feedback paths select `기록`; ordinary session detail/edit paths select `일정과 모임`.
- Existing paper/ink tokens, typography, icons, focus treatment, target sizes, and reduced-motion behavior remain in use. No new theme, artwork, or decorative treatment was added.
- The Impeccable mechanical detector ran once after the UI pass and returned `[]`.

## Verification notes and residual risk

- Original focused Vitest: passed, `45/45`; review closing responsive plus layout Vitest passed, `99/99`.
- Relevant focused Chromium CT: passed, `8/8`, including 390px and 1440px Task 2 primitives, 390px scoped host navigation, the 767px safe-area/content-reserve boundary, and the 768px desktop boundary.
- Non-blocking CT residual: the original unfiltered focused CT run passed `8/9`; the only failure was the existing member `desktop avatar` screenshot comparison, with `690` pixels (about `1%`) of text anti-aliasing difference in `top-nav-long-account-name-1280.png`. Its DOM and geometry assertions passed. The screenshot artifact is byte-identical between BASE and closing HEAD: both resolve to Git blob `ba40480c43c4d41e16459d1109c37813d6ab5d42`, with SHA-256 `bdea7003385214bbe8956d2387e6552f251d502c72a41ce7cd028c3fe0b9a43a`. This review fix changes only route-aware current selection and unit expectations, so the known avatar CT was not rerun or rewritten.
- Focused ESLint: passed with no findings.
- Final `git diff --check` and targeted public-safety scan: passed with no findings.
- Full frontend lint/test/build and E2E were intentionally not run under the Task 3 stop conditions. Canonical route elements remain Task 4; authority purge remains Task 5; compatibility route removal remains Stage 5.
