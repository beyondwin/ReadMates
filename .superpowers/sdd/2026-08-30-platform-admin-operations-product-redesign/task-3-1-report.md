# Task 3.1 — four operating jobs and active navigation report

Date: 2026-08-31

Base: `f6df998a3f033f0bb72a8bea3263ed13d96b100a`

Branch: `codex/admin-operations-product-redesign`

## Outcome

Desktop and mobile admin navigation now share one capability-filtered catalog and one pure active-owner resolver. The primary navigation is exactly `오늘 할 일`, `클럽 관리`, `서비스 상태`, and `처리 기록`; the existing emergency public-takedown route remains outside those axes. Existing route URLs, deep links, and query strings are unchanged.

No deployment, provider, production, push, merge, or live write action was performed.

## Authority and rulings

Ruling: ADR impact is `none` — this bounded slice implements the already Proposed ADR-0050 navigation decision without completing the wider product redesign — accepting or rewriting the ADR before code, tests, visual evidence, and active architecture converge would overstate the program state.

Ruling: route descriptors remain the single capability and primary-owner catalog — `support` belongs to `clubs`, notifications/AI/health belong to `service`, and audit/analytics belong to `records`; visible axes are derived from those descriptors — maintaining a second route-membership list would allow active state and capability filtering to drift.

Ruling: capability loss hides an unavailable axis but a permitted nested route becomes only that axis's fallback destination — support can make `클럽 관리` link to `/admin/support`, but never creates a support tab — promoting nested capabilities would violate the four-job information architecture.

Ruling: `resolveAdminRouteOwner` is the shared pure desktop/mobile active resolver and pathname is authoritative — it maps `/admin` and `/admin/today` to today, club detail/support and the valid `/admin/clubs?onboarding=1` route family to clubs, service routes to service, record routes to records, and public takedown to emergency even when unrelated query parameters are present — allowing a global query override would make one URL own both a primary axis and the emergency lane.

Ruling: route composition owns router policy and link navigation while presentation receives the resolved owner and an explicit link renderer — `AdminShellLayout` resolves the owner once and supplies the same result to desktop, mobile, primary axes, and the pinned emergency entry; both admin navigation UI files have zero router imports — allowing feature UI to read location independently would recreate divergent active-state authorities.

Ruling: the strengthened `features/**/ui/**` router boundary covers both top-level and nested UI paths, with 15 pre-existing imports recorded as exact file-level ratchet exceptions — neither changed admin navigation file is exempt, and unused exceptions fail the architecture test — a broad folder exemption would let new router coupling enter unnoticed.

Ruling: mobile navigation uses `--bg-raised`, which is defined by the design-system token authority, and the test applies that stylesheet before checking both the token definition and component consumption — string-only checks cannot prove a referenced custom property exists — retaining undefined `--surface` would make the compact bar background depend on browser fallback behavior.

Ruling: the emergency route remains the separately pinned desktop lane and is omitted from the four mobile primary targets — the approved mobile contract caps the bottom navigation at four operating axes and preserves direct-route capability enforcement — rendering emergency as a fifth tab would normalize an L3 workflow as routine navigation.

Ruling: existing route and breadcrumb labels remain unchanged while only the four primary navigation labels change — Task 3.2 owns broader copy normalization — changing descriptor copy here would widen this slice and make the next task's banned-label evidence ambiguous.

Ruling: mobile uses native links with `aria-current="page"`, a 44px minimum target, equal `minmax(0, 1fr)` columns, wrapping Korean labels, and bounded horizontal overflow — these are the Task 3.1 accessibility and compact-navigation requirements — iconography or broader shell/CSS extraction belongs to later shell and visual-baseline tasks.

Ruling: Task 2.3's space/account controls remain solely in the shell header and Task 2.4's transition owners and publishers are unchanged — the new navigation reads capabilities and location only — adding account duplication or eager/anonymous write execution would reopen previously sealed authority boundaries.

## Reviewer fix round 1 TDD evidence

Pathname authority RED:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  features/platform-admin/model/admin-route-catalog.test.ts
```

Exit `1`: 1 file, 31 tests; 2 failed and 29 passed. `/admin/today?onboarding=1` and `/admin/public-takedown?onboarding=1` both incorrectly resolved to clubs because the query override ran before pathname ownership. After removing the global override, the same command exited `0` with 31/31 tests.

Presentation-boundary and token RED:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  features/platform-admin/ui/admin-layout-nav.test.tsx \
  features/platform-admin/ui/admin-mobile-navigation.test.tsx \
  features/platform-admin/route/admin-shell-layout.test.tsx
```

Exit `1`: the two presentation suites produced 23 expected failures because both components still required router context; the shell suite passed. The mobile token assertion also exposed the undefined `--surface` reference.

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  tests/unit/frontend-boundaries.test.ts
```

Exit `1`: 15 tests; 2 failed and 13 passed. The expanded rule detected both changed admin UI imports plus 15 pre-existing router-coupled UI files. The changed files were decoupled and the legacy files were captured as exact, stale-checked ratchet entries rather than a broad exemption.

Fix-round focused GREEN:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  features/platform-admin/model/admin-route-catalog.test.ts \
  features/platform-admin/ui/admin-layout-nav.test.tsx \
  features/platform-admin/ui/admin-mobile-navigation.test.tsx \
  features/platform-admin/route/admin-shell-layout.test.tsx \
  tests/unit/frontend-boundaries.test.ts
```

