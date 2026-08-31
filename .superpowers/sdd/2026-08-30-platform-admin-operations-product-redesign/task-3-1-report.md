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

Ruling: `resolveAdminRouteOwner` is the shared pure desktop/mobile active resolver — it preserves pathname and search semantics, maps `/admin` and `/admin/today` to today, club detail/support/onboarding to clubs, service routes to service, record routes to records, and public takedown to emergency — duplicating route policy in each UI would produce deep-link disagreement.

Ruling: the emergency route remains the separately pinned desktop lane and is omitted from the four mobile primary targets — the approved mobile contract caps the bottom navigation at four operating axes and preserves direct-route capability enforcement — rendering emergency as a fifth tab would normalize an L3 workflow as routine navigation.

Ruling: existing route and breadcrumb labels remain unchanged while only the four primary navigation labels change — Task 3.2 owns broader copy normalization — changing descriptor copy here would widen this slice and make the next task's banned-label evidence ambiguous.

Ruling: mobile uses native links with `aria-current="page"`, a 44px minimum target, equal `minmax(0, 1fr)` columns, wrapping Korean labels, and bounded horizontal overflow — these are the Task 3.1 accessibility and compact-navigation requirements — iconography or broader shell/CSS extraction belongs to later shell and visual-baseline tasks.

Ruling: Task 2.3's space/account controls remain solely in the shell header and Task 2.4's transition owners and publishers are unchanged — the new navigation reads capabilities and location only — adding account duplication or eager/anonymous write execution would reopen previously sealed authority boundaries.

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

Exit `0`: 8 files, 140 tests passed. This includes deep-link ownership, onboarding query semantics, capability fallback, desktop/mobile current state, breadcrumb compatibility, shell composition, frontend boundaries, and the Task 2.4 producer-owner inventory.

## Final verification

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npx --yes corepack@0.35.0 pnpm --dir front test` | 0 | 441 files, 4,010 tests passed on the fresh final run |
| `npx --yes corepack@0.35.0 pnpm --dir front lint` | 0 | 0 errors; two pre-existing Fast Refresh warnings in unchanged host UI files |
| `npx --yes corepack@0.35.0 pnpm --dir front build` | 0 | Vite transformed 792 modules and produced the production bundle; existing chunk-size warning only |
| manual UI-pattern detector over the four changed production targets | 0 | JSON result `[]` |
| `git diff --check` | 0 | no whitespace errors |
| targeted public-safety scan over all Task 3.1 production, test, and report paths | 0 | no local home path, private-key marker, bearer credential, token-shaped secret, or cloud identifier matched |
| `python3 scripts/agent-preflight.py --intent change --isolation-note 'Dedicated Task 3.1 worktree; all current changes are owned by this bounded implementation.' --json` | 0 | repository evidence classified with no stop reasons; the scoped pre-commit form separately exited `2` only because its expected edit paths were already dirty from this task |

The first full frontend test run exited `1` at 4,009/4,010 tests because `src/app/host-session-editor-authority-navigation.test.tsx` observed a competing status message. The exact unrelated file then passed twice in isolation at 3/3 without source changes, and the next complete run passed 441/441 files and 4,010/4,010 tests. This is retained as nondeterministic suite evidence rather than attributed to the admin navigation implementation.

## Self-review

- The four axes are definition-order stable and all current admin routes resolve to exactly one primary owner or the emergency owner.
- Capability filtering never creates a route-named primary item. When a canonical destination is unavailable, the axis retains its exact label and uses the first permitted owned route.
- Desktop and mobile both call the same `visibleAdminNav` and `isAdminAreaActive` functions. No redirects, navigation effects, or query rewriting were added.
- Self-review removed an initial overreach that changed breadcrumb labels; route copy remains for Task 3.2.
- Self-review replaced a newly exported responsive hook with a component slot, removing the new Fast Refresh warning while preserving the shared breakpoint constant.
- The shell's existing space switcher, account control, onboarding owner, logout owner, and transition publication fences were not moved or duplicated.

## Not measured and residual risk

- Real-browser component/E2E behavior, physical mobile devices, 200% zoom, and assistive-technology output were not measured in this bounded unit/build pass. The later shell/visual-baseline tasks own tracked browser evidence across approved breakpoints.
- Mobile layout assertions verify the explicit 44px, wrapping, equal-column, and overflow contracts in JSDOM; computed layout and safe-area behavior remain browser evidence rather than measured facts here.
- No live API, BFF, provider, CDN, production, or destructive workflow was exercised because this task changes read-only navigation composition and does not authorize external side effects.
