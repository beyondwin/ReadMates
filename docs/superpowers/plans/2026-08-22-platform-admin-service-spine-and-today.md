# Platform Admin Service Spine and Today Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랫폼 어드민의 권한·내비게이션·페이지 문법·접근성 기반을 서버 권한 계약으로 통일하고, `/admin/today`를 모든 운영 화면의 기준 품질로 완성한다.

**Architecture:** Spring의 `CurrentPlatformAdmin`이 버전된 capability allowlist를 발급하고 BFF를 거친 React shell이 이를 단일 권한 원천으로 사용한다. Shell은 네 개의 1차 영역과 중첩 상세 흐름만 표현하며, 공통 page-state·dialog·action-dock 프리미티브가 각 도메인의 업무 상태를 일관되게 렌더링한다. Today의 case ledger와 기존 operations API는 유지하되 모바일·키보드·부분 실패 계약을 강화한다.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Vite, Vitest, Playwright, Kotlin, Spring Boot, MockMvc.

**Spec:** `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`

ADR impact: update — ADR-0039; constraining reference — ADR-0035, ADR-0040

## Global Constraints

- 1차 영역은 `오늘`, `클럽`, `서비스`, `검토` 네 개뿐이다. 기존 URL은 유지하고 서비스·검토 아래에서 중첩 표시한다.
- capability 응답은 서버의 현재 ACTIVE platform-admin 권한만 반영한다. 클럽 host 권한과 합성하지 않는다.
- `401|403` 발생 시 모든 `platform-admin` query cache와 in-memory selection/draft를 즉시 폐기한다. 브라우저 저장소에 어드민 상태를 저장하지 않는다.
- 모든 화면은 `loading`, `empty`, `partial`, `unavailable`, `forbidden`, `ready` 중 적용 가능한 상태를 명시적으로 렌더링한다.
- 공통 UI는 업무 표현만 공유한다. 도메인 명령 실행기나 범용 `/execute` API를 만들지 않는다.
- 모달은 initial focus, focus trap, Escape, backdrop, background inert, scroll lock, close 후 trigger focus 복원을 모두 만족한다.
- CSS breakpoint와 React layout breakpoint는 동일한 `768px` 계약을 사용한다.
- 실제 개인정보, private domain, secret, token-shaped fixture를 테스트·문서·로그에 넣지 않는다.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Server-owned capability and authority-loss purge | 1–2 |
| Four-area information architecture | 3 |
| Shared page grammar and accessible overlays | 4 |
| Today reference workflow and mobile parity | 5 |
| Browser and full-surface regression evidence | 6 |

## Dependency Order

`1 → 2 → 3`; `2 → 4`; `3 + 4 → 5 → 6`. Plans for clubs, services, and review depend on Tasks 1–4. The safe-command substrate is a separate plan and can execute in parallel after Task 1 fixes capability names.

---

### Task 1: Publish the platform-admin capability contract

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/shared/security/Actors.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/PlatformAdminCapabilitiesController.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminCapabilitiesControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentPlatformAdminArgumentResolverTest.kt`

**Interfaces:**

```kotlin
enum class PlatformCapability {
    VIEW_TODAY, VIEW_CLUBS, VIEW_CLUB_OPERATIONS,
    VIEW_SERVICE_HEALTH, VIEW_NOTIFICATION_OPERATIONS, REPLAY_NOTIFICATIONS,
    VIEW_AI_OPERATIONS, MANAGE_AI_OPERATIONS,
    VIEW_SUPPORT, MANAGE_SUPPORT_ACCESS,
    VIEW_AUDIT, VIEW_SENSITIVE_AUDIT,
    VIEW_ANALYTICS, EXPORT_ANALYTICS,
    CREATE_CLUB, MANAGE_CLUBS, MANAGE_CLUB_DOMAINS, MANAGE_PLATFORM_ADMINS,
}

data class PlatformAdminCapabilitiesResponse(
    val schemaVersion: Int = 1,
    val role: PlatformAdminRole,
    val status: String = "ACTIVE",
    val capabilities: List<PlatformCapability>,
    val generatedAt: OffsetDateTime,
)
```

`GET /api/admin/capabilities` returns a sorted, duplicate-free allowlist with `Cache-Control: no-store`. OWNER, OPERATOR, and SUPPORT mappings live beside `CurrentPlatformAdmin`; controllers still reauthorize each request and never trust a browser capability.

- [ ] **Step 1: Write RED mapping and controller tests.** Assert the exact allowlist for all three roles, inactive/non-admin denial, stable ordering, schema version, UTC timestamp, and `no-store`. Assert platform-admin capabilities never include host/member authorities.
- [ ] **Step 2: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.adapter.in.security.CurrentPlatformAdminArgumentResolverTest --tests com.readmates.auth.api.PlatformAdminCapabilitiesControllerTest`

  Expected: FAIL because the endpoint and expanded enum do not exist.

