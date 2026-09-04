# Admin·Host Actual-Route Visual Authority Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin 승인 시안 7장과 Host 승인 시안 11장을 실제 authenticated route에서 strict 시각·geometry·first-viewport 계약으로 통과시키고, 실제 데이터가 많거나 실패해도 승인된 구성과 작업 발견성을 유지한다.

**Architecture:** 승인 PNG와 hash는 page-composition 권위로 유지하되 최종 candidate는 Vite 제품 router, 실제 layout/controller/query/UI를 모두 지난 route viewport에서 캡처한다. Component fixture는 빠른 semantic/snapshot 회귀로 낮추고, 실제 route용 deterministic BFF fixture와 18-entry scenario registry가 strict 0.02 pixel gate, 4px/2px geometry, typography, first-viewport, interaction을 소유한다. Admin과 Host는 공통 gate 위에서 별도 vertical slice로 수렴한 뒤 diff 기반 CI와 전체 stress/human/AT 증거로 닫는다.

**Tech Stack:** React 19, TypeScript 6, React Router 8, TanStack Query 5, Vite 8, Vitest 4, Playwright 1.61 E2E/CT, CSS custom properties, bundled Pretendard Variable, pinned Playwright Jammy Docker image

**Spec:** `docs/superpowers/specs/2026-09-04-admin-host-actual-route-visual-authority-convergence-design.md`

**Plan base:** `c2fba2234`

ADR impact: update — ADR-0053 remains `Proposed` until code, tests, active docs, 18 actual-route receipts, five-person discovery, VoiceOver/Safari, and NVDA/Chrome evidence agree.

## Global Constraints

- Scope is exactly Admin `01`–`07` and Host `07`–`17`, 18 approved references. Public and Member composition is out of scope.
- The approved PNG fixes composition, hierarchy, first-viewport disclosure, and interaction. Runtime book, club, member, status, time, count, and copy values remain data-driven.
- The final authority is the real authenticated route. `HostApprovedShell`, presentation fixture JSX, and tracked CT snapshots cannot produce a final PASS.
- Admin Today shows three priority items by default. Host workbox shows four on desktop and three on mobile. Excess data uses an explicit `전체 보기` interaction; it is not hidden in an internal scroll container and is not all pushed into the first viewport.
- Every actual-route scenario must pass `mismatchPixelRatio <= 0.02`, major-region delta `<= 4 CSS px`, repeated-row alignment/spacing delta `<= 2 CSS px`, registered typography, first-viewport ordering, item-cap, title-width, no-overflow, keyboard, focus, and Back then Forward restoration checks.
- Delete the broad `0.10`/`0.15` font-raster escape and the ratio-skip escape. A glyph mask may be added only in a separately reviewed change that names one authority id, one glyph-only rectangle, the fixed renderer fingerprint, reason, and reviewer; this plan adds no masks.
- The canonical renderer is `mcr.microsoft.com/playwright:v1.61.1-jammy` with repository `pnpm@11.13.1` and bundled Pretendard. Do not approve a local macOS screenshot as the strict receipt.
- Admin typography uses `Pretendard Variable`, desktop scale `36/28/20/17/16/14/12px`, mobile scale `28/20/17/16/14/12px`, body line-height `1.6`, and main content max-width `1240px` where the approved composition uses a bounded content column.
- Host preserves `현재 모임 → 단계 → 다음에 할 일 → 필요한 상태 안내 → 준비 현황 → 작업함` document order. Desktop uses the approved two-column composition; mobile remains one column with the four-item bottom navigation and safe area.
- Existing 401/403 purge, 409 comparison, unknown-outcome no-blind-retry, receipt/history, source-owned retry, cursor, role, and club-scope contracts must stay intact.
- No server API, BFF protocol, persistence, migration, deploy, real member data, private domain, secret, token-shaped example, or local absolute path belongs in this change.
- Use Corepack for all repository commands. If Corepack is unavailable, record the exact fallback rather than silently using another pnpm version.
- Before every task, run `git status --short --branch --untracked-files=all`. Stop if an owned path contains pre-existing work, never stage a directory or glob, and stage only the exact files changed by that task.
- Each task starts with RED evidence, makes the smallest production change, runs focused GREEN, receives an independent review, and commits only its owned files.
- Harness and both Admin/Host installers share `installFixtures(page: Page, fixtureKey: ApprovedRouteFixtureKey, requestAudit: ApprovedRouteRequestAudit) => Promise<void>`. Specs must not close over a different arity.

---

## File Structure and Ownership

### New test and harness files

- `front/tests/e2e/support/approved-route-scenarios.ts` — owns the 18 actual route paths, viewport sizes, region selectors/geometry, typography selectors, first-viewport selectors, and default visible-count contracts.
- `front/tests/e2e/support/approved-route-harness.ts` — settles fonts/query rendering, measures all scenario contracts, captures the viewport candidate, writes failure-safe evidence, then evaluates the strict receipt.
- `front/tests/e2e/support/approved-route-request-audit.ts` and `.test.ts` — fail closed on unmatched BFF traffic and effecting requests that are not explicitly allowlisted for fixture-only preparation.
- `front/tests/e2e/support/approved-route-geometry.ts` — is the single test-only source for geometry imported by actual-route scenarios and retained CT assertions.
- `front/tests/e2e/support/admin-approved-route-fixtures.ts` — supplies public-safe Admin auth/capability and BFF payloads for the seven actual routes.
- `front/tests/e2e/support/host-approved-route-fixtures.ts` — supplies public-safe Host auth/club and BFF payloads for the eleven actual routes.
- `front/tests/e2e/admin-approved-routes.spec.ts` — final actual-route authority tests for Admin `01`–`07`.
- `front/tests/e2e/host-approved-routes.spec.ts` — final actual-route authority tests for Host `07`–`17`.
- `front/tests/e2e/approved-route-auth-scope.spec.ts` — focused Admin capability, Host perspective, scoped-club, and request-order evidence for the changed fixture boundary.
- `front/tests/e2e/approved-route-stress.spec.ts` — non-pixel semantic/geometry stress matrix for long copy, high density, error states, 320px, and zoom proxy.
- `front/tests/performance/visual-authority-docker.ts` and `.test.ts` — build the pinned Docker command for actual-route authority tests.
- `front/scripts/run-visual-authority-docker.ts` — launches the pinned renderer with an optional affected-id filter.
- `front/scripts/list-affected-visual-authorities.ts` — converts a changed-path file into the affected authority id list used by CI.
- `front/features/platform-admin/ui/admin-today.css` — owns Today queue, docket, disclosure, and mobile list/detail composition removed from the oversized ledger stylesheet.
- `docs/reports/2026-09-04-admin-host-actual-route-visual-authority-acceptance.md` — records 18 strict receipts, stress results, independent review, human discovery, and assistive-technology status.

### Existing files with scoped changes

- `front/tests/e2e/support/approved-mockup-manifest.ts` — owns the exact id union, actual-route owner tests, repository-relative dependency partitions, and immutable approved paths, hashes, and dimensions.
- `front/tests/e2e/support/approved-mockup-contract.ts` and `front/tests/unit/approved-mockup-contract.test.ts` — remove broad/skip escapes and add strict viewport capture.
- `front/features/platform-admin/route/admin-shell-layout.ct.tsx`, `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`, `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`, `front/features/host/ui/approved-host-ledgers.ct.tsx` — retain component semantics/snapshots but stop issuing final approved-PNG receipts.
- `front/features/platform-admin/model/platform-admin-operations-model.ts`, `front/features/platform-admin/model/platform-admin-operations-model.test.ts`, `front/features/platform-admin/route/use-admin-today-controller.ts`, and `front/features/platform-admin/route/use-admin-today-controller.test.tsx` — extend the existing URL-owned operations search state with `queue=all` disclosure and Back/Forward behavior.
- `front/features/platform-admin/ui/admin-operations-queue.tsx`, `front/features/platform-admin/ui/admin-operations-queue.test.tsx`, `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx`, `front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`, `front/features/platform-admin/ui/admin-today-ledger.tsx`, and `front/features/platform-admin/ui/admin-today-ledger.test.tsx` — own three-item priority disclosure, explicit `전체 보기`, title width, and focus restoration.
- `front/features/platform-admin/route/admin-shell-layout.tsx`, `front/features/platform-admin/ui/admin-shell.css`, `admin-page-patterns.css`, `admin-editorial-ledger.css` — own Admin shell hierarchy and remove Today-specific override accumulation.
- `front/features/platform-admin/ui/admin-club-management.css`, `front/features/platform-admin/ui/admin-service-status.css`, `front/features/platform-admin/ui/admin-processing-records.css`, `front/features/platform-admin/ui/admin-clubs-ledger.test.tsx`, `front/features/platform-admin/ui/admin-health-grid.test.tsx`, `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`, `front/features/platform-admin/route/admin-clubs-route.test.tsx`, `front/features/platform-admin/route/admin-health-route.test.tsx`, and `front/features/platform-admin/route/admin-audit-route.test.tsx` — own Admin `02`–`04` ledger geometry.
- `front/features/host/model/host-workbox-model.ts` and test — owns default visible workbox slice and hidden/continuation metadata without changing domain priority.
- `front/features/host/route/host-dashboard-route.tsx` and test — owns URL-backed `workbox=all`, compact source-failure summary, and actual route composition.
- `front/features/host/ui/workbox/host-workbox.tsx`, `front/features/host/ui/workbox/host-work-item.tsx`, `front/features/host/ui/workbox/host-workbox.css`, `front/features/host/ui/workbox/host-workbox.test.tsx`, and `front/features/host/ui/workbox/host-workbox.ct.tsx` — own four/three-item disclosure and compact rows.
- `front/features/host/ui/operating-room/host-operating-room-page.tsx`, `front/features/host/ui/operating-room/operating-room.css`, `front/features/host/ui/operating-room/current-meeting-header.test.tsx`, `front/features/host/ui/operating-room/host-next-action.test.tsx`, `front/features/host/ui/operating-room/meeting-phase-tabs.test.tsx`, `front/features/host/ui/operating-room/preparation-ledger.test.tsx`, and `front/features/host/ui/operating-room/phase-status-ledger.test.tsx` — own approved semantic order and partial/phase notice placement.
- `front/features/host/ui/shell/host-shell.css`, `front/features/host/ui/host-editorial-ledger.css`, `front/features/host/ui/meeting-list/meeting-toc.css`, `front/features/host/ui/members/member-ledger.css`, `front/features/host/ui/person/host-person-detail.css`, `front/features/host/ui/schedule-review/host-schedule-review.css`, and the exact tests named in Task 8 — own Host `10`–`17` route composition.
- `front/package.json` and `.github/workflows/ci.yml` — expose and require the pinned actual-route gate with changed-path invalidation. `front/playwright.config.ts` is verified-no-change because its current `testMatch` and `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY` Vite-only branch already cover the new specs.
- `front/DESIGN.md`, the two active Admin/Host design docs, `docs/development/host-redesign-mockups/README.md`, both 2026-09-02 acceptance reports, `CHANGELOG.md`, and ADR-0053 — align active truth after measured implementation.

### Files that must not change

- `design/mockups/2026-08-30-admin-operations-redesign/*.png` and sidecars.
- `docs/development/host-redesign-mockups/07-host-lifecycle-operating-room-approved.png` through `17-mobile-host-person-detail-approved.png`.
- `front/features/**/api`, `front/functions`, `server`, migrations, and deploy files.
- Existing tracked CT screenshots may change only after the owning actual-route scenario is strict GREEN and an independent reviewer approves the CT diff. Updating them cannot satisfy or bypass the actual-route gate.

### Dependency order

`strict contract → actual-route registry/harness → Admin Today/shell → Admin ledgers → Host workbox/operating room → Host ledgers → stress/CI → evidence/docs`

### Acceptance-matrix selection

- Selected `UI or runtime state`: loading, empty, denied, stale, partial/full error, wrapping, responsive layout, route continuity, visual geometry, keyboard, and focus are changed or re-gated.
- Selected `Actor or authorization`: Admin capability and Host perspective fixtures decide whether each protected actual route may render; focused E2E must prove fail-closed behavior before protected data requests.
- Selected `Club context`: Host auth must be requested with `clubSlug=visual-authority`; omitted or mismatched club projection must resolve to the existing safe same-club behavior without reading Host data.
- Excluded `BFF or OAuth`, persistence/migration, guest/public exposure, provider, deploy, billing, messaging, and production mutation: no protocol or production effect changes are authorized. If implementation requires one, stop and request a separate decision.

---

### Task 1: Remove False Visual PASS Paths

**Files:**

- Modify: `front/tests/e2e/support/approved-mockup-contract.ts:17-29,60-80,227-250`
- Modify: `front/tests/unit/approved-mockup-contract.test.ts:27-125`
- Modify: `front/features/platform-admin/route/admin-shell-layout.ct.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`
- Modify: `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`
- Modify: `front/features/host/ui/approved-host-ledgers.ct.tsx`
- Modify: `front/package.json`

**Interfaces:**

- Produces: `assertApprovedMismatchRatio({ id, mismatchPixelRatio, maxDiffPixelRatio }): void`
- Preserves: `captureApprovedComparison(...)` only for strict locator-based diagnostic use.
- Removes: `allowFontRasterException`, `fontRasterExceptionMaxRatio`, `skipMismatchRatioAssertion`, `FONT_RASTER_EXCEPTION_MAX_RATIO`, `HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO`.
- Removes: the misleading `test:ct:approved` package script after those CT files stop producing approved-route receipts; `test:ct:docker` remains the component regression command.
- Reclassifies: the four CT files as component semantic/snapshot tests, not final reference receipts.

- [ ] **Step 1: Replace exception acceptance tests with strict fail-closed tests**