Exit `0`: 5 files, 101 tests passed. This proves pathname authority, exactly one desktop `aria-current` for emergency with onboarding present, valid clubs onboarding ownership, route-supplied presentation props, the expanded UI boundary, and the defined surface token.

## TDD evidence

Baseline characterization:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  features/platform-admin/model/admin-route-catalog.test.ts \
  features/platform-admin/ui/admin-layout-nav.test.tsx \
  features/platform-admin/route/admin-shell-layout.test.tsx \
  tests/unit/frontend-boundaries.test.ts
```

Exit `0`: 4 files, 70 tests passed before the Task 3.1 assertions were introduced.

Catalog/desktop RED:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  features/platform-admin/model/admin-route-catalog.test.ts \
  features/platform-admin/ui/admin-layout-nav.test.tsx
```

Exit `1`: 33 expected failures and 11 passes. The old catalog exposed `오늘`, `클럽`, `파이프라인`, and `원장`, nested route links, the old support owner, and no shared route-owner resolver.

Mobile RED was recorded in two focused assertions before implementation: shell integration initially had one expected failure because no compact four-job navigation existed; the new mobile component's layout assertion then had one expected failure because fixed-bottom, 44px, and overflow-safe styles were absent.

Final focused GREEN:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  features/platform-admin/model/admin-route-catalog.test.ts \
  features/platform-admin/ui/admin-layout-nav.test.tsx \
  features/platform-admin/ui/admin-mobile-navigation.test.tsx \
  features/platform-admin/ui/admin-breadcrumb.test.tsx \
  features/platform-admin/route/admin-shell-layout.test.tsx \
  src/app/routes/admin.test.tsx \
  tests/unit/frontend-boundaries.test.ts \
  src/app/space-transition-producer-inventory.test.ts
```

Exit `0`: 8 files, 145 tests passed. This includes deep-link ownership, onboarding query semantics, capability fallback, desktop/mobile current state, breadcrumb compatibility, shell composition, frontend boundaries, the surface-token contract, and the Task 2.4 producer-owner inventory.

## Final verification

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npx --yes corepack@0.35.0 pnpm --dir front test` | 0 | 441 files, 4,015 tests passed on the fresh fix-round run |
| `npx --yes corepack@0.35.0 pnpm --dir front lint` | 0 | 0 errors; two pre-existing Fast Refresh warnings in unchanged host UI files |
| `npx --yes corepack@0.35.0 pnpm --dir front build` | 0 | Vite transformed 792 modules and produced the production bundle; existing chunk-size warning only |
| manual UI-pattern detector over the four changed production targets | 0 | JSON result `[]` |
| `git diff --check` | 0 | no whitespace errors |
| targeted public-safety scan over all Task 3.1 production, test, and report paths | 0 | no local home path, private-key marker, bearer credential, token-shaped secret, or cloud identifier matched |
| `python3 scripts/agent-preflight.py --intent change --isolation-note 'Dedicated Task 3.1 worktree; all current changes are owned by this bounded implementation.' --json` | 0 | repository evidence classified with no stop reasons; the scoped pre-commit form separately exited `2` only because its expected edit paths were already dirty from this task |

The original Task 3.1 run first exited `1` at 4,009/4,010 tests because `src/app/host-session-editor-authority-navigation.test.tsx` observed a competing status message. The exact unrelated file then passed twice in isolation at 3/3 without source changes, and the next complete run passed 441/441 files and 4,010/4,010 tests. Fix round 1 subsequently passed the expanded full suite at 4,015/4,015. The earlier event is retained as nondeterministic suite evidence rather than attributed to the admin navigation implementation.

## Self-review

- The four axes are definition-order stable and all current admin routes resolve to exactly one primary owner or the emergency owner.
- Capability filtering never creates a route-named primary item. When a canonical destination is unavailable, the axis retains its exact label and uses the first permitted owned route.
- `AdminShellLayout` computes one `resolveAdminRouteOwner(location)` result and passes it to desktop and mobile together with the route-owned React Router link adapter. Presentation receives only plain owner/link props and callbacks; neither admin navigation UI file imports a router package.
- The desktop primary axes and pinned emergency lane compare against the same owner, so `/admin/public-takedown?onboarding=1` exposes exactly one current link. Query strings and destinations are neither rewritten nor discarded.
- The architecture test checks every top-level and nested `features/**/ui/**` path. Its 15 legacy router exceptions are exact files, are consumed only by matching imports, and fail if stale.
- The compact surface consumes the defined `--bg-raised` design token; its test loads the authoritative token stylesheet and checks both definition and use.
- Self-review removed an initial overreach that changed breadcrumb labels; route copy remains for Task 3.2.
- Self-review replaced a newly exported responsive hook with a component slot, removing the new Fast Refresh warning while preserving the shared breakpoint constant.
- The shell's existing space switcher, account control, onboarding owner, logout owner, and transition publication fences were not moved or duplicated.

## Not measured and residual risk

- Real-browser component/E2E behavior, physical mobile devices, 200% zoom, and assistive-technology output were not measured in this bounded unit/build pass. The later shell/visual-baseline tasks own tracked browser evidence across approved breakpoints.
- Mobile layout assertions verify the explicit 44px, wrapping, equal-column, and overflow contracts in JSDOM; computed layout and safe-area behavior remain browser evidence rather than measured facts here.
- No live API, BFF, provider, CDN, production, or destructive workflow was exercised because this task changes read-only navigation composition and does not authorize external side effects.
