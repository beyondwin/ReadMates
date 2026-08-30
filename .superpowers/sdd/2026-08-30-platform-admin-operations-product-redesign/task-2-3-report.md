# Task 2.3 report — shared two-level switcher

Plan: `docs/superpowers/plans/2026-08-30-platform-admin-operations-product-redesign.md`

Task: `2.3 shared two-level switcher를 모든 shell에 연결한다`

Start HEAD: `4b1bf694af3b54663b45474b84b03066707babfd`

ADR impact: `none` — this task implements the UI/composition portion of Proposed ADR-0051 without adding or changing a durable decision.

## Outcome

Member, host, and platform-admin shells now render one props-only `GlobalSpaceSwitcher` driven exclusively by the Task 2.2 app controller and the normalized server-owned `availableSpaces` projection. The menu exposes the two product kinds `플랫폼 운영` and `내 클럽`; club destinations are grouped by club and then by `멤버로 보기` / `호스트로 운영`. The account label and other-account login action remain outside the space menu. The old platform-admin client-role/status model and switcher UI were deleted after their behavior assertions were migrated.

The shared component owns only presentation and interaction. Router navigation, fresh projection reads, transition safety, continuity, and authority-loss fencing remain in `src/app`. `AdminShellLayout` receives a rendered slot and imports no app module.

## Rulings

Ruling: Task 2.3 brief의 app composition 파일 누락은 최소 app bridge와 기존 app/member-host/admin route wiring으로 보완한다 — Task 2.2가 controller API를 준비했고 Task 2.3이 legacy UI 교체를 소유하므로 app root만 controller hook을 읽고 feature에는 rendered slot을 주입해야 한다 — 틀렸을 때 비용은 feature-to-app 역의존 또는 shell 한쪽이 legacy client-role 계산을 유지하는 것이다.

Ruling: 허용된 product kind가 하나면 같은 kind 안에 여러 club 또는 perspective가 있어도 전역 switcher를 숨기고 현재 club/perspective를 screen-reader label로만 남긴다 — ADR-0051과 Task 2.3의 exact one-kind contract를 따른다 — 틀렸을 때 비용은 single-kind multi-club 사용자가 shell에서 직접 club을 바꾸지 못하는 것이며, 별도 club selection route는 유지된다.

Ruling: 새 switcher는 `availableSpaces`에 없는 legacy `joinedClubs` 항목을 절대 복원하지 않는다 — 서버 projection이 destination authority이고 client role/status 재계산을 제거하는 것이 ADR-0051의 핵심이다 — 틀렸을 때 비용은 suspended/removed authority가 UI에 다시 나타나는 authorization drift다.

Ruling: 저장된 허용 return target이 없는 cross-club selection은 Task 2.1의 perspective 대표 route를 사용한다 — route correspondence와 continuity fallback은 controller 계약이며 UI가 이전 route family를 추측하면 안 된다 — 틀렸을 때 비용은 사용자가 대표 화면으로 한 번 더 이동하는 것이고, 피한 비용은 stale 또는 cross-domain target 복원이다.

Ruling: host shell의 기존 호스트 workflow와 utility actions는 복제하거나 platform-admin으로 옮기지 않고, 그 shell의 전역 context slot만 교체한다 — Task 2.3 범위는 product-space selection이고 host workflow는 기존 feature owner가 소유한다 — 틀렸을 때 비용은 기존 host utility에 남은 perspective shortcut과 전역 switcher 개념이 일시적으로 함께 보일 수 있는 것이며, host feature를 무단 재설계하는 비용을 피한다.

## TDD and debugging evidence

### RED

| Command | Exit | Expected failure |
| --- | ---: | --- |
| `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/ui/global-space-switcher.test.tsx` | 1 | New test file could not import the not-yet-created shared component; zero tests ran. |
| `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/ui/global-space-switcher.test.tsx shared/ui/app-club-shell.test.tsx` | 1 | Five shell assertions failed because `AppClubShell` still owned the legacy selector contract. |
| `npx --yes corepack@0.35.0 pnpm --dir front test` | 1 | 420/421 files passed; the six failures were stale `spa-layout` assertions for removed `호스트 공간` / `멤버 공간` links and legacy club-route correspondence. |
| `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/spa-layout.test.tsx` | 1 | Systematic-debugging run isolated one accessible-name mismatch plus six detached-element assertions caused by the new auth-driven controller epoch remount. |

The stale suite was not made green by restoring old selectors. Fixtures were given exact `availableSpaces`, assertions were migrated to the new Korean accessible contract, and async shell assertions now wait for the authoritative remount.

### GREEN and final verification