```ts
it.each([
  ["admin-today-desktop", 0.020001],
  ["host-prep-desktop", 0.08],
  ["host-live-mobile", 0.15],
])("rejects %s above the exact 0.02 ceiling", (id, mismatchPixelRatio) => {
  expect(() => assertApprovedMismatchRatio({
    id,
    mismatchPixelRatio,
    maxDiffPixelRatio: 0.02,
  })).toThrow(new RegExp(`${id} mismatch ratio .* exceeds 0.02`));
});
```

Delete tests that bless `0.10`, `0.15`, or a skipped ratio. Add a source contract assertion so those escape names cannot be reintroduced accidentally:

```ts
import { readFileSync } from "node:fs";

const contractSource = readFileSync(
  new URL("../e2e/support/approved-mockup-contract.ts", import.meta.url),
  "utf8",
);
expect(contractSource).not.toMatch(/allowFontRasterException|fontRasterExceptionMaxRatio|skipMismatchRatioAssertion/);
```

- [ ] **Step 2: Run the unit test and confirm RED**

Run: `corepack pnpm --dir front exec vitest run tests/unit/approved-mockup-contract.test.ts`

Expected: FAIL because the broad exception fields and constants still exist.

- [ ] **Step 3: Make the strict contract minimal**

```ts
export type ApprovedComparisonInput = {
  page: Page;
  testInfo: TestInfo;
  entry: ApprovedMockupEntry;
  candidate: Locator;
  regions: readonly ApprovedRegion[];
};

export function assertApprovedMismatchRatio(input: {
  id: string;
  mismatchPixelRatio: number;
  maxDiffPixelRatio: number;
}): void {
  if (input.mismatchPixelRatio <= input.maxDiffPixelRatio) return;
  throw new Error(
    `${input.id} mismatch ratio ${input.mismatchPixelRatio} exceeds ${input.maxDiffPixelRatio}`,
  );
}
```

Update `captureApprovedComparison` to pass only the three strict fields.

- [ ] **Step 4: Remove approved-PNG receipt calls from component fixtures**

Delete imports and call sites for `approvedMockup`, `captureApprovedComparison`, and raster exception constants from the four CT files. Keep semantic order, geometry, keyboard, focus, overflow, and tracked `toHaveScreenshot` assertions. Rename helper names such as `captureHostLedger` that exist only to issue approved receipts; do not weaken component assertions.

Delete `test:ct:approved` from `front/package.json`. Add a unit source assertion that `test:ct:docker` remains and no package script containing `ct:approved` exists.

- [ ] **Step 5: Run focused GREEN checks**

Run: `corepack pnpm --dir front exec vitest run tests/unit/approved-mockup-contract.test.ts tests/e2e/support/visual-authority-contract.test.ts`

Run: `corepack pnpm --dir front test:ct:docker`

Expected: unit and CT suites PASS; no output or source contains a broad ratio bypass.

- [ ] **Step 6: Commit**

```bash
git add front/tests/e2e/support/approved-mockup-contract.ts front/tests/unit/approved-mockup-contract.test.ts front/features/platform-admin/route/admin-shell-layout.ct.tsx front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx front/features/host/ui/approved-host-ledgers.ct.tsx front/package.json
git commit -m "test: remove broad visual authority exceptions"
```

---

### Task 2: Register the 18 Actual-Route Authority Scenarios

**Files:**

- Create: `front/tests/e2e/support/approved-route-scenarios.ts`
- Create: `front/tests/e2e/support/approved-route-harness.ts`
- Create: `front/tests/e2e/support/approved-route-scenarios.test.ts`
- Create: `front/tests/e2e/support/approved-route-request-audit.ts`
- Create: `front/tests/e2e/support/approved-route-request-audit.test.ts`
- Create: `front/tests/e2e/support/approved-route-geometry.ts`
- Modify: `front/tests/e2e/support/approved-mockup-manifest.ts`
- Modify: `front/tests/e2e/support/approved-mockup-contract.ts`
- Modify: `front/tests/unit/approved-mockup-contract.test.ts`
- Modify: `front/features/platform-admin/route/admin-shell-layout.ct.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`
- Modify: `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`
- Modify: `front/features/host/ui/approved-host-ledgers.ct.tsx`

**Interfaces:**

- Produces in the manifest: `ApprovedMockupId`, an explicit union of all 18 ids, and actual-route `ownerTest` values.
- Produces: `VisualAuthorityScenario`, `VISUAL_AUTHORITY_SCENARIOS`, `visualAuthorityScenario(id)`, `parseVisualAuthoritySelection(rawSelection?)`, `visualAuthoritySelected(id, rawSelection?)`.
- Produces: `captureApprovedViewportComparison({ page, testInfo, entry, regions, results }): Promise<ApprovedComparisonReport>`.
- Produces: `runActualRouteAuthority({ page, testInfo, scenario, installFixtures }): Promise<ApprovedComparisonReport>`; `installFixtures` has exactly this signature: `(page: Page, fixtureKey: ApprovedRouteFixtureKey, requestAudit: ApprovedRouteRequestAudit) => Promise<void>`. The harness installs the catch-all BFF audit first, then calls `installFixtures(page, scenario.fixtureKey, requestAudit)`. Specs must not close over a different arity. The harness resolves the registered preparation and interaction executors from the scenario keys. Every `history-restore` interaction executes Activate, then Back, then Forward, and reasserts the activated URL/state after Forward.
- Produces: versioned `ApprovedComparisonReport` with renderer/font/DPR fingerprint and every strict sub-result; evidence is written before the final assertion throws.
- Produces: request audit that permits only registered fixture traffic and an explicitly validated preview POST.
- Consumes: unchanged reference path/hash/size values from `APPROVED_MOCKUPS`.

- [ ] **Step 1: Write the failing registry contract**

```ts
describe("actual-route visual authority scenarios", () => {
  it("registers one real route for every immutable approved reference", () => {
    expect(VISUAL_AUTHORITY_SCENARIOS).toHaveLength(18);
    expect(VISUAL_AUTHORITY_SCENARIOS.map((item) => item.id).sort())
      .toEqual(APPROVED_MOCKUPS.map((item) => item.id).sort());
    expect(VISUAL_AUTHORITY_SCENARIOS.every((item) => item.route.startsWith("/"))).toBe(true);
  });

  it("requires the exact actor, scope, fixture, geometry, typography, viewport, item-cap, and interaction contracts", () => {
    for (const scenario of VISUAL_AUTHORITY_SCENARIOS) {
      const required = REQUIRED_VISUAL_AUTHORITY_COVERAGE[scenario.id];
      expect(scenario.actor).toEqual(required.actor);
      expect(scenario.fixtureKey).toBe(required.fixtureKey);
      expect(scenario.preparationKey).toBe(required.preparationKey);
      expect(scenario.regions).toEqual(required.regions);
      expect(scenario.typography).toEqual(required.typography);
      expect(scenario.firstViewport).toEqual(required.firstViewport);
      expect(scenario.interactions).toEqual(required.interactions);
      expect(scenario.defaultVisibleItems).toEqual(required.defaultVisibleItems);
      for (const region of required.regions) {
        expect(region.selector.length).toBeGreaterThan(0);
        expect(scenario.regions.some((item) => item.selector === region.selector)).toBe(true);
      }
      for (const entry of required.typography) {
        expect(entry.fontFamilyIncludes).toBe("Pretendard");
        expect(scenario.typography.some((item) => item.selector === entry.selector)).toBe(true);
      }
      for (const entry of required.firstViewport) {
        expect(["fully-visible", "intersects"]).toContain(entry.visibility);
        expect(scenario.firstViewport.some((item) => item.selector === entry.selector)).toBe(true);
      }
      if (required.defaultVisibleItems) {
        expect(required.defaultVisibleItems.selector.length).toBeGreaterThan(0);
        expect([3, 4]).toContain(required.defaultVisibleItems.count);
      }
      for (const interaction of required.interactions) {
        expect(interaction.kind).toEqual(expect.any(String));
        if (interaction.kind === "history-restore") {
          expect(interaction.expectedUrlAfterActivate).toMatch(/^\//);
          expect(interaction.expectedUrlAfterBack).toMatch(/^\//);
          expect(interaction.expectedUrlAfterForward).toBe(interaction.expectedUrlAfterActivate);
        }
      }
      if (scenario.actor.kind === "club-host") {
        expect(scenario.actor.clubSlug).toBe("visual-authority");
        expect(scenario.actor.perspective).toBe("HOST");
      }
    }
  });

  it("selects all ids by default and only named ids when filtered", () => {
    expect(visualAuthoritySelected("admin-today-desktop", "")).toBe(true);
    expect(visualAuthoritySelected(
      "admin-today-desktop",
      "host-prep-mobile,admin-today-desktop",
    )).toBe(true);
    expect(visualAuthoritySelected("host-live-desktop", "host-prep-mobile")).toBe(false);
    expect(() => parseVisualAuthoritySelection("unknown-authority"))
      .toThrow(/Unknown visual authority id/);
  });

  it("assigns final ownership only to actual-route specs", () => {
    expect(APPROVED_MOCKUPS.every((entry) =>
      entry.ownerTest === "front/tests/e2e/admin-approved-routes.spec.ts"
      || entry.ownerTest === "front/tests/e2e/host-approved-routes.spec.ts",
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Run the registry test and confirm RED**

Run: `corepack pnpm --dir front exec vitest run tests/e2e/support/approved-route-scenarios.test.ts`

Expected: FAIL because the scenario module does not exist.

- [ ] **Step 3: Define the exact scenario contracts**

```ts
export type ApprovedMockupId =
  | "admin-today-desktop" | "admin-clubs-desktop" | "admin-service-desktop"
  | "admin-records-desktop" | "admin-space-switcher-desktop"
  | "admin-today-mobile" | "admin-work-detail-mobile"
  | "host-prep-desktop" | "host-live-desktop" | "host-closing-desktop"
  | "host-meetings-desktop" | "host-people-desktop" | "host-records-desktop"
  | "host-settings-desktop" | "host-schedule-review-desktop"
  | "host-prep-mobile" | "host-live-mobile" | "host-person-mobile";

export type ApprovedRouteFixtureKey =
  | "admin-today" | "admin-clubs" | "admin-health" | "admin-audit"
  | "host-operating-room" | "host-meetings" | "host-people"
  | "host-records" | "host-settings" | "host-schedule-review" | "host-person";

export type ApprovedEffectKind =
  | "attendance-mutation" | "notification-confirm" | "notification-send"
  | "invitation-create" | "settings-update" | "session-close"
  | "membership-mutation" | "other-effecting-request";

export type VisualAuthorityScenario = {
  id: ApprovedMockupId;
  route: string;
  viewport: { width: number; height: number };
  rootSelector: string;
  actor:
    | { kind: "platform-admin"; role: "OPERATOR"; capabilities: readonly PlatformAdminCapability[] }
    | { kind: "club-host"; clubSlug: "visual-authority"; perspective: "HOST" };
  fixtureKey: ApprovedRouteFixtureKey;
  preparationKey: "none" | "open-space-switcher" | "preview-schedule-notification";
  regions: readonly {
    name: string;
    selector: string;
    expected: Geometry;
    toleranceCssPx: 2 | 4;
  }[];
  typography: readonly {
    name: string;
    selector: string;
    fontFamilyIncludes: "Pretendard";
    fontSizePx: number;
    fontWeight: readonly number[];
    lineHeightPx: number | "normal";
    color: string;
  }[];
  firstViewport: readonly {
    name: string;
    selector: string;
    visibility: "fully-visible" | "intersects";
  }[];
  defaultVisibleItems?: { selector: string; count: 3 | 4 };
  interactions: readonly VisualAuthorityInteraction[];
};

export type RequiredScenarioCoverage = {
  actor: VisualAuthorityScenario["actor"];
  fixtureKey: ApprovedRouteFixtureKey;
  preparationKey: VisualAuthorityScenario["preparationKey"];
  regions: VisualAuthorityScenario["regions"];
  typography: VisualAuthorityScenario["typography"];
  firstViewport: VisualAuthorityScenario["firstViewport"];
  interactions: VisualAuthorityScenario["interactions"];
  defaultVisibleItems: VisualAuthorityScenario["defaultVisibleItems"];
};

export type RequiredVisualAuthorityInteractionName =
  | "select-work" | "show-all-url" | "back-restores-priority" | "keyboard-work-row"
  | "select-club" | "back-restores-club-focus" | "club-pagination"
  | "keyboard-service-row" | "select-service-evidence"
  | "select-audit" | "back-restores-audit-focus" | "audit-pagination"
  | "keyboard-root-menu" | "club-subflow" | "escape-restores-trigger"
  | "select-mobile-work" | "back-restores-mobile-row" | "primary-action-keyboard-reachable"
  | "phase-roving-tabs" | "show-all-workbox-url" | "back-restores-capped-workbox"
  | "prep-retry" | "attendance-undo-keyboard-reachable" | "closing-destination"
  | "meeting-view-tab" | "meeting-status-tab" | "meeting-pagination"
  | "select-member" | "back-restores-member-focus" | "member-pagination"
  | "open-closing-record" | "back-restores-record-focus" | "record-pagination"
  | "open-invitation-form" | "escape-restores-invitation-focus"
  | "preview-notification-post" | "person-history-pagination"
  | "person-status-keyboard-reachable";