- [ ] **Step 3: Implement the enum mapping and thin controller.** Keep emergency public takedown capability out of this contract; ADR-0037 owns that release separately.
- [ ] **Step 4: Run GREEN.** Run the Task 1 command; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(admin): publish platform capability contract`

### Task 2: Make the frontend capability contract authoritative

**Files:**
- Create: `front/features/platform-admin/api/platform-admin-capabilities-api.ts`
- Create: `front/features/platform-admin/api/platform-admin-capabilities-api.test.ts`
- Create: `front/features/platform-admin/model/platform-admin-capabilities.ts`
- Create: `front/features/platform-admin/model/platform-admin-capabilities.test.ts`
- Modify: `front/features/platform-admin/model/platform-admin-permissions.ts`
- Modify: `front/features/platform-admin/model/platform-admin-permissions.test.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-queries.test.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-data.ts`
- Modify: `front/features/platform-admin/route/admin-shell-data.test.ts`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`

**Interfaces:**

```ts
export type PlatformAdminCapability = /* exact server enum union */;
export type PlatformAdminCapabilities = {
  schemaVersion: 1;
  role: "OWNER" | "OPERATOR" | "SUPPORT";
  status: "ACTIVE";
  capabilities: PlatformAdminCapability[];
  generatedAt: string;
};
export function canAdmin(capabilities: PlatformAdminCapabilities, action: PlatformAdminCapability): boolean;
export function purgePlatformAdminState(queryClient: QueryClient): void;
```

- [ ] **Step 1: Write RED contract tests.** Reject unknown schema/role/status/capability, duplicates, invalid timestamp, and non-array payloads. Prove shell gating uses returned capabilities, not a locally inferred role.
- [ ] **Step 2: Write RED authority-loss tests.** Seed all `platform-admin` keys and in-memory shell selections; simulate `401` and `403`; assert removal of the entire prefix and closure/reset of onboarding and workspace menus without clearing unrelated member queries.
- [ ] **Step 3: Run RED.**

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/api/platform-admin-capabilities-api.test.ts features/platform-admin/model/platform-admin-capabilities.test.ts features/platform-admin/queries/platform-admin-queries.test.tsx features/platform-admin/route/admin-shell-data.test.ts features/platform-admin/route/admin-shell-layout.test.tsx`

  Expected: FAIL because the capability query and purge boundary do not exist.

- [ ] **Step 4: Implement parsing, query keys, loader fetch, and purge hook.** Shell may use summary for descriptive counts, never for authorization. Avoid localStorage/sessionStorage.
- [ ] **Step 5: Run GREEN.** Run the Task 2 command; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(admin): make capabilities authoritative`

### Task 3: Rebuild the shell around four primary work areas

**Files:**
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts`
- Modify: `front/features/platform-admin/model/admin-route-catalog.test.ts`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.tsx`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-breadcrumb.tsx`
- Modify: `front/features/platform-admin/ui/admin-breadcrumb.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-workspace-switcher.tsx`
- Modify: `front/features/platform-admin/ui/admin-workspace-switcher.test.tsx`
- Modify: `front/features/platform-admin/model/admin-workspace-switcher-model.ts`
- Modify: `front/features/platform-admin/model/admin-workspace-switcher-model.test.ts`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/admin-shell.spec.ts`

**Contract:** `today` and `clubs` are direct primary destinations. `health|notifications|ai-ops` appear inside `services`; `support|audit|analytics` inside `review`. Club detail is a nested route and never a fifth tab. Workspace destinations are derived from authenticated joined clubs only; the shell must not fetch the entire platform club list for the switcher.

- [ ] **Step 1: Write RED catalog/nav tests.** Cover exact group hierarchy, active parent state, nested club detail breadcrumb, capability-hidden items, zero-capability empty navigation, and preserved paths.
- [ ] **Step 2: Write RED keyboard tests.** Cover switcher trigger `Enter|Space|ArrowDown`, menu roving focus, `Home|End`, Escape, outside click, focus return, and no focusable hidden items.
- [ ] **Step 3: Run RED.**

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/ui/admin-workspace-switcher.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx`

  Expected: FAIL on the current flat three-group catalog and incomplete menu behavior.

- [ ] **Step 4: Implement hierarchy and responsive shell.** Remove unconditional `platformAdminClubsQuery()` shell fetch. Keep the skip link and visible focus ring; use semantic `nav`, nested lists, `aria-current`, and 44px mobile targets.
- [ ] **Step 5: Run GREEN and one shell browser test.**

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/ui/admin-workspace-switcher.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx`

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-shell.spec.ts`

  Expected: PASS at desktop and mobile projects.
- [ ] **Step 6: Commit.** Commit: `feat(admin): establish four-area service spine`

### Task 4: Add the shared page-state and accessible overlay grammar

**Files:**
- Create: `front/features/platform-admin/ui/admin-page-frame.tsx`
- Create: `front/features/platform-admin/ui/admin-page-frame.test.tsx`
- Create: `front/features/platform-admin/ui/admin-state-panel.tsx`
- Create: `front/features/platform-admin/ui/admin-state-panel.test.tsx`
- Create: `front/features/platform-admin/ui/admin-action-dock.tsx`
- Create: `front/features/platform-admin/ui/admin-action-dock.test.tsx`
- Create: `front/features/platform-admin/ui/admin-modal-dialog.tsx`
- Create: `front/features/platform-admin/ui/admin-modal-dialog.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-onboarding-modal.tsx`
- Modify: `front/features/platform-admin/ui/admin-onboarding-modal.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-state-actions.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-state-actions.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**