| Command | Exit | Result |
| --- | ---: | --- |
| `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/ui/global-space-switcher.test.tsx shared/ui/app-club-shell.test.tsx shared/ui/workspace-selector.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx src/app/routes/admin.test.tsx src/app/layouts/app-route-layout.test.tsx tests/unit/spa-layout.test.tsx tests/unit/frontend-boundaries.test.ts` | 0 | Final run: 8 files / 106 tests passed. |
| `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/routes/admin.test.tsx` | 0 | 1 file / 4 tests passed, including the final legacy-`joinedClubs` non-authority case. |
| `npx --yes corepack@0.35.0 pnpm --dir front test` | 0 | Final run: 421 files / 3,912 tests passed. |
| `npx --yes corepack@0.35.0 pnpm --dir front lint` | 0 | No errors; two pre-existing Fast Refresh warnings remain in unrelated host UI files. |
| `npx --yes corepack@0.35.0 pnpm --dir front build` | 0 | 785 modules transformed and the production build completed; the existing chunk-size advisory remains. |
| `git diff --check` | 0 | No whitespace errors. |
| Production `rg '@/src/app/'` boundary wrapper under `front/features/platform-admin` | 0 | No production platform-admin feature imports app. |
| Targeted public-safety wrapper over all Task 2.3 source/test paths | 0 | No local home path, private-key marker, bearer token, or token-shaped secret matched. |

`python3 scripts/agent-preflight.py --intent change ... --json` was also run after implementation. Its pre-commit invocation correctly classified the surface as frontend and recommended lint/test/build, but exited `2` because every expected edit path was by then dirty from this task. The same scoped command was repeated after commit and exited `0` with no dirty paths or stop reasons.

The Impeccable detector was run once over the new component, admin shell, and shared global stylesheet. It exited `2` only for four pre-existing side-tab warnings in untouched stylesheet lines (three from commit `40e274150`, one from `4d26255d5`). No finding pointed to the Task 2.3 component or new stylesheet hunk. The approved `05-space-switcher-desktop` asset was inspected before implementation.

## Coverage preserved from deleted switcher

- Active host member/host destinations: shared grouping tests and real admin route/controller integration.
- Member-only and mixed authority destinations: five authority-combination table and projection-owned route fixture.
- Legacy club omission: admin route test proves `joinedClubs` cannot recreate a destination absent from `availableSpaces`.
- Empty/single-kind behavior: switcher hidden with an accessible current-space label.
- Account-name, email, and anonymous fallbacks: admin shell tests; account and login are outside the space control.
- Other-account success/failure: safe admin return path, non-navigation on failure, and Korean local error.
- Enter, Space, ArrowDown, ArrowUp, Home, End, Escape, outside click, roving focus, focus return, and removal of hidden items: shared switcher tests.
- Raw role/status badges: explicit absence assertion in both shared and real-route tests.

## Self-review

- Architecture: app owns auth/controller/router; shared owns props-only UI; platform-admin receives a `ReactNode` slot; boundary test and source scan are green. No feature-to-feature import was added.
- Authority: options are the intersection expressed by controller identities and normalized projection club metadata. No `joinedClubs`, role, or status calculation exists in the bridge or shared UI.
- Interaction/accessibility: all destinations use `menuitemradio`, current state uses `aria-checked`, names are Korean, focus is roving, target height is 44px, hidden menus leave no focusable residue, and account actions are outside the menu.
- Visual craft: existing Pretendard and ReadMates paper/ink/accent tokens are reused; focus rings, hover, disabled/loading/error states, long Korean/English wrapping, mobile width, reduced-motion-compatible token durations, and compact club grouping are explicit. No new gradient text, blur decoration, eyebrow, emoji icon, or equal-card dashboard pattern was introduced.
- Shell behavior: member and host share the same app composition slot; platform-admin receives the same shared UI. The old admin switcher CSS and source residue are removed.

## Files

Created:

- `front/shared/ui/global-space-switcher.tsx`
- `front/shared/ui/global-space-switcher.test.tsx`
- `front/src/app/global-space-switcher-bridge.tsx`

Modified:

- `front/shared/model/app-club-shell.ts`
- `front/shared/ui/app-club-shell.tsx`
- `front/shared/ui/app-club-shell.test.tsx`
- `front/shared/ui/app-club-shell.story.tsx`
- `front/shared/ui/workspace-selector.test.tsx`
- `front/src/app/layouts/app-route-layout.tsx`
- `front/src/app/layouts/app-route-layout.test.tsx`
- `front/src/app/routes/admin.tsx`
- `front/src/app/routes/admin.test.tsx`
- `front/features/platform-admin/route/admin-shell-layout.tsx`
- `front/features/platform-admin/route/admin-shell-layout.test.tsx`
- `front/src/styles/globals.css`
- `front/tests/unit/spa-layout.test.tsx`

Deleted after assertion migration:

- `front/features/platform-admin/model/admin-workspace-switcher-model.ts`
- `front/features/platform-admin/model/admin-workspace-switcher-model.test.ts`
- `front/features/platform-admin/ui/admin-workspace-switcher.tsx`
- `front/features/platform-admin/ui/admin-workspace-switcher.test.tsx`

## Residual / not measured

- Real browser viewport, zoom, pointer, and screen-reader passes are not measured in this task; they remain part of the program browser/evidence stage and are not claimed passing here.
- The detector's four unrelated historical stylesheet warnings remain baseline debt.
- ADR-0051 remains Proposed until the later producer integration, E2E/browser evidence, and active architecture closeout are complete.