export type VisualAuthorityInteraction =
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "activate";
      target: string;
      via: "click" | "Enter" | "Space";
      expectedVisible: string;
      expectedUrl?: string;
      expectedFocus?: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "focus-control";
      target: string;
      expectedVisible: true;
      expectedFocused: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "keyboard-menu";
      trigger: string;
      keys: readonly ("Enter" | "ArrowDown" | "ArrowUp" | "Escape")[];
      expectedFocused: string;
      expectedExpanded: boolean;
      expectedFocusAfterEscape: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "history-restore";
      activate: string;
      expectedUrlAfterActivate: string;
      expectedUrlAfterBack: string;
      expectedUrlAfterForward: string;
      expectedRestoredFocusAfterBack?: string;
      expectedRestoredFocusAfterForward?: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "tab-selection";
      tab: string;
      expectedSelected: string;
      expectedPanel: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "prepared-request";
      performedByPreparationKey: "preview-schedule-notification";
      method: "POST";
      expectedPath: "/api/bff/api/host/notifications/manual/preview";
      expectedVisible: string;
      forbiddenEffectKinds: readonly ApprovedEffectKind[];
    };

export function parseVisualAuthoritySelection(
  rawSelection = process.env.READMATES_VISUAL_AUTHORITY_IDS,
): ReadonlySet<ApprovedMockupId>;

export function visualAuthoritySelected(
  id: ApprovedMockupId,
  rawSelection = process.env.READMATES_VISUAL_AUTHORITY_IDS,
): boolean;
```

`REQUIRED_VISUAL_AUTHORITY_COVERAGE` is a `Record<ApprovedMockupId, RequiredScenarioCoverage>` and is the authority for exact object completeness. Registry tests compare the objects themselves (`regions`, `typography`, `firstViewport`, `interactions`, `defaultVisibleItems`), not sorted name lists. Shared region/typography/interaction objects are expanded before comparison. Every required selector must exist on the scenario, and every interaction object must include the discriminant-specific expected fields. Comparing sorted name lists is not sufficient.

The actor/fixture/preparation portion is exact as well:

- Every Admin id uses role `OPERATOR` with the four shell/navigation view capabilities `VIEW_TODAY`, `VIEW_CLUBS`, `VIEW_SERVICE_HEALTH`, and `VIEW_AUDIT`. `admin-clubs-desktop` additionally has `VIEW_CLUB_OPERATIONS` and `CREATE_CLUB`; no other Admin scenario gains mutation or sensitive-audit capabilities. Fixture keys are `admin-today`, `admin-clubs`, `admin-health`, or `admin-audit` by route. Preparation is `open-space-switcher` only for `admin-space-switcher-desktop`, otherwise `none`.
- Every Host id uses `{ kind: "club-host", clubSlug: "visual-authority", perspective: "HOST" }` and the route-specific key under the closed `host-approved` fixture-key union. Preparation is `preview-schedule-notification` only for `host-schedule-review-desktop`, otherwise `none`.

Shared measured geometry (copy into `approved-route-geometry.ts`; do not invent a parallel page tree):

```ts
export const ADMIN_HEADER_DESKTOP_GEOMETRY = { x: 0, y: 0, width: 1672, height: 86 } as const;
export const ADMIN_RAIL_DESKTOP_GEOMETRY = { x: 0, y: 86, width: 260, height: 855 } as const;
export const ADMIN_QUEUE_DESKTOP_GEOMETRY = { x: 260, y: 86, width: 559, height: 855 } as const;
export const ADMIN_DOCKET_DESKTOP_GEOMETRY = { x: 819, y: 86, width: 853, height: 855 } as const;
export const ADMIN_LEDGER_LIST_GEOMETRY = { x: 260, y: 154, width: 559, height: 787 } as const;
export const ADMIN_LEDGER_DOCKET_GEOMETRY = { x: 819, y: 154, width: 853, height: 787 } as const;
export const ADMIN_SERVICE_TABLE_GEOMETRY = { x: 292, y: 154, width: 1348, height: 763 } as const;
export const ADMIN_HEADER_MOBILE_GEOMETRY = { x: 0, y: 0, width: 390, height: 70 } as const;
export const ADMIN_NAV_MOBILE_GEOMETRY = { x: 0, y: 734, width: 390, height: 110 } as const;
export const ADMIN_FIRST_ROW_MOBILE_GEOMETRY = { x: 20, y: 220, width: 350, height: 94 } as const;
export const ADMIN_BACK_MOBILE_GEOMETRY = { x: 0, y: 0, width: 390, height: 67 } as const;
export const ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY = { x: 20, y: 67, width: 350, height: 761 } as const;
export const ADMIN_PAGE_HEADING_DESKTOP_GEOMETRY = { x: 260, y: 86, width: 1412, height: 68 } as const; // derived: rail right edge + header bottom through ledger-list y
export const HOST_BODY_DESKTOP_GEOMETRY = { x: 36, y: 319, width: 1465, height: 665 } as const;
export const HOST_WORKBOX_DESKTOP_GEOMETRY = { x: 988, y: 319, width: 513, height: 665 } as const;
export const HOST_MOBILE_NAV_GEOMETRY = { x: 0, y: 768, width: 390, height: 64 } as const;
export const HOST_PREP_MOBILE_MAIN_GEOMETRY = { x: 19, y: 58, width: 352, height: 902 } as const;
export const HOST_LIVE_MOBILE_MAIN_GEOMETRY = { x: 19, y: 58, width: 352, height: 806 } as const;
export const HOST_LIVE_MOBILE_BOARD_GEOMETRY = { x: 19, y: 200, width: 352, height: 600 } as const;
export const HOST_MEETINGS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_MEETINGS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_MEETINGS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1086 } as const;
export const HOST_PEOPLE_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_PEOPLE_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_PEOPLE_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1062 } as const;
export const HOST_RECORDS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_RECORDS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_RECORDS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 990 } as const;
export const HOST_SETTINGS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_SETTINGS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_SETTINGS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1052 } as const;
export const HOST_SCHEDULE_REVIEW_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_SCHEDULE_REVIEW_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_SCHEDULE_REVIEW_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 943 } as const;
export const HOST_PERSON_HEADER_GEOMETRY = { x: 17, y: 58, width: 356, height: 143 } as const;
export const HOST_PERSON_MAIN_GEOMETRY = { x: 1, y: 58, width: 388, height: 737 } as const;
```

Shared production-DOM objects. Typography color is light-theme `--ink-900` / `--text`. Line-heights are token products (`36 * 1.15`, `16 * 1.6`, `12 * 1.4`).

```ts
const INK = "oklch(0.18 0.020 255)";
const ADMIN_HEADER = { name: "admin-header", selector: ".admin-shell__header", expected: ADMIN_HEADER_DESKTOP_GEOMETRY, toleranceCssPx: 4 as const };
const ADMIN_RAIL = { name: "admin-rail", selector: ".admin-shell__nav", expected: ADMIN_RAIL_DESKTOP_GEOMETRY, toleranceCssPx: 4 as const };
const ADMIN_MOBILE_HEADER = { name: "mobile-header", selector: ".admin-shell__header", expected: ADMIN_HEADER_MOBILE_GEOMETRY, toleranceCssPx: 4 as const };
const ADMIN_MOBILE_NAV = { name: "mobile-nav", selector: ".admin-mobile-navigation", expected: ADMIN_NAV_MOBILE_GEOMETRY, toleranceCssPx: 4 as const };
const HOST_HEADER = { name: "host-header", selector: "header.topnav", expected: HOST_MEETINGS_HEADER_GEOMETRY, toleranceCssPx: 4 as const };
const HOST_NAV = { name: "host-nav", selector: 'nav[aria-label="호스트 주 메뉴"]', expected: HOST_MEETINGS_NAV_GEOMETRY, toleranceCssPx: 4 as const };
const HOST_MOBILE_NAV = { name: "mobile-nav", selector: '[data-club-shell-region="mobile-primary"] .m-tabbar', expected: HOST_MOBILE_NAV_GEOMETRY, toleranceCssPx: 4 as const };
const HOST_MOBILE_HEADER = { name: "mobile-header", selector: '[data-club-shell-region="mobile-context"]', expected: HOST_PERSON_HEADER_GEOMETRY, toleranceCssPx: 4 as const };