```ts
type AdminPageState = "loading" | "empty" | "partial" | "unavailable" | "forbidden" | "ready";
type AdminActionDockProps = { primary?: ReactNode; secondary?: ReactNode; status?: ReactNode };
type AdminModalDialogProps = { titleId: string; triggerRef: RefObject<HTMLElement | null>; onRequestClose(): void };
```

- [ ] **Step 1: Write RED semantic/accessibility tests.** Prove headings/description/action slots, `aria-live` without duplicate announcements, partial-source disclosure, modal focus wrap in both directions, initial/restore focus, inert background, scroll lock, Escape/backdrop, and nested interactive content.
- [ ] **Step 2: Run RED.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/ui/admin-page-frame.test.tsx features/platform-admin/ui/admin-state-panel.test.tsx features/platform-admin/ui/admin-action-dock.test.tsx features/platform-admin/ui/admin-modal-dialog.test.tsx features/platform-admin/ui/admin-onboarding-modal.test.tsx features/platform-admin/ui/admin-operation-state-actions.test.tsx`; expected FAIL.
- [ ] **Step 3: Implement presentation-only primitives.** Do not place fetch, capability inference, idempotency, or domain mutation code in these components.
- [ ] **Step 4: Migrate the two existing dialogs and run GREEN.** Run the Task 4 command; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(admin): add accessible workspace primitives`

### Task 5: Make Today the reference operational workflow

**Files:**
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/admin-today.spec.ts`
- Modify: `front/tests/e2e/admin-operations-command-center.spec.ts`

- [ ] **Step 1: Write RED state and responsive tests.** Cover independent list/detail/source failures, stale detail, forbidden, zero cases, unavailable source retry, action success/conflict/error, URL-owned non-sensitive filters, `768px` desktop/mobile parity, bottom-safe action dock, and back-button restoration.
- [ ] **Step 2: Run RED.**

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/route/admin-today-route.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`

  Expected: FAIL on breakpoint mismatch and incomplete state grammar.
- [ ] **Step 3: Refactor Today onto the shared frame/state/action components.** Preserve current case APIs and single-refetch semantics; do not introduce mutation polling or duplicate lifecycle calls.
- [ ] **Step 4: Run GREEN and browser matrix.**

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/route/admin-today-route.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-today.spec.ts tests/e2e/admin-operations-command-center.spec.ts`

  Expected: PASS with no horizontal page overflow at 320px.
- [ ] **Step 5: Commit.** Commit: `feat(admin): complete today reference workflow`

### Task 6: Run foundation acceptance and public-safety checks

**Files:**
- Modify only if behavior changed: `CHANGELOG.md`

- [ ] **Step 1: Run focused frontend gates.**

  Run: `npx --yes corepack@0.35.0 pnpm --dir front lint`

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test`

  Run: `npx --yes corepack@0.35.0 pnpm --dir front build`

  Expected: PASS.
- [ ] **Step 2: Run server PR gate.** Run: `./scripts/server-ci-check.sh`; expected PASS.
- [ ] **Step 3: Run platform-admin browser suite.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-shell.spec.ts tests/e2e/admin-today.spec.ts tests/e2e/admin-operations-command-center.spec.ts`; expected PASS.
- [ ] **Step 4: Inspect visual/a11y states manually.** At 320, 768, and 1440px verify all applicable states, keyboard-only shell/switcher/dialog use, focus visibility, reduced motion, 200% text zoom, and no bottom action obstruction. Record screenshots as local evidence; do not commit private runtime data.
- [ ] **Step 5: Run repository hygiene.** Run: `git diff --check` and `python3 scripts/agent-preflight.py --paths front/features/platform-admin --paths front/src/app/routes/admin.tsx --paths server/src/main/kotlin/com/readmates/auth`; expected no errors.
- [ ] **Step 6: Commit acceptance-only changes if any.** Commit: `test(admin): verify service spine and today workflow`