const TYPO_ADMIN_WORDMARK = { name: "wordmark", selector: ".admin-shell__wordmark", fontFamilyIncludes: "Pretendard" as const, fontSizePx: 12, fontWeight: [650], lineHeightPx: 16.8, color: INK };
const TYPO_ADMIN_PAGE_TITLE = { name: "page-title", selector: ".admin-page-frame h1", fontFamilyIncludes: "Pretendard" as const, fontSizePx: 36, fontWeight: [600], lineHeightPx: 41.4, color: INK };
const TYPO_ADMIN_PAGE_TITLE_MOBILE = { name: "page-title", selector: ".admin-page-frame h1", fontFamilyIncludes: "Pretendard" as const, fontSizePx: 28, fontWeight: [600], lineHeightPx: 33.6, color: INK };
const TYPO_QUEUE_TITLE = { name: "queue-title", selector: ".admin-operations-queue__title", fontFamilyIncludes: "Pretendard" as const, fontSizePx: 17, fontWeight: [600], lineHeightPx: 23.8, color: INK };
const TYPO_BODY = { name: "body-copy", selector: ".admin-page-frame__description, .admin-operations-inspector, .rm-host-operating-room", fontFamilyIncludes: "Pretendard" as const, fontSizePx: 16, fontWeight: [400, 500], lineHeightPx: 25.6, color: INK };
const TYPO_HOST_WORDMARK = { name: "wordmark", selector: "header.topnav .editorial", fontFamilyIncludes: "Pretendard" as const, fontSizePx: 12, fontWeight: [650], lineHeightPx: 16.8, color: INK };
const TYPO_HOST_PAGE_TITLE = { name: "page-title", selector: "main h1, .rm-host-operating-room h1, .admin-page-frame h1", fontFamilyIncludes: "Pretendard" as const, fontSizePx: 36, fontWeight: [600], lineHeightPx: 41.4, color: INK };
```

Per-id `REQUIRED_VISUAL_AUTHORITY_COVERAGE` objects. Keep the previous name inventory as the `name` field of each object. History-restore interactions always include Back and Forward.

| id | regions (name / selector / expected / tol) | typography | firstViewport (name / selector / visibility) | defaultVisibleItems | interactions |
| --- | --- | --- | --- | --- | --- |
| `admin-today-desktop` | `admin-header` `.admin-shell__header` `ADMIN_HEADER_DESKTOP` 4; `admin-rail` `.admin-shell__nav` `ADMIN_RAIL_DESKTOP` 4; `today-heading` `.admin-page-frame h1` `ADMIN_PAGE_HEADING_DESKTOP` 4; `priority-queue` `.admin-operations-queue` `ADMIN_QUEUE_DESKTOP` 4; `selected-work` `[aria-label="운영 케이스 상세"]` `ADMIN_DOCKET_DESKTOP` 4 | `TYPO_ADMIN_WORDMARK`, `TYPO_ADMIN_PAGE_TITLE`, `TYPO_QUEUE_TITLE`, `TYPO_BODY` | `three-priority-items` `.admin-operations-queue__row` fully-visible; `show-all` `role=button[name=/전체 .*보기/]` fully-visible; `primary-lifecycle-action` `[aria-label="운영 케이스 상세"] button` fully-visible | `{ selector: ".admin-operations-queue__row", count: 3 }` | `select-work` activate `.admin-operations-queue__row` click expectedVisible `[aria-label="운영 케이스 상세"]` expectedUrl `/admin/today?case=case-closing-risk` restoreCanonicalState; `show-all-url` activate `role=button[name=/전체 .*보기/]` click expectedUrl `/admin/today?queue=all`; `back-restores-priority` history-restore activate `role=button[name=/전체 .*보기/]` expectedUrlAfterActivate `/admin/today?queue=all` expectedUrlAfterBack `/admin/today` expectedUrlAfterForward `/admin/today?queue=all` expectedRestoredFocusAfterBack `.admin-operations-queue__row`; `keyboard-work-row` focus-control target `.admin-operations-queue__row` expectedFocused `.admin-operations-queue__row` |
| `admin-clubs-desktop` | header+rail as above; `clubs-heading` `.admin-page-frame h1` `ADMIN_PAGE_HEADING_DESKTOP` 4; `club-finder` `.admin-club-management__finder` `ADMIN_LEDGER_LIST` 2; `club-docket` `.admin-club-management__docket` `ADMIN_LEDGER_DOCKET` 2; `club-detail` `.admin-club-management__docket` `ADMIN_LEDGER_DOCKET` 4 | wordmark, page-title, `row-title` `.admin-club-management__row` 17/600/23.8/`INK`, body-copy | `finder` `.admin-club-management__finder` fully-visible; `first-club-row` `.admin-club-management__row` fully-visible; `selected-club-detail` `.admin-club-management__docket` fully-visible | none | `select-club` activate `.admin-club-management__row` click expectedVisible `.admin-club-management__docket`; `back-restores-club-focus` history-restore activate `.admin-club-management__row` expectedUrlAfterActivate `/admin/clubs` (selected) expectedUrlAfterBack `/admin/clubs` expectedUrlAfterForward selected URL expectedRestoredFocusAfterBack `.admin-club-management__row`; `club-pagination` activate existing next-page control expectedVisible `.admin-club-management__list` |
| `admin-service-desktop` | header+rail; `service-heading` `.admin-page-frame h1` `ADMIN_PAGE_HEADING_DESKTOP` 4; `service-table` `.admin-service-status__table` `ADMIN_SERVICE_TABLE` 2; `service-evidence` `.admin-service-status` sibling evidence region `ADMIN_LEDGER_DOCKET` 4 | wordmark, page-title, row-title, body-copy | `service-table` `.admin-service-status__table` fully-visible; `service-evidence` evidence region fully-visible; `no-command-control` absence of command buttons intersects | none | `keyboard-service-row` focus-control; `select-service-evidence` activate |
| `admin-records-desktop` | header+rail; `records-heading` `.admin-page-frame h1` `ADMIN_PAGE_HEADING_DESKTOP` 4; `audit-list` `.admin-audit__list` `ADMIN_LEDGER_LIST` 2; `audit-detail` `.admin-audit__detail` `ADMIN_LEDGER_DOCKET` 2 | wordmark, page-title, `row-title` `.admin-audit__row-title` 17/600/23.8/`INK`, body-copy | `first-audit-row` `.admin-audit__row` fully-visible; `selected-audit-detail` `.admin-audit__detail` fully-visible | none | `select-audit` activate; `back-restores-audit-focus` history-restore with Back and Forward URLs; `audit-pagination` activate |
| `admin-space-switcher-desktop` | header+rail; `space-trigger` `[aria-label="공간 전환, 현재 플랫폼 운영"]` header cluster 4; `root-space-menu` `role=menu` overlay 4; `first-priority-item` `.admin-operations-queue__row` `ADMIN_FIRST_ROW` equivalent desktop first row 4 | wordmark, `space-trigger-label` trigger 12/650, `menu-label` `role=menuitemradio` 14/500, body-copy | `platform-root-choice` `role=menuitemradio[name=/플랫폼 운영/]` fully-visible; `my-club-root-choice` `role=menuitem[name="내 클럽"]` fully-visible; `first-priority-item` `.admin-operations-queue__row` intersects | none | `keyboard-root-menu` keyboard-menu trigger space-trigger keys Enter/ArrowDown/Escape expectedFocusAfterEscape trigger; `club-subflow` activate `내 클럽` expectedVisible named-club menuitem; `escape-restores-trigger` keyboard-menu Escape |
| `admin-today-mobile` | `mobile-header` `.admin-shell__header` `ADMIN_HEADER_MOBILE` 4; `today-heading` `.admin-page-frame h1` heading box 4; `priority-queue` `.admin-operations-queue` 4; `first-queue-row` `.admin-operations-queue__row` `ADMIN_FIRST_ROW_MOBILE` 2; `mobile-nav` `.admin-mobile-navigation` `ADMIN_NAV_MOBILE` 4 | wordmark, `TYPO_ADMIN_PAGE_TITLE_MOBILE`, queue-title, `mobile-meta` `.admin-operations-queue__mobile-meta` 12/500/16.8/`INK` | `three-priority-items` `.admin-operations-queue__row` fully-visible; `show-all` `전체 .*보기` fully-visible; `mobile-nav` `.admin-mobile-navigation` fully-visible | `{ selector: ".admin-operations-queue__row", count: 3 }` | `select-mobile-work` activate first row expectedUrl `/admin/today?case=case-notification&mode=detail`; `show-all-url` activate; `back-restores-mobile-row` history-restore expectedUrlAfterActivate detail URL expectedUrlAfterBack `/admin/today` expectedUrlAfterForward detail URL expectedRestoredFocusAfterBack first row |
| `admin-work-detail-mobile` | `mobile-header` `ADMIN_BACK_MOBILE` 4 via `role=button[name="목록으로"]` / header; `detail-heading` detail title 4; `detail-body` `[aria-label="운영 케이스 상세"]` `ADMIN_DETAIL_DOCKET_MOBILE` 4; `primary-action` primary lifecycle button 4; `mobile-nav` `ADMIN_NAV_MOBILE` 4 | wordmark, mobile page-title, `detail-title` 20/600/26/`INK`, body-copy | `detail-title` fully-visible; `primary-lifecycle-action` fully-visible; `mobile-nav` fully-visible | none | `primary-action-keyboard-reachable` focus-control |
| `host-prep-desktop`, `host-live-desktop`, `host-closing-desktop` | `host-header` `header.topnav` ledger header 4; `host-nav` `nav[aria-label="호스트 주 메뉴"]` ledger nav 4; `current-meeting` current-meeting header 4; `phase-navigation` phase tabs 4; `phase-status` `.rm-host-operating-room__phase-notice` or status line 4; `primary-next-action` next-action region 4; `phase-panel` `.rm-host-operating-room__phase-panel` `HOST_BODY_DESKTOP` 4; `workbox` `.rm-host-operating-room__workbox-rail` `HOST_WORKBOX_DESKTOP` 4 | `TYPO_HOST_WORDMARK`, `TYPO_HOST_PAGE_TITLE`, `phase-label` phase tab 14/600, `work-item-title` `.rm-host-workbox` item 17/600, body-copy | `current-phase` fully-visible; `primary-next-action` fully-visible; `four-workbox-items` `.rm-host-workbox__items > *` fully-visible; `show-all-workbox` `작업함 모두 보기` fully-visible | `{ selector: ".rm-host-workbox__items > *", count: 4 }` | `phase-roving-tabs` tab-selection; `show-all-workbox-url` activate expectedUrl `workbox=all`; `back-restores-capped-workbox` history-restore expectedUrlAfterActivate with `workbox=all` expectedUrlAfterBack without it expectedUrlAfterForward with it; plus phase-specific `prep-retry` activate / `attendance-undo-keyboard-reachable` focus-control / `closing-destination` activate |
| `host-meetings-desktop` | header/nav `HOST_MEETINGS_*`; `meetings-heading` `main h1` 4; `meeting-tabs` tablist 4; `meeting-ledger` `main` `HOST_MEETINGS_MAIN` 4 | wordmark, page-title, `tab-label` 14/600, row-title, body-copy | `meeting-tabs` fully-visible; `first-meeting-row` fully-visible; `status` intersects | none | `meeting-view-tab` tab-selection; `meeting-status-tab` tab-selection; `meeting-pagination` activate |
| `host-people-desktop` | header/nav `HOST_PEOPLE_*`; `people-heading` `main h1` 4; `pending-review` `[aria-label="가입 승인 대기"]` 4; `member-table` `main` `HOST_PEOPLE_MAIN` 4 | wordmark, page-title, row-title, body-copy | `pending-review` fully-visible; `first-member-row` fully-visible; `member-status` intersects | none | `select-member` activate; `back-restores-member-focus` history-restore Back+Forward; `member-pagination` activate |
| `host-records-desktop` | header/nav `HOST_RECORDS_*`; `records-heading` `main h1` 4; `record-ledger` `main` `HOST_RECORDS_MAIN` 4; `closing-link` closing record link 4 | wordmark, page-title, row-title, body-copy | `first-record-row` fully-visible; `closing-link` fully-visible | none | `open-closing-record` activate; `back-restores-record-focus` history-restore Back+Forward; `record-pagination` activate |
| `host-settings-desktop` | header/nav `HOST_SETTINGS_*`; `settings-heading` `main h1` 4; `invitation-region` invitation section 4; `club-settings` `main` `HOST_SETTINGS_MAIN` 4 | wordmark, page-title, section-title, body-copy | `invitation-action` fully-visible; `settings-status` intersects | none | `open-invitation-form` activate; `escape-restores-invitation-focus` keyboard-menu Escape |
| `host-schedule-review-desktop` | header/nav `HOST_SCHEDULE_REVIEW_*`; `review-heading` `main h1` 4; `recipient-region` recipient region 4; `preview-region` preview region `HOST_SCHEDULE_REVIEW_MAIN` 4 | wordmark, page-title, recipient-label, preview-copy | `recipient-selection` fully-visible; `preview-action` fully-visible; `preview-confirmation` fully-visible | none | `preview-notification-post` prepared-request `preview-schedule-notification` POST `/api/bff/api/host/notifications/manual/preview` forbiddenEffectKinds confirm/send |
| `host-prep-mobile`, `host-live-mobile` | `mobile-header` `[data-club-shell-region="mobile-context"]`; `current-meeting`; phase tabs/status/next-action/panel/workbox using `HOST_PREP_MOBILE_MAIN` or `HOST_LIVE_MOBILE_MAIN`; `mobile-nav` `HOST_MOBILE_NAV` 4; live also `attendance-board` `HOST_LIVE_MOBILE_BOARD` 4 | wordmark, mobile page-title 28/600/33.6, phase-label, work-item-title, body-copy | `primary-next-action` fully-visible; `three-workbox-items` fully-visible; `show-all-workbox` fully-visible; `mobile-nav` fully-visible; live adds `attendance-board` and `undo-action` fully-visible | `{ selector: ".rm-host-workbox__items > *", count: 3 }` | same workbox history-restore Back+Forward; plus `prep-retry` / `attendance-undo-keyboard-reachable` |
| `host-person-mobile` | `mobile-header` `HOST_PERSON_HEADER` 4; `person-heading` heading 4; `person-status` status 4; `person-history` history `HOST_PERSON_MAIN` 4; `mobile-nav` `HOST_MOBILE_NAV` 4 | wordmark, mobile page-title, status-label, history-copy | `person-status` fully-visible; `first-history-row` fully-visible; `mobile-nav` fully-visible | none | `person-history-pagination` activate; `person-status-keyboard-reachable` focus-control |

For rows containing “plus phase-specific,” the registry expands the named per-id suffix into the final exact interaction object set. Host desktop header/nav geometry uses the per-ledger constants from `approved-host-ledgers.ct.tsx` (`HOST_MEETINGS_*` through `HOST_SCHEDULE_REVIEW_*`), not a single meetings box on every Host desktop id.

`parseVisualAuthoritySelection` returns all 18 ids when the variable is absent or empty, but throws for blank members, duplicates, or any id outside the manifest. It must never turn a malformed non-empty filter into an all-skipped successful run.

Use these routes exactly:

| ids | actual route |
| --- | --- |
| `admin-today-desktop`, `admin-today-mobile` | `/admin/today` |
| `admin-work-detail-mobile` | `/admin/today?case=case-notification&mode=detail` |
| `admin-clubs-desktop` | `/admin/clubs` |
| `admin-service-desktop` | `/admin/health` |
| `admin-records-desktop` | `/admin/audit` |
| `admin-space-switcher-desktop` | `/admin/today`, then open the space switcher |
| `host-prep-desktop`, `host-prep-mobile` | `/clubs/visual-authority/app/host?phase=prep` |
| `host-live-desktop`, `host-live-mobile` | `/clubs/visual-authority/app/host?phase=live` |
| `host-closing-desktop` | `/clubs/visual-authority/app/host?phase=closing` |
| `host-meetings-desktop` | `/clubs/visual-authority/app/host/sessions` |
| `host-people-desktop` | `/clubs/visual-authority/app/host/people` |
| `host-records-desktop` | `/clubs/visual-authority/app/host/records` |
| `host-settings-desktop` | `/clubs/visual-authority/app/host/settings#invitations` |
| `host-schedule-review-desktop` | `/clubs/visual-authority/app/host/sessions/session-28/schedule-review` |
| `host-person-mobile` | `/clubs/visual-authority/app/host/people/membership-sky` |

Move the existing approved geometry constants from the four CT files into `approved-route-geometry.ts`, then import that single test-only source from both the retained CT assertions and the scenario registry. Use the existing values such as Admin header `0,0,1672,86`, Admin mobile first row `20,220,350,94`, Host desktop body `36,319,1465,665`, Host desktop workbox `988,319,513,665`, Host mobile nav `0,768,390,64`, and the per-ledger header/nav/main values already measured in `approved-host-ledgers.ct.tsx`. Do not make production code import this module.

- [ ] **Step 4: Add strict viewport capture**

```ts
export async function captureApprovedViewportComparison(input: {
  page: Page;
  testInfo: TestInfo;
  entry: ApprovedMockupEntry;
  regions: readonly ApprovedRegion[];
  results: ApprovedRouteAssertionResults;
}): Promise<ApprovedComparisonReport> {
  await input.page.evaluate(() => document.fonts.ready);
  await input.page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  const candidatePng = await input.page.screenshot({ animations: "disabled", fullPage: false });
  return compareAndWriteApprovedArtifacts({ ...input, candidatePng });
}
```

Extract the shared comparison/write body from `captureApprovedComparison` into `compareAndWriteApprovedArtifacts`. Both locator and viewport callers use the same hash, resize, diff, and artifact writer. The actual-route caller records `schemaVersion`, canonical image, browser/Playwright/Node/pnpm versions, loaded Pretendard faces, viewport, DPR, geometry, typography, first-viewport visibility, default-visible count, overflow, interaction, request audit, and `mask: null`.

`compareAndWriteApprovedArtifacts` writes `<id>-reference.png`, `<id>-candidate.png`, `<id>-overlay.png`, `<id>-diff.png`, and `<id>-report.json` before `assertApprovedRouteReport(report)` throws for any failed sub-result. Add schema tests that delete each required report field in turn and prove validation fails closed. A wrong geometry or typography implementation must still leave all five diagnostic artifacts.

- [ ] **Step 5: Implement route settle, geometry, typography, and first-viewport checks**

`runActualRouteAuthority({ page, testInfo, scenario, installFixtures })` performs this order: set viewport; install the catch-all BFF request audit; call `installFixtures(page, scenario.fixtureKey, requestAudit)` where `installFixtures` is `(page, fixtureKey, requestAudit) => Promise<void>`; navigate; verify actor and club scope before protected data resolves; resolve and run `APPROVED_ROUTE_PREPARATIONS[scenario.preparationKey]`; wait for `document.fonts.ready`, the scenario root, and the scenario-specific ready selector; wait for `[aria-busy="true"]` to disappear; assert pathname/search/hash; measure every required region and typography entry including computed color; measure required document order and full/intersection visibility; count only rendered visible default items; measure overflow; execute every declarative `scenario.interactions` entry by its discriminant and restore the registered canonical route/preparation state after each; for `history-restore`, activate, assert `expectedUrlAfterActivate`, go Back and assert `expectedUrlAfterBack` plus optional restored focus, then go Forward and assert `expectedUrlAfterForward` equals the activated URL/state plus optional restored focus; consume a `prepared-request` result from the single preparation execution rather than clicking twice; reassert the canonical state; capture and write all artifacts; assert no unmatched/effecting request; then evaluate the report's strict verdict. Callers never supply independent preparation or interaction arrays. Specs must not close over a different installer arity.

```ts
const intersectsViewport = await locator.evaluate((element) => {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
});
expect(intersectsViewport, `${scenario.id}:${item.name}`).toBe(true);
```

- [ ] **Step 6: Expand invalidation dependencies without an empty-set escape**

Convert `dependencyPaths` and `ownerTest` to repository-relative paths. `referencePath` remains unchanged for file loading, while a derived repository path maps each approved PNG to only its own id. Exact universal inputs map all 18 ids: root and frontend `package.json`, `pnpm-lock.yaml`, `front/playwright.config.ts`, `.github/workflows/ci.yml`, `front/src/styles/globals.css`, `design/system/src/styles/tokens.css`, the manifest/contract/scenario/harness/request-audit modules, and both visual-authority Docker runner modules.

Use bounded role partitions: `front/features/platform-admin/**`, Admin route/app shells, Admin actual-route spec/fixture map all seven Admin ids; `front/features/host/**`, Host route/app shells, Host actual-route spec/fixture map all eleven Host ids; shared UI/auth style changes map all 18. Preserve narrower exact mappings where they reduce work, but the role partition is the fail-closed fallback. `list-affected-visual-authorities.ts` exits nonzero when a repository path inside these visual-sensitive partitions maps to no id. An unrelated `server/**` path still returns an empty set successfully.

Add a table-driven test containing every production, fixture, harness, runner, package/config/lockfile, and approved-reference path named in Tasks 1-9. Assert each maps to the expected non-empty role/id set. Also assert every non-empty filtered id list runs at least one test and malformed filters fail rather than reporting all skipped.

- [ ] **Step 7: Run focused GREEN checks**

Run: `corepack pnpm --dir front exec vitest run tests/e2e/support/approved-route-scenarios.test.ts tests/e2e/support/approved-route-request-audit.test.ts tests/unit/approved-mockup-contract.test.ts`

Expected: PASS with exactly 18 ids and no ratio bypass.

- [ ] **Step 8: Commit**

```bash
git add front/tests/e2e/support/approved-route-scenarios.ts front/tests/e2e/support/approved-route-harness.ts front/tests/e2e/support/approved-route-scenarios.test.ts front/tests/e2e/support/approved-route-request-audit.ts front/tests/e2e/support/approved-route-request-audit.test.ts front/tests/e2e/support/approved-route-geometry.ts front/tests/e2e/support/approved-mockup-manifest.ts front/tests/e2e/support/approved-mockup-contract.ts front/tests/unit/approved-mockup-contract.test.ts front/features/platform-admin/route/admin-shell-layout.ct.tsx front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx front/features/host/ui/approved-host-ledgers.ct.tsx
git commit -m "test: register actual-route visual authorities"
```

---

### Task 3: Converge Admin Today Desktop and Mobile

**Files:**

- Create: `front/tests/e2e/support/admin-approved-route-fixtures.ts`
- Create: `front/tests/e2e/admin-approved-routes.spec.ts`
- Create: `front/features/platform-admin/ui/admin-today.css`
- Modify: `front/features/platform-admin/model/platform-admin-operations-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-operations-model.test.ts`
- Modify: `front/features/platform-admin/route/use-admin-today-controller.ts`
- Modify: `front/features/platform-admin/route/use-admin-today-controller.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`

**Interfaces:**

- Produces: `AdminQueueDisclosureMode = "priority" | "all"`.
- Adds: `queueDisclosure: AdminQueueDisclosureMode` to `AdminOperationsSearchState`, its parser, serializer, and input contract.
- Produces: `AdminOperationsQueue` props `visibleLimit`, `expanded`, `onShowAll`.
- Produces: `installAdminApprovedRoutes(page, fixtureKey, requestAudit)` matching the shared three-argument installer signature.
- Produces: actual-route strict tests for `admin-today-desktop`, `admin-today-mobile`, `admin-work-detail-mobile`.

- [ ] **Step 1: Write RED model and component tests**

```ts
it("uses three priority rows until queue=all is present", () => {
  expect(parseAdminOperationsSearch(new URLSearchParams("case=case-1")).queueDisclosure)
    .toBe("priority");
  expect(parseAdminOperationsSearch(new URLSearchParams("queue=all")).queueDisclosure)
    .toBe("all");
  expect(serializeAdminOperationsSearch({
    caseId: "case-1",
    filter: {},
    queueDisclosure: "all",
  }).toString()).toBe("case=case-1&queue=all");
});

it("shows three rows and an explicit all-items action by default", async () => {
  render(<AdminOperationsQueue {...propsWithTenItems} visibleLimit={3} expanded={false} onShowAll={onShowAll} />);
  expect(screen.getAllByRole("button", { name: /현재 상태/ })).toHaveLength(3);
  await userEvent.click(screen.getByRole("button", { name: "전체 10건 보기" }));
  expect(onShowAll).toHaveBeenCalledOnce();
});
```

Add a mobile assertion that `.admin-operations-queue__title` has a dedicated element between locator and severity, and that returning from detail restores focus to the selected row.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-model.test.ts features/platform-admin/route/use-admin-today-controller.test.tsx features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operation-mobile-detail.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: FAIL because disclosure parsing/props and the title-owned grid element do not exist.

- [ ] **Step 3: Implement URL-backed disclosure and three-item priority slice**

```ts
export const ADMIN_TODAY_PRIORITY_LIMIT = 3;

// In parseAdminOperationsSearch:
queueDisclosure: params.get("queue") === "all" ? "all" : "priority";

// In serializeAdminOperationsSearch:
if (state.queueDisclosure === "all") params.set("queue", "all");
```

`useAdminTodayController.writeSearch` includes `queueDisclosure: next.queueDisclosure ?? searchState.queueDisclosure` in the existing allowlisted serializer. It exposes `queueExpanded` and `showAllQueue()`; `showAllQueue()` calls `writeSearch({ queueDisclosure: "all" })`. Case selection, work-view/filter updates, selection normalization, and Browser Back must preserve or restore this value through the same serializer instead of copying arbitrary query keys.

`AdminOperationsQueue` renders `items` when expanded and `items.slice(0, visibleLimit)` otherwise. The action label is `전체 ${items.length}건 보기` only when the loaded set is authoritative; when `hasNextPage` is true use `전체 업무 보기`. Expanded mode reveals the loaded page and retains the existing pagination/load-more control until `nextCursor` is null; it must not imply that unfetched rows are already visible.

- [ ] **Step 4: Give every queue datum an explicit grid owner**

```tsx
<span className="admin-operations-queue__headline">
  <span className="admin-operations-queue__badge" aria-hidden="true">!</span>
  {item.locatorLabel ? <span className="admin-operations-queue__locator">{item.locatorLabel}</span> : null}
  <strong className="admin-operations-queue__title admin-operation-wrap">{item.summary.title}</strong>
  <span className="admin-operations-queue__severity">{item.severityLabel}</span>
  <span className="admin-operations-queue__age">{item.ageLabel}</span>
</span>
```

Move all `.admin-today-*`, `.admin-operations-queue*`, `.admin-operations-inspector*`, and `.admin-operation-mobile-detail*` rules into `admin-today.css`. Import it once from `admin-shell-layout.tsx`. Desktop uses explicit badge/locator/title/severity/age columns. At 390px, use `grid-template-columns: 56px minmax(0, 1fr) 44px`: the warning badge owns the left column, title plus one `mobileMetaLabel` owns the center, and the chevron owns the right. Hide the redundant desktop locator/severity/age/context fragments on mobile. The center title keeps `min-width: 12rem`, wraps at words, and the row stays within the approved `94px` height. Do not leave duplicate selectors in `admin-editorial-ledger.css`.

- [ ] **Step 5: Add deterministic Admin actual-route fixtures**

Reuse `routeAdminEditorialLedgerShell` and `routeAdminTodayCases` from `admin-editorial-ledger-e2e-fixtures.ts`, but add a fixture builder that returns exactly ten public-safe operation cases ordered by existing domain priority. The first three represent notification failure, closing risk, and AI job failure; ids remain `case-notification`, `case-closing-risk`, and `case-ai-job`. Install the shared request audit before these specific handlers. No fixture value may contain a real club, member, email, or deployment identifier.

- [ ] **Step 6: Add the three actual-route RED tests**

```ts
for (const id of ["admin-today-desktop", "admin-today-mobile", "admin-work-detail-mobile"] as const) {
  test(`${id} matches its approved actual route`, async ({ page }, testInfo) => {
    test.skip(!visualAuthoritySelected(id), `not affected: ${id}`);
    await runActualRouteAuthority({
      page,
      testInfo,
      scenario: visualAuthorityScenario(id),
      installFixtures: (page, fixtureKey, requestAudit) =>
        installAdminApprovedRoutes(page, fixtureKey, requestAudit),
    });
  });
}
```

Before capture, assert three visible queue rows in list mode, no internal queue scrollbar, a visible `전체 업무 보기`, title width at least `192px` on 390px, and one primary lifecycle action in detail mode.

- [ ] **Step 7: Run RED, tune only owned structure/CSS, then reach strict GREEN**

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/admin-approved-routes.spec.ts --project=chromium --grep 'admin-(today|work-detail)'`

Expected before tuning: FAIL with actual-route mismatch/geometry evidence.

Repeat after the minimal component/CSS changes until all three scenarios PASS strict 0.02, their report JSON contains `mask: null`, and no exception field exists.

- [ ] **Step 8: Run regression and commit**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-model.test.ts features/platform-admin/route/use-admin-today-controller.test.tsx features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operation-mobile-detail.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

After the three actual-route scenarios are strict GREEN, run `corepack pnpm --dir front test:ct:update:docker`. Inspect every changed PNG under `front/__screenshots__/features/platform-admin/ui/admin-editorial-ledger.ct.tsx/`; leave every unrelated or not-yet-authority-backed PNG untouched, independently approve each intentional diff, and record its exact filename. Then run `corepack pnpm --dir front test:ct:docker`. Stage each approved PNG by its full filename in a separate `git add -- <exact-png-path>` command; never stage the screenshot directory.

```bash
git add front/tests/e2e/support/admin-approved-route-fixtures.ts front/tests/e2e/admin-approved-routes.spec.ts front/features/platform-admin/model/platform-admin-operations-model.ts front/features/platform-admin/model/platform-admin-operations-model.test.ts front/features/platform-admin/route/use-admin-today-controller.ts front/features/platform-admin/route/use-admin-today-controller.test.tsx front/features/platform-admin/ui/admin-operations-queue.tsx front/features/platform-admin/ui/admin-operations-queue.test.tsx front/features/platform-admin/ui/admin-operation-mobile-detail.tsx front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-today-ledger.test.tsx front/features/platform-admin/ui/admin-today.css front/features/platform-admin/ui/admin-editorial-ledger.css front/features/platform-admin/route/admin-shell-layout.tsx
git commit -m "feat: converge admin today actual routes"
```

---

### Task 4: Converge Admin Shell and Space Switcher

**Files:**

- Modify: `front/tests/e2e/support/admin-approved-route-fixtures.ts`
- Modify: `front/tests/e2e/admin-approved-routes.spec.ts`
- Create: `front/tests/e2e/approved-route-auth-scope.spec.ts`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-shell.css`
- Modify: `front/shared/ui/global-space-switcher.tsx`
- Modify: `front/shared/ui/global-space-switcher.test.tsx`

**Interfaces:**

- Produces: actual-route strict test for `admin-space-switcher-desktop`.
- Produces: focused auth/scope coverage proving available-space and capability boundaries independently of the visual comparison.
- Preserves: platform/member-space transition safety and current route focus restoration.

- [ ] **Step 1: Add RED shell and switcher assertions**

Add an authenticated public-safe club named `샘플 독서모임` to the fixture auth response. The actual-route test opens the trigger named `공간 전환, 현재 플랫폼 운영` and captures the approved **root** menu. The root hierarchy is fixed: platform is a selected `menuitemradio`, and the club entry point is the `내 클럽` menu item. A named club is not flattened into this root.

```ts
await page.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }).click();
await expect(page.getByRole("menu")).toBeVisible();
await expect(page.getByRole("menuitemradio", { name: /플랫폼 운영/ })).toHaveAttribute("aria-checked", "true");
await expect(page.getByRole("menuitem", { name: "내 클럽" })).toBeVisible();
await expect(page.getByRole("menuitem", { name: /샘플 독서모임/ })).toHaveCount(0);
```

After the root capture, run a separate non-capture interaction: enter `내 클럽`, assert `샘플 독서모임` and only the perspectives granted by `availableSpaces`, then return with Escape/Back and prove focus returns to the root trigger.

The authority test calls `test.skip(!visualAuthoritySelected("admin-space-switcher-desktop"), "not affected: admin-space-switcher-desktop")` before fixture setup.

- [ ] **Step 2: Run and confirm RED**

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/admin-approved-routes.spec.ts --project=chromium --grep admin-space-switcher-desktop`

Expected: FAIL on current shell/menu geometry or strict ratio.

- [ ] **Step 3: Implement the approved shell ownership**

Keep the existing header DOM order and security behavior. Adjust only `admin-shell.css` and the minimal wrapper classes needed for the approved wordmark, space trigger, breadcrumb, account control, 260px rail, 86px desktop header, 70px mobile header, and overlay stacking. The menu must not cover the first priority item and must close on Escape with focus returned to the trigger.

Add focused cases in `approved-route-auth-scope.spec.ts` proving that Admin switcher options are derived only from `availableSpaces`, and that an authenticated user without the platform-admin capability neither sees the Admin option nor issues a protected Admin data request. These cases use the shared request-audit helper and do not create visual receipts.

- [ ] **Step 4: Reach GREEN and commit**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-shell-layout.test.tsx shared/ui/global-space-switcher.test.tsx`

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/admin-approved-routes.spec.ts --project=chromium --grep admin-space-switcher-desktop`

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/approved-route-auth-scope.spec.ts --project=chromium --grep admin`

Only after both actual-route checks are GREEN, run `corepack pnpm --dir front test:ct:update:docker`. Inspect every changed PNG under `front/__screenshots__/features/platform-admin/route/admin-shell-layout.ct.tsx/`; leave unrelated changes untouched, confirm the corresponding already-GREEN actual-route ids and immutable approved-reference hashes, independently approve each intentional diff, and record each exact filename. Then run `corepack pnpm --dir front test:ct:docker`. Stage approved PNGs individually with `git add -- <exact-png-path>`; never stage the screenshot directory.

```bash
git add front/tests/e2e/support/admin-approved-route-fixtures.ts front/tests/e2e/admin-approved-routes.spec.ts front/tests/e2e/approved-route-auth-scope.spec.ts front/features/platform-admin/route/admin-shell-layout.tsx front/features/platform-admin/route/admin-shell-layout.test.tsx front/features/platform-admin/ui/admin-shell.css front/shared/ui/global-space-switcher.tsx front/shared/ui/global-space-switcher.test.tsx
git commit -m "feat: align admin shell visual authority"
```

---

### Task 5: Converge Admin Clubs, Health, and Audit Routes

**Files:**

- Modify: `front/tests/e2e/support/admin-approved-route-fixtures.ts`
- Modify: `front/tests/e2e/admin-approved-routes.spec.ts`
- Modify: `front/features/platform-admin/ui/admin-club-management.css`
- Modify: `front/features/platform-admin/ui/admin-service-status.css`
- Modify: `front/features/platform-admin/ui/admin-processing-records.css`
- Modify: `front/features/platform-admin/ui/admin-clubs-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-clubs-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
- Modify only if its named route assertion fails: `front/features/platform-admin/route/admin-clubs-route.tsx`, `front/features/platform-admin/route/admin-health-route.tsx`, `front/features/platform-admin/route/admin-audit-route.tsx`
- Modify only with the matching production route: `front/features/platform-admin/route/admin-clubs-route.test.tsx`, `front/features/platform-admin/route/admin-health-route.test.tsx`, `front/features/platform-admin/route/admin-audit-route.test.tsx`

**Interfaces:**

- Produces: strict actual-route tests for `admin-clubs-desktop`, `admin-service-desktop`, `admin-records-desktop`.
- Consumes: existing `routeAdminClubsLedger`, `routeAdminHealthSnapshot`, `routeAdminAuditLedger` BFF helpers.

- [ ] **Step 1: Add the three RED authority tests**

Each test installs `routeAdminEditorialLedgerShell` with the exact route capability plus its existing deterministic ledger helper. Assert the approved row/detail hierarchy before capture:

```ts
await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
await expect(page.locator(".admin-shell__nav")).toBeVisible();
await expect(page.locator(scenario.regions[2].selector)).toBeVisible();
```

Clubs must show finder and docket; Health must show service table/evidence without command controls; Audit must show list and selected detail.

Each authority test calls `test.skip(!visualAuthoritySelected(id), "not affected: " + id)` before fixture setup.

- [ ] **Step 2: Run and confirm RED**

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/admin-approved-routes.spec.ts --project=chromium --grep 'admin-(clubs|service|records)-desktop'`

Expected: one or more scenarios FAIL strict pixel/geometry.

- [ ] **Step 3: Tune the three route-owned styles without changing domain behavior**

Use the shared shell and page primitives from Tasks 3–4. Keep controls, pagination, read-only Health semantics, Audit URL-owned detail, and Clubs focus-return behavior. Remove route-specific internal scroll where it changes the approved first viewport; excess rows continue through existing pagination/detail paths.

- [ ] **Step 4: Run focused route regression**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-clubs-ledger.test.tsx features/platform-admin/ui/admin-health-grid.test.tsx features/platform-admin/ui/admin-audit-ledger.test.tsx features/platform-admin/route/admin-clubs-route.test.tsx features/platform-admin/route/admin-health-route.test.tsx features/platform-admin/route/admin-audit-route.test.tsx`

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/admin-approved-routes.spec.ts --project=chromium`

Expected: Admin actual-route authority `7/7` PASS.

- [ ] **Step 5: Commit**

Only after all three actual routes are strict GREEN, run `corepack pnpm --dir front test:ct:update:docker`. Inspect every changed PNG under `front/__screenshots__/features/platform-admin/ui/admin-editorial-ledger.ct.tsx/`; leave unrelated changes untouched, verify its corresponding actual-route id is already strict GREEN, independently approve each intentional diff, and rerun `corepack pnpm --dir front test:ct:docker`. Stage each approved PNG individually with `git add -- <exact-png-path>`; never stage the directory. Reference PNGs remain immutable.

```bash
git add front/tests/e2e/support/admin-approved-route-fixtures.ts front/tests/e2e/admin-approved-routes.spec.ts front/features/platform-admin/ui/admin-club-management.css front/features/platform-admin/ui/admin-service-status.css front/features/platform-admin/ui/admin-processing-records.css front/features/platform-admin/ui/admin-clubs-ledger.tsx front/features/platform-admin/ui/admin-clubs-ledger.test.tsx front/features/platform-admin/ui/admin-health-grid.tsx front/features/platform-admin/ui/admin-health-grid.test.tsx front/features/platform-admin/ui/admin-audit-ledger.tsx front/features/platform-admin/ui/admin-audit-ledger.test.tsx
# If a named route and its matching test actually changed, add those exact two files separately after inspecting `git status --short`.
git commit -m "feat: converge admin ledger actual routes"
```

---

### Task 6: Bound Host Workbox Density and Error Disclosure

**Files:**

- Create: `front/tests/e2e/support/host-approved-route-fixtures.ts`
- Modify: `front/tests/e2e/approved-route-auth-scope.spec.ts`
- Modify: `front/features/host/model/host-workbox-model.ts`
- Modify: `front/features/host/model/host-workbox-model.test.ts`
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Modify: `front/features/host/route/host-dashboard-route.test.tsx`
- Modify: `front/features/host/ui/workbox/host-workbox.tsx`
- Modify: `front/features/host/ui/workbox/host-workbox.test.tsx`
- Modify: `front/features/host/ui/workbox/host-workbox.ct.tsx`
- Modify: `front/features/host/ui/workbox/host-work-item.tsx`
- Modify: `front/features/host/ui/workbox/host-workbox.css`

**Interfaces:**

- Produces: `HostWorkboxDisclosure = { visibleItems, hiddenCount, hasMore, expanded }`.
- Produces: `buildHostWorkboxDisclosure(view, { limit, expanded })`.
- Produces: URL-backed `workbox=all` behavior owned by `HostDashboardRoute`.
- Produces: source warnings passed to `HostOperatingRoomPage.optionalFailureActions` instead of a large duplicate panel in the rail.
- Produces: focused Host auth/club-scope coverage and a request audit that fails on unmatched BFF calls or effecting writes.
- Produces: `installHostApprovedRoutes(page, fixtureKey, requestAudit, options?)`. Callers wrap it as `installFixtures: (page, fixtureKey, requestAudit) => installHostApprovedRoutes(page, fixtureKey, requestAudit, options)`.

- [ ] **Step 1: Write RED model/UI/route tests**

```ts
it("shows four desktop items or three mobile items until explicitly expanded", () => {
  expect(buildHostWorkboxDisclosure(viewWithTwelveItems, { limit: 4, expanded: false }))
    .toMatchObject({ visibleItems: expect.any(Array), hiddenCount: 8, hasMore: true, expanded: false });
  expect(buildHostWorkboxDisclosure(viewWithTwelveItems, { limit: 3, expanded: false }).visibleItems)
    .toHaveLength(3);
});

it("keeps the source order and exposes all loaded items when expanded", () => {
  const result = buildHostWorkboxDisclosure(viewWithTwelveItems, { limit: 4, expanded: true });
  expect(result.visibleItems.map((item) => item.key))
    .toEqual(viewWithTwelveItems.items.map((item) => item.key));
});
```

Add a route test that `workbox=all` survives tab changes and Browser Back restores the capped view.

- [ ] **Step 2: Run and confirm RED**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-workbox-model.test.ts features/host/route/host-dashboard-route.test.tsx features/host/ui/workbox/host-workbox.test.tsx`

Expected: FAIL because disclosure and URL-backed expansion do not exist.

- [ ] **Step 3: Implement presentation-only disclosure**

```ts
export function buildHostWorkboxDisclosure(
  view: HostWorkboxView,
  options: { limit: 3 | 4; expanded: boolean },
): HostWorkboxDisclosure {
  const visibleItems = options.expanded ? view.items : view.items.slice(0, options.limit);
  return {
    visibleItems,
    hiddenCount: Math.max(0, view.items.length - visibleItems.length),
    hasMore: visibleItems.length < view.items.length || view.nextCursor !== null,
    expanded: options.expanded,
  };
}
```

Use `useOperatingRoomCompactViewport()` to choose three or four. `HostDashboardRoute` reads `workbox=all`, updates only that query key when `작업함 모두 보기` is activated, and preserves `phase`. Keep API priority order and cursor handling unchanged.

`HostWorkbox` receives the computed `HostWorkboxDisclosure` and an `onShowAll` callback; it renders `disclosure.visibleItems`, exposes the explicit disclosure label, and never reconstructs the cap independently. Expanded mode exposes every **loaded** item in source order, preserves `nextCursor`, and keeps the existing continuation/load-more path until `nextCursor === null`; `모두 보기` must not imply that unfetched pages have already loaded.

- [ ] **Step 4: Move partial warnings into the compact state-summary channel**

Convert each `workboxView.partialWarnings` entry into an `optionalFailureAction` with its source label and the existing workbox refetch callback. `HostWorkbox` receives `showPartialWarnings={false}` on the dashboard so warnings are announced once below the next action. A full workbox query failure still replaces the workbox action region with its retry control.

- [ ] **Step 5: Build the Host public-safe actual-route fixture module**

Reuse `routeHostEditorShell(page, "visual-authority")` for auth/club shell. Register deterministic GET responses for operating-room current, session detail, closing status, record attention, club operations, notification health, workbox, members, invitations, meeting list, record list, settings/history, schedule-review recipients, and person detail. Derive response values from the existing typed fixtures in `front/features/host/ui/approved-host-ledgers.fixtures.tsx`, `front/features/host/ui/meeting-workspace/host-focus-deck.fixtures.ts`, and `front/tests/unit/__fixtures__/host-person-detail.json`; convert them to the API response types imported from `host-contracts` and `host-workbox-contracts`. Use ids `session-28`, `membership-sky`, and club slug `visual-authority` consistently.

Install the shared request audit before route fixtures. Every expected handler validates method, `clubSlug=visual-authority`, the authenticated membership/session context represented by the fixture, and its request schema; every unmatched `/api/bff/**` request fails the test. Add focused cases in `approved-route-auth-scope.spec.ts` proving that Host requests carry `clubSlug=visual-authority`, a user without the Host perspective is redirected to a safe route in the same club, a URL/auth club mismatch fails closed, and no protected Host data request occurs before authorization completes.

- [ ] **Step 6: Run GREEN and commit**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-workbox-model.test.ts features/host/route/host-dashboard-route.test.tsx features/host/ui/workbox/host-workbox.test.tsx`

Run: `corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/workbox/host-workbox.ct.tsx --project=chromium`

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/approved-route-auth-scope.spec.ts --project=chromium --grep host`

Task 6 GREEN is those host-workbox-model / host-dashboard-route / host-workbox unit-route tests, Host auth/scope E2E, and workbox CT semantic assertions that do not require snapshot refresh. Do not run `corepack pnpm --dir front test:ct:update:docker`. Do not stage or commit workbox CT snapshots. If workbox CT screenshots fail after the density change, leave tracked snapshots untouched and carry that drift to Task 7.

```bash
git add front/tests/e2e/support/host-approved-route-fixtures.ts front/tests/e2e/approved-route-auth-scope.spec.ts front/features/host/model/host-workbox-model.ts front/features/host/model/host-workbox-model.test.ts front/features/host/route/host-dashboard-route.tsx front/features/host/route/host-dashboard-route.test.tsx front/features/host/ui/workbox/host-workbox.tsx front/features/host/ui/workbox/host-workbox.test.tsx front/features/host/ui/workbox/host-workbox.ct.tsx front/features/host/ui/workbox/host-work-item.tsx front/features/host/ui/workbox/host-workbox.css
git commit -m "feat: bound host workbox first-viewport density"
```

---

### Task 7: Converge Host Operating Room Desktop and Mobile

**Files:**

- Create: `front/tests/e2e/host-approved-routes.spec.ts`
- Modify: `front/tests/e2e/support/host-approved-route-fixtures.ts`
- Modify: `front/features/host/ui/operating-room/host-operating-room-page.tsx`
- Modify: `front/features/host/ui/operating-room/operating-room.css`
- Modify: `front/features/host/ui/operating-room/current-meeting-header.test.tsx`
- Modify: `front/features/host/ui/operating-room/host-next-action.test.tsx`
- Modify: `front/features/host/ui/operating-room/meeting-phase-tabs.test.tsx`
- Modify: `front/features/host/ui/operating-room/preparation-ledger.test.tsx`
- Modify: `front/features/host/ui/operating-room/phase-status-ledger.test.tsx`
- Modify: `front/features/host/ui/shell/host-shell.css`
- Modify: `front/features/host/route/host-dashboard-route.tsx` only for composition defects exposed by actual-route tests

**Interfaces:**

- Produces: strict actual-route tests for `host-prep-desktop`, `host-live-desktop`, `host-closing-desktop`, `host-prep-mobile`, `host-live-mobile`.
- Preserves: attendance write/undo, phase normalization, closing authority, and next-action destination behavior.

- [ ] **Step 1: Add five RED actual-route tests**

```ts
for (const id of [
  "host-prep-desktop",
  "host-live-desktop",
  "host-closing-desktop",
  "host-prep-mobile",
  "host-live-mobile",
] as const) {
  test(`${id} matches its approved actual route`, async ({ page }, testInfo) => {
    test.skip(!visualAuthoritySelected(id), `not affected: ${id}`);
    await runActualRouteAuthority({
      page,
      testInfo,
      scenario: visualAuthorityScenario(id),
      installFixtures: (page, fixtureKey, requestAudit) =>
        installHostApprovedRoutes(page, fixtureKey, requestAudit, { workboxItems: 12 }),
    });
  });
}
```

Assert document order, desktop workbox count four, mobile count three, visible `작업함 모두 보기`, no giant partial panel before next action, and phase notice directly below phase navigation. For live mobile, also assert the compact attendance board and undo action stay above bottom navigation.

The fixture request audit must have no unmatched `/api/bff/**` requests. After each visual interaction it also asserts zero requests to attendance write/undo, notification confirm/send, invitation creation, settings mutation, session close, or any other effecting endpoint unless that scenario explicitly owns and asserts the interaction. These visual tests may prepare read state but must not silently exercise writes.

- [ ] **Step 2: Run and confirm RED**

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/host-approved-routes.spec.ts --project=chromium --grep 'host-(prep|live|closing)'`

Expected: FAIL on current actual-route first viewport and strict ratio.

- [ ] **Step 3: Implement the approved semantic and visual order**

Keep the DOM order in `HostOperatingRoomPage` as current meeting, phase navigation, phase status, body primary next action, compact failure/recovery summary, preparation/live/closing panel, workbox. CSS may place the workbox beside primary content only at the approved desktop breakpoint. It must not reorder DOM with `order` or grid-area values that change reading order.

Use the existing `BODY_DESKTOP_GEOMETRY`, `WORKBOX_DESKTOP_GEOMETRY`, `PREP_MOBILE_MAIN_GEOMETRY`, `LIVE_MOBILE_MAIN_GEOMETRY`, `LIVE_MOBILE_BOARD_GEOMETRY`, and `MOBILE_NAV_GEOMETRY` now owned by the scenario registry.

- [ ] **Step 4: Preserve high-risk interaction behavior**

Run the exact unit/route tests below for phase roving tabs, live attendance, conflict/unknown recovery, preparation retry, and workbox deferral. Any visual change that deletes or auto-submits these controls is rejected.

Run: `corepack pnpm --dir front exec vitest run features/host/route/host-dashboard-route.test.tsx features/host/ui/operating-room/current-meeting-header.test.tsx features/host/ui/operating-room/host-next-action.test.tsx features/host/ui/operating-room/meeting-phase-tabs.test.tsx features/host/ui/operating-room/preparation-ledger.test.tsx features/host/ui/operating-room/phase-status-ledger.test.tsx`

- [ ] **Step 5: Reach strict GREEN and commit**

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/host-approved-routes.spec.ts --project=chromium --grep 'host-(prep|live|closing)'`

Expected: five scenarios PASS strict 0.02 with first-viewport count and geometry PASS.

Only after those five Host operating-room actual-route scenarios are strict GREEN, run `corepack pnpm --dir front test:ct:update:docker`. Inspect the exact workbox plus operating-room/shell snapshot files reported by `git status --short`, reject unrelated diffs, never touch approved reference PNGs, rerun `corepack pnpm --dir front test:ct:docker`, then stage those exact snapshot files. Carry any workbox snapshot drift left untouched by Task 6 into this update.

```bash
git add front/tests/e2e/host-approved-routes.spec.ts front/tests/e2e/support/host-approved-route-fixtures.ts front/features/host/ui/operating-room/host-operating-room-page.tsx front/features/host/ui/operating-room/operating-room.css front/features/host/ui/operating-room/current-meeting-header.test.tsx front/features/host/ui/operating-room/host-next-action.test.tsx front/features/host/ui/operating-room/meeting-phase-tabs.test.tsx front/features/host/ui/operating-room/preparation-ledger.test.tsx front/features/host/ui/operating-room/phase-status-ledger.test.tsx front/features/host/ui/shell/host-shell.css front/features/host/route/host-dashboard-route.tsx
# Add only the exact tracked workbox + operating-room/shell CT snapshot files shown by `git status --short` after independent inspection.
git commit -m "feat: converge host operating room actual routes"
```

---

### Task 8: Converge Host Meetings, People, Records, Settings, Review, and Person Routes

**Files:**

- Modify: `front/tests/e2e/host-approved-routes.spec.ts`
- Modify: `front/tests/e2e/support/host-approved-route-fixtures.ts`
- Modify: `front/features/host/ui/host-editorial-ledger.css`
- Modify: `front/features/host/ui/meeting-list/host-meeting-list.tsx`, `.test.tsx`, `meeting-toc.css`
- Modify: `front/features/host/ui/members/host-people-page.tsx`, `.test.tsx`, `member-list.tsx`, `.test.tsx`, `member-ledger.css`
- Modify: `front/features/host/ui/host-session-ledger.tsx`
- Modify: `front/features/host/ui/host-session-ledger.test.tsx`
- Modify: `front/features/host/ui/settings/host-settings-page.tsx`, `host-invitation-links.tsx`, `host-club-settings.tsx`, `host-settings-components.test.tsx`
- Modify: `front/features/host/ui/schedule-review/host-schedule-review-page.tsx`, `.test.tsx`, `host-schedule-review-header.tsx`, `host-schedule-review.css`
- Modify: `front/features/host/ui/person/host-person-detail.tsx`, `.test.tsx`, `host-person-detail.css`
- Modify only when the named actual route omits an already approved view-model value: `front/features/host/route/host-person-detail-route.tsx`, `front/features/host/route/host-schedule-review-route.tsx`, `front/features/host/route/host-settings-route.tsx`
- Modify only with the matching production route: `front/features/host/route/host-person-detail-route.test.tsx`, `front/features/host/route/host-schedule-review-route.test.tsx`, `front/features/host/route/host-settings-route.test.tsx`

**Interfaces:**

- Produces: strict actual-route tests for `host-meetings-desktop`, `host-people-desktop`, `host-records-desktop`, `host-settings-desktop`, `host-schedule-review-desktop`, `host-person-mobile`.
- Preserves: list/detail focus return, invitation safety, schedule preview-before-send, person privacy boundary, pagination, and route ownership.

- [ ] **Step 1: Add six RED authority tests**

Append the six ids to `host-approved-routes.spec.ts` using the Task 7 loop shape, including `test.skip(!visualAuthoritySelected(id), "not affected: " + id)` before fixture setup. Each test installs the same Host fixture router and uses its registered route. Assert its load-bearing interaction before capture: meetings view/status tabs; people pending-review and member table; records closing links; settings invitation action; schedule-review recipient/preview controls; mobile person status/history and bottom navigation.

For `host-schedule-review-desktop`, the approved candidate state exists only after the user activates `알림 미리보기`. Register exactly `POST /api/bff/api/host/notifications/manual/preview?clubSlug=visual-authority`; validate the authenticated fixture context and a request body containing the selected recipients, editable message, send mode, and expected schedule revision. Return the deterministic preview contract, wait for the `발송 전 확인` region, and only then capture. Do not click confirm/send.

At the end of every scenario, assert through the shared request audit that there were zero notification confirm/send, invitation-create, settings-mutation, session-close, membership mutation, or other effecting requests. An unmatched `/api/bff/**` request, wrong method, wrong club slug, wrong revision, or unexpected body fails immediately.

- [ ] **Step 2: Run and confirm RED**

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/host-approved-routes.spec.ts --project=chromium --grep 'host-(meetings|people|records|settings|schedule-review|person)'`

Expected: one or more scenarios FAIL strict pixel/geometry.

- [ ] **Step 3: Tune shared ledger primitives and route-owned styles**

Use the per-scenario header/nav/main geometry moved from `approved-host-ledgers.ct.tsx`. Shared `host-editorial-ledger.css` may own page title, ledgers, tabs, and row rhythm; route CSS owns only route-specific columns. Do not reintroduce `HostApprovedShell` into an actual route and do not render approved PNGs.

- [ ] **Step 4: Run focused functional regression**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/meeting-list/host-meeting-list.test.tsx features/host/ui/members/host-people-page.test.tsx features/host/ui/members/member-list.test.tsx features/host/ui/host-session-ledger.test.tsx features/host/ui/settings/host-settings-components.test.tsx features/host/ui/schedule-review/host-schedule-review-page.test.tsx features/host/ui/person/host-person-detail.test.tsx features/host/route/host-person-detail-route.test.tsx features/host/route/host-schedule-review-route.test.tsx features/host/route/host-settings-route.test.tsx`

- [ ] **Step 5: Reach all Host and all authority GREEN**

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/host-approved-routes.spec.ts --project=chromium`

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/admin-approved-routes.spec.ts tests/e2e/host-approved-routes.spec.ts --project=chromium`

Expected: Host `11/11` and total `18/18` actual-route strict PASS.

- [ ] **Step 6: Commit**

Only after all eleven Host actual routes are strict GREEN, run `corepack pnpm --dir front test:ct:update:docker`. Inspect only the tracked files under `front/__screenshots__/features/host/ui/meeting-workspace/host-focus-deck.ct.tsx/` and `front/__screenshots__/features/host/ui/session-closing-board.ct.tsx/` that correspond to intentional component changes, reject every unrelated snapshot change, confirm approved-reference hashes remain unchanged, and rerun `corepack pnpm --dir front test:ct:docker`.

```bash
git add front/tests/e2e/host-approved-routes.spec.ts front/tests/e2e/support/host-approved-route-fixtures.ts front/features/host/ui/host-editorial-ledger.css front/features/host/ui/meeting-list/host-meeting-list.tsx front/features/host/ui/meeting-list/host-meeting-list.test.tsx front/features/host/ui/meeting-list/meeting-toc.css front/features/host/ui/members/host-people-page.tsx front/features/host/ui/members/host-people-page.test.tsx front/features/host/ui/members/member-list.tsx front/features/host/ui/members/member-list.test.tsx front/features/host/ui/members/member-ledger.css front/features/host/ui/host-session-ledger.tsx front/features/host/ui/host-session-ledger.test.tsx front/features/host/ui/settings/host-settings-page.tsx front/features/host/ui/settings/host-invitation-links.tsx front/features/host/ui/settings/host-club-settings.tsx front/features/host/ui/settings/host-settings-components.test.tsx front/features/host/ui/schedule-review/host-schedule-review-page.tsx front/features/host/ui/schedule-review/host-schedule-review-page.test.tsx front/features/host/ui/schedule-review/host-schedule-review-header.tsx front/features/host/ui/schedule-review/host-schedule-review.css front/features/host/ui/person/host-person-detail.tsx front/features/host/ui/person/host-person-detail.test.tsx front/features/host/ui/person/host-person-detail.css
# If a conditional production route changed, add that exact route and matching test separately after inspecting `git status --short`.
# Add only the exact tracked Host CT snapshot files shown by `git status --short` after independent inspection.
git commit -m "feat: converge host ledger actual routes"
```

---

### Task 9: Add Shared Stress Contracts and the Pinned Diff-Driven CI Gate

**Files:**

- Create: `front/tests/e2e/approved-route-stress.spec.ts`
- Create: `front/tests/performance/visual-authority-docker.ts`
- Create: `front/tests/performance/visual-authority-docker.test.ts`
- Create: `front/scripts/run-visual-authority-docker.ts`
- Create: `front/scripts/list-affected-visual-authorities.ts`
- Modify: `front/package.json`
- Verify unchanged: `front/playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `front/tests/e2e/support/admin-approved-route-fixtures.ts`
- Modify: `front/tests/e2e/support/host-approved-route-fixtures.ts`

**Interfaces:**

- Produces: `test:e2e:approved-routes`, `test:e2e:approved-routes:docker`, `visual-authority:affected` scripts.
- Produces: `READMATES_VISUAL_AUTHORITY_IDS`, a comma-separated exact id filter.
- Produces: `buildVisualAuthorityDockerCommand({ packageManager, workspaceHostPath, authorityIds })`.
- Produces: semantic/geometry stress coverage without comparing stress states to representative PNGs.
- Reuses: `parsePnpmPackageManager` and its package-manager type from `front/tests/performance/ct-docker.ts`; do not create a second package-manager parser.

- [ ] **Step 1: Write RED Docker and affected-path tests**

```ts
it("runs actual routes in the pinned Playwright image", () => {
  const command = buildVisualAuthorityDockerCommand({
    packageManager: parsePnpmPackageManager("pnpm@11.13.1"),
    workspaceHostPath: "/repo",
    authorityIds: ["admin-today-mobile", "host-prep-mobile"],
  });
  expect(command.args).toContain("mcr.microsoft.com/playwright:v1.61.1-jammy");
  expect(command.args.join(" ")).toContain("pnpm test:e2e:approved-routes");
  expect(command.args.join(" ")).toContain("READMATES_VISUAL_AUTHORITY_IDS=admin-today-mobile,host-prep-mobile");
});
```

Add unit cases proving a token change returns 18 ids, Admin Today CSS returns three Admin Today ids, a Host person CSS change returns `host-person-mobile`, an approved PNG returns its own id, and an unrelated server file returns none.

- [ ] **Step 2: Run and confirm RED**

Run: `corepack pnpm --dir front exec vitest run tests/performance/visual-authority-docker.test.ts tests/unit/approved-mockup-contract.test.ts`

Expected: FAIL because the new Docker and affected-path commands do not exist.

- [ ] **Step 3: Implement the pinned runner**

The container command uses `--rm`, `--ipc=host`, the repository bind mount, isolated root/front node_modules and pnpm-store volumes, `/work/front` working directory, `CI=true`, `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true`, exact `READMATES_VISUAL_AUTHORITY_IDS`, Corepack activation, `pnpm install --frozen-lockfile`, then `pnpm test:e2e:approved-routes`. Do not use snapshot-update flags.

Add these exact scripts to `front/package.json`:

```json
{
  "test:e2e:approved-routes": "READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true playwright test tests/e2e/admin-approved-routes.spec.ts tests/e2e/host-approved-routes.spec.ts --project=chromium",
  "test:e2e:approved-routes:docker": "tsx scripts/run-visual-authority-docker.ts",
  "visual-authority:affected": "tsx scripts/list-affected-visual-authorities.ts"
}
```

Both actual-route spec files call `visualAuthoritySelected(id)` before setup so the Docker runner executes only the affected ids.

Verify that the existing `front/playwright.config.ts` `testMatch: "tests/e2e/**/*.spec.ts"` already includes both new spec files and that the existing `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true` branch keeps the Vite-only web-server path. Add a source-level test or focused assertion for those facts; do not edit the config unless repository reality changes.

- [ ] **Step 4: Implement changed-path selection**

`list-affected-visual-authorities.ts --changed-paths-file .tmp/visual-authority-changed-paths.txt` reads one canonical repository-relative path per line, calls `approvedMockupsAffectedBy`, sorts ids by manifest order, writes the comma-separated list to stdout, and exits nonzero for a missing file or an unknown option. It must also exit nonzero when any changed visual-sensitive path is unmapped. An empty affected set prints an empty line and succeeds only for paths classified as unrelated. Unit tables cover every path named as created or modified in Tasks 1–9, universal config/token/lockfile inputs, every approved PNG mapping to only its own id, role-local fixture/harness partitions, and unrelated server/docs paths.

`READMATES_VISUAL_AUTHORITY_IDS` is parsed by `parseVisualAuthoritySelection`: blank tokens, unknown ids, and duplicates are fatal. A non-empty valid selection must execute at least one matching test; a run in which all authority tests skip is a failure, not a green receipt.

- [ ] **Step 5: Add the exact stress matrix**

Implement the following finite table; do not interpret the axes as an unbounded Cartesian product:

| Group | Exact rows |
| --- | --- |
| Density | Admin Today counts `0/3/10` at widths `390` and `1440`; Host prep workbox counts `0/4/12` at widths `390` and `1440` |
| Breakpoints | Admin Today normal data and Host prep normal data at widths `320/390/768/1024/1440` |
| Copy | Long Korean, long English, and one 160-character unbroken token for both Admin Today and Host prep at width `320` |
| State | Admin list-unavailable at `390/1440`; Admin stale at `390`; Admin forbidden at `1440`; Host no-current-meeting at `390/1440`; Host partial source failure at `1440`; Host full workbox failure at `390`; Host live conflict at `390`; Host live unknown outcome at `1440` |
| Reduced motion | Admin Today and Host prep at widths `390` and `1440`, with `page.emulateMedia({ reducedMotion: "reduce" })` |
| 200% proxy | Admin Today and Host prep in a separate describe using `deviceScaleFactor: 2` and half-width CSS viewports; real toolbar zoom remains manual evidence in Task 10 |

Where rows overlap, reuse one parametrized case and record both obligations instead of running an accidental duplicate.

For every state assert no horizontal overflow, title minimum width, bounded first row height, first primary action visible, explicit disclosure when capped, keyboard reachability, and safe-area clearance. Do not call the pixel comparison helper for stress states.

- [ ] **Step 6: Wire the required CI job**

In the visual-regression job, set checkout `fetch-depth: 0`, resolve PR base SHA or push-before SHA with the same fail-closed pattern used by Flyway immutability, write `git diff --name-only "$base_sha" HEAD` to `.tmp/visual-authority-changed-paths.txt`, run `pnpm visual-authority:affected -- --changed-paths-file ...`, export the exact result as `READMATES_VISUAL_AUTHORITY_IDS`, and execute `pnpm test:e2e:approved-routes:docker` when ids are non-empty. The job fails when a sensitive path is unmapped, selection parsing fails, or a non-empty selection executes no matching tests. Upload `front/test-results/**/approved-mockup/*` and the Playwright report on failure. Keep component CT as a separate regression signal.

The Docker runner sets the renderer/browser/Playwright/Node/pnpm/font and DPR inputs consumed by `ApprovedComparisonReport`; missing fingerprint inputs fail the report schema. It activates the repository-declared package manager and passes the exact authority-id selection into the container.

- [ ] **Step 7: Run local pinned and regression gates**

Run: `corepack pnpm --dir front exec vitest run tests/performance/visual-authority-docker.test.ts tests/unit/approved-mockup-contract.test.ts`

Run: `corepack pnpm --dir front test:e2e:approved-routes:docker`

Run: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front exec playwright test tests/e2e/approved-route-stress.spec.ts --project=chromium`

Expected: 18 strict route tests and the full stress matrix PASS.

- [ ] **Step 8: Commit**

```bash
git add front/tests/e2e/approved-route-stress.spec.ts front/tests/performance/visual-authority-docker.ts front/tests/performance/visual-authority-docker.test.ts front/scripts/run-visual-authority-docker.ts front/scripts/list-affected-visual-authorities.ts front/package.json .github/workflows/ci.yml front/tests/e2e/support/admin-approved-route-fixtures.ts front/tests/e2e/support/host-approved-route-fixtures.ts
git commit -m "ci: gate affected actual-route visual authorities"
```

---

### Task 10: Full Verification, Independent Review, and Truthful Documentation

**Files:**

- Create: `docs/reports/2026-09-04-admin-host-actual-route-visual-authority-acceptance.md`
- Modify: `docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md`
- Modify: `docs/reports/2026-09-02-host-approved-first-viewport-acceptance.md`
- Modify: `front/DESIGN.md`
- Modify: `docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md`
- Modify: `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`
- Modify: `docs/development/host-redesign-mockups/README.md`
- Modify: `docs/development/adr/0053-approved-mockup-pixel-fidelity-gate.md`
- Modify conditionally: `docs/development/adr/README.md`, `docs/development/technical-decisions.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces: one receipt row per authority id with reference/candidate hashes, renderer fingerprint, pixel ratio, geometry, typography, first viewport, mask status, and reviewer.
- Produces: explicit `pending_external_human_evidence` and `not_measured` statuses where external/manual evidence is absent.
- Promotes ADR-0053 to `Accepted` only if every automated, human, and AT condition is evidenced.

- [ ] **Step 1: Run the canonical frontend gates from a clean worktree**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
corepack pnpm --dir front test:ct:docker
corepack pnpm --dir front test:e2e:approved-routes:docker
READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true corepack pnpm --dir front test:e2e:visual-authority-browsers
corepack pnpm --dir front exec playwright test tests/e2e/admin-editorial-ledger-browser-smoke.spec.ts tests/e2e/admin-today.spec.ts tests/e2e/host-lifecycle-operating-room.spec.ts tests/e2e/host-lifecycle-route-continuity.spec.ts tests/e2e/host-workbox-stage4.spec.ts --project=chromium
```

Record the exact command, exit code, and artifact path. A skipped or unavailable command is not PASS.

- [ ] **Step 2: Perform independent visual review**

For each of 18 ids, a reviewer who did not implement that slice opens `<id>-reference.png`, `<id>-candidate.png`, `<id>-overlay.png`, `<id>-diff.png`, and `<id>-report.json`. The report must contain the manifest/reference/candidate hashes; renderer, browser, Playwright, Node, pnpm, font and DPR fingerprints; viewport; pixel and region results; typography size/line-height/weight/color results; first-viewport visibility/item-cap results; interaction outcomes; and `mask: null`. The reviewer records `PASS` only when composition, hierarchy, first-viewport disclosure, interactions, and strict metrics agree. A missing field, missing artifact, or schema mismatch is a failure. Review failures return to the owning task; do not update references or snapshots to absorb them.

- [ ] **Step 3: Record five-person discovery evidence**

Each participant gets 30 seconds per role without implementation explanation. Record whether they identify Admin priority work and `전체 보기`, Host current phase and next action, and the secondary destination. If five measured participants are not available, write `pending_external_human_evidence`; do not infer success from automated tests or AI review.

- [ ] **Step 4: Record real browser zoom and assistive-technology evidence**

At Chrome toolbar 200%, verify Admin Today desktop and Host prep desktop: CSS viewport, scroll/client widths, primary action, queue/workbox disclosure, visible focus, and screenshot. Run VoiceOver/Safari and NVDA/Chrome through heading, landmark, state announcement, and focus order. Missing manual evidence is written as `not_measured`.

- [ ] **Step 5: Align active documents without rewriting history**

Add a top note to both 2026-09-02 reports pointing to the new actual-route report and preserving their historical fixture results. Update `front/DESIGN.md`, `docs/development/host-redesign-mockups/README.md`, and both active design docs to say the actual authenticated route is final authority, broad raster exceptions are removed, and CT fixtures are secondary. Remove active documentation claims that `test:ct:approved` produces approval receipts; preserve the old command only where a historical report clearly labels it as historical. Add the user-visible Admin/Host density/disclosure change to `CHANGELOG.md` under Unreleased.

ADR rule:

- If 18/18 strict, stress, all frontend gates, remote CI, five-person discovery, VoiceOver/Safari, and NVDA/Chrome all have evidence, set ADR-0053 to `Accepted` and update both indexes.
- If any item is failed, pending, skipped, or not measured, leave ADR-0053 `Proposed`, list the exact residual, and leave both indexes at `Proposed`.

Remote CI requires separate authority to push/create a PR. If that authority or a remote run is absent, record `pending_remote_ci`; do not infer CI success from local parity and do not promote ADR-0053.

- [ ] **Step 6: Run docs safety and consistency checks**

```bash
git diff --check -- CHANGELOG.md front/DESIGN.md docs/development docs/reports
rg -n "(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" CHANGELOG.md front/DESIGN.md docs/development docs/reports
rg -n "allowFontRasterException|fontRasterExceptionMaxRatio|skipMismatchRatioAssertion|PASS-with-font-raster" front docs/development docs/reports
```

The safety scan must return no new private-looking values. Any remaining `PASS-with-font-raster` occurrence must be explicitly labeled historical and linked to the superseding actual-route report.

- [ ] **Step 7: Request whole-branch review**

Compare the branch against its real base, normally `origin/main..HEAD`. Review requirement coverage, unintended Public/Member changes, security/authority regressions, CI fail-open paths, reference mutation, and public-repo safety. Fix findings in bounded loops and rerun only the smallest proof set invalidated by each fix, followed by the final canonical gate.

- [ ] **Step 8: Commit the truthful closeout**

```bash
git add CHANGELOG.md front/DESIGN.md docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md docs/development/host-redesign-mockups/README.md docs/development/adr/0053-approved-mockup-pixel-fidelity-gate.md docs/development/adr/README.md docs/development/technical-decisions.md docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md docs/reports/2026-09-02-host-approved-first-viewport-acceptance.md docs/reports/2026-09-04-admin-host-actual-route-visual-authority-acceptance.md
git commit -m "docs: record actual-route visual authority acceptance"
```

If the ADR indexes were correctly unchanged because evidence is still pending, omit those two unchanged files from `git add`.

---

## Spec Coverage

| Approved design requirement | Implementation tasks |
| --- | --- |
| Actual authenticated routes are the final visual authority for all 18 references | Tasks 1-2 |
| Admin seven-screen structure, hierarchy, responsive density, and disclosure | Tasks 3-5 |
| Host eleven-screen workbox, operating-room, ledger, settings, review, and person flows | Tasks 6-8 |
| Platform root space hierarchy plus role/capability and club-scope authorization | Tasks 2, 4, and 6 |
| Explicit three/four-item caps with URL-backed expansion | Tasks 3 and 6 |
| Loading, empty, partial, full-failure, stale, forbidden, conflict, and unknown-outcome safety | Tasks 6, 7, and 9 |
| Strict pixel/geometry/typography gates with no broad raster exception | Tasks 1, 2, and 9 |
| Auditable method/context/body fixtures and zero unexpected effecting requests | Tasks 2, 6, 7, and 8 |
| Copy, count, viewport, reduced-motion, and 200% layout stress | Task 9 |
| Diff-driven CI invalidation and immutable references | Task 9 |
| Independent visual review, human discovery, AT evidence, truthful ADR closeout | Task 10 |

---

## Completion Checklist

- [ ] Actual authenticated route is the candidate for all 18 references.
- [ ] Strict 0.02, 4px/2px, typography, first viewport, and interaction checks pass for 18/18.
- [ ] No broad raster exception or ratio-skip API remains.
- [ ] Admin default queue is three items with URL-backed `전체 보기`.
- [ ] Host default workbox is four desktop/three mobile with URL-backed `작업함 모두 보기`.
- [ ] Root space switcher remains `플랫폼 운영` plus `내 클럽`; named clubs and perspectives appear only in the club subflow allowed by `availableSpaces`.
- [ ] Missing Admin/Host authority, missing Host perspective, and mismatched club context fail closed before protected data is fetched.
- [ ] Schedule-review authority captures the post-preview state from an exact validated POST and issues no confirm/send request.
- [ ] 0/3/10 Admin, 0/4/12 Host, long copy, error, 320px, and 200% proxy stress checks pass.
- [ ] Component CT remains a secondary regression suite and cannot issue final approval.
- [ ] Diff-driven CI invalidates every affected reference and cannot pass by updating a snapshot.
- [ ] Frontend lint, unit, build, CT, actual-route Docker, focused browser, and affected full E2E checks pass.
- [ ] Independent 18-screen review has no unresolved failure.
- [ ] Five-person 30-second discovery is measured or honestly blocks acceptance.
- [ ] VoiceOver/Safari and NVDA/Chrome are measured or honestly block acceptance.
- [ ] Active docs and ADR status describe exactly the evidence delivered.
