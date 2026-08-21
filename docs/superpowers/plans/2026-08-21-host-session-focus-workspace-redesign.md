# Host Session Focus Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트가 한 모임의 현재 상태와 바로 해야 할 한 가지 일을 첫 화면에서 이해하고, 작성부터 공개까지 긴 스크롤·중첩 탭 없이 완료하며, 실수한 변경이나 삭제를 같은 흐름에서 안전하게 되돌릴 수 있게 한다.

**Architecture:** 기존 `DRAFT → OPEN → CLOSED → PUBLISHED` 도메인 상태와 명시적 전이는 유지한다. 프론트는 `features/host` 안에 순수 Focus Deck 모델을 두고, 라우트가 기존 basic/attendance/record/history 기능을 하나의 반응형 workspace로 조립한다. 서버는 기존 감사 로그에 복구 가능한 before/after snapshot과 mutation receipt를 추가하고, 현재 값을 해시로 확인한 뒤 선택한 변경만 복원한다. 삭제는 기존 허용 상태·blocker 규칙을 유지한 채 `sessions` 행을 7일 휴지통으로 이동하고, 모든 정상 조회는 `active_sessions` projection만 사용하며 만료 행은 bounded scheduler가 물리 정리한다. Cloudflare BFF는 현재의 generic `/api/**` proxy를 유지하고 동일 출처·host client-contract 회귀 테스트만 확장한다.

**Tech Stack:** React 19, React Router 8, TanStack Query v5, Vite, TypeScript, Zod, Vitest, Testing Library, Playwright; Kotlin, Spring Boot, JDBC, MySQL 8, Flyway, JUnit 5, MockMvc, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-21-host-session-focus-workspace-redesign-design.md`

## Global Constraints

- 승인된 네 화면 상태의 호스트 표기는 정확히 `모임 작성 중`, `멤버와 준비 중`, `기록 정리 중`, `공개 완료`다. 서버 enum `DRAFT|OPEN|CLOSED|PUBLISHED`는 바꾸지 않는다.
- 날짜는 추천 작업의 우선순위만 바꾼다. 날짜 경과만으로 lifecycle mutation을 실행하지 않는다.
- 특정 모임 화면에서 `모임 전/진행 중/모임 후` rail과 `개요/기본 정보/출석/기록/변경 기록` 탭을 제거한다. 기능을 삭제하지 말고 Focus Deck의 주 작업과 보조 panel로 재배치한다.
- 기존 `?section=overview|basic|attendance|records|history`, `?source=manual|ai|json`, `?aigen=1`, `?records=json` deep link를 계속 해석한다. URL은 해당 panel을 열고 focus/scroll하는 의미이며, 새 탭 UI를 만들지 않는다.
- 기본 정보, 출석, 기록 초안은 lifecycle을 되돌리지 않고 수정 가능하다. lifecycle 역전은 기존 한 단계 reverse API와 사유 계약을 사용한다.
- 기본 정보·출석 복원은 감사 snapshot의 영향 필드만 되돌린다. preview 시점 current hash가 commit 시점과 다르면 `409 HOST_SESSION_RESTORE_STALE`로 중단하며 다른 변경을 덮어쓰지 않는다.
- `meetingUrl`과 `meetingPasscode`는 복원용 DB snapshot에는 보관할 수 있지만 응답·로그·history detail에는 원문을 노출하지 않고 `sensitive=true`, 값 `null`로 redaction한다.
- 기록 revision 복원은 기존처럼 live를 직접 덮어쓰지 않고 새 draft를 만든다.
- 삭제 허용 상태는 기존 `DRAFT|OPEN`, blocker는 기존 durable record/notification blocker를 그대로 유지한다. 삭제는 7일 휴지통 이동이며 child row를 즉시 지우지 않는다.
- 삭제된 세션은 host 정상 목록/detail, member current/upcoming/archive/note, guest browse/public, 알림 계획, AI 작업 대상, admin 운영 집계에서 보이지 않아야 한다. 휴지통 전용 API만 base `sessions`의 삭제 행을 읽는다.
- `OPEN` 세션 복원 시 클럽에 다른 `OPEN`이 있으면 `409 SESSION_OPEN_ALREADY_EXISTS`와 기존 `openSessionId` 계약으로 막는다.
- 휴지통 보존 시간은 서버 UTC 기준 `deleted_at + 7 days`; 브라우저 시간으로 판정하지 않는다. 만료 후 restore는 행이 아직 있으면 물론 purge 뒤에도 lifecycle audit 증거가 있으면 `410 HOST_SESSION_TRASH_EXPIRED`다.
- 삭제 직후 같은 URL에서 tombstone과 `되돌리기`를 보여 준다. 새로고침 시 active detail 404 뒤 trash detail을 조회해 같은 tombstone을 복원한다.
- 오류 시 사용자가 입력한 form/draft를 유지하고 해당 영역 안에 오류와 `다시 시도`를 둔다. background invalidation 실패를 저장 실패로 오인시키지 않는다.
- 즉시 undo bar는 자동 소멸시키지 않는다. 새 mutation receipt가 생기거나 사용자가 닫거나 복원이 완료될 때까지 유지한다.
- desktop은 main + side rail, mobile은 한 열 + bottom-safe sticky CTA다. 320px에서 가로 overflow가 없어야 하고 sticky CTA가 입력·dialog·브라우저 safe area를 가리지 않아야 한다.
- route-first 의존성은 `src/app → features/host/route → ui|queries → api|model`; model은 React/router/fetch를 import하지 않는다.
- 신규 POST restore path는 Spring CSRF ignore matcher에 정확한 method/path로 추가한다. broad matcher를 만들지 않는다.
- BFF path allowlist는 없다. `front/functions/api/bff/[[path]].ts` 구현은 바꾸지 않고 generic forwarding, same-origin, `X-Readmates-Client-Contract: v2` 동작을 테스트한다.
- root `packageManager`는 `pnpm@11.13.1`; 프론트 명령은 `corepack pnpm --dir front ...`로 실행한다.
- 실제 멤버 데이터, 비밀, private domain, 로컬 절대 경로, token-shaped fixture를 코드·테스트·문서·커밋에 넣지 않는다.
- 각 task는 RED 실패를 확인한 뒤 최소 GREEN, focused regression, `git diff --check`, 좁은 커밋 순서로 끝낸다.

## Requirement Handoff

| Spec requirement | Tasks |
| --- | --- |
| Focus Deck, 네 상태, 날짜 기반 추천 | 1–3 |
| 중첩 lifecycle rail·5개 탭 제거 | 2–3 |
| basic/attendance/record/history 재배치 | 2–3 |
| deep-link 호환 | 1–2, 10 |
| mutation receipt, 즉시 undo | 4, 6 |
| 변경 기록 preview/restore, 충돌 방지, redaction | 4–6 |
| 기존 record revision draft restore | 3, 6 |
| 7일 휴지통, restore, 만료 purge | 7–9 |
| 삭제 행 전 surface 차단 | 7–8, 10 |
| same URL tombstone, trash list | 9 |
| responsive, accessibility, browser proof | 3, 9–10 |
| architecture/CHANGELOG/release evidence | 11 |

## Dependency Order

`1 → 2 → 3`; `4 → 5 → 6`; `7 → 8 → 9`; Tasks 6 and 9 depend on Task 3's workspace shell; Task 10 depends on 1–9; Task 11 is last. Tasks 4–5 must be sequential because they share audit models and migrations. Tasks 7–8 must be sequential because they share `sessions` visibility and deletion transaction code.

## Acceptance-Matrix Selection

- Selected: Session lifecycle; Persistence/migration; Cursor collection; Guest/public exposure; Actor/authorization; BFF/client contract; UI/runtime state; Responsive/accessibility; Scheduled cleanup.
- Adjacent evidence: archive/note/current-session/public browse query tests, MySQL query-plan checks, frontend Zod contract test, BFF same-origin/client-contract test.
- Explicitly excluded: OAuth changes, notification unsend, AI generation behavior changes, production deployment, billable AI smoke, email delivery smoke, public-release candidate generation.

## File Responsibility Map

| Responsibility | Files |
| --- | --- |
| Focus Deck state/priority/progress | Create `front/features/host/model/host-session-workspace-model.ts` and `.test.ts` |
| Legacy URL → open workspace panel | Create `front/features/host/model/host-session-workspace-navigation.ts` and `.test.ts`; remove old navigation module after import migration |
| Specific meeting route composition | Modify `front/src/app/host-routes/meeting-route-element.tsx` and `.test.tsx`; modify `front/features/host/route/host-session-editor-data.ts`, `host-session-editor-route.tsx` and tests |
| Workspace visual shell | Create `front/features/host/ui/session-workspace/host-session-workspace.tsx`, `workspace-header.tsx`, `workspace-focus-card.tsx`, `workspace-progress-list.tsx`, `workspace-panel.tsx`, `workspace-undo-bar.tsx` and tests |
| Existing editor orchestration | Modify `front/features/host/ui/host-session-editor.tsx`; reuse `basic-session-panel.tsx`, `attendance-panel.tsx`, `session-record-workspace.tsx`, `session-history-panel.tsx`, `meeting-ledger/upcoming-book-list.tsx` |
| Workspace styling | Modify `front/src/styles/globals.css`, `front/shared/styles/mobile.css`; remove unused specific-page phase/tab rules after call-site removal |
| Mutation receipts and snapshot audit | Add Flyway `V50__host_session_change_snapshots.sql`; modify session application models, audit/lifecycle ports/adapters/services and focused tests |
| Restore preview/commit | Create `HostSessionRecoveryModels.kt`, `HostSessionRecoveryUseCases.kt`, `HostSessionRecoveryPort.kt`, `HostSessionRecoveryService.kt`, `JdbcHostSessionRecoveryAdapter.kt`, `HostSessionRecoveryController.kt` and tests; modify error/security/history files |
| Frontend recovery contract | Create `host-session-recovery-contracts.ts`, `host-session-recovery-api.ts`, `host-session-recovery-queries.ts` and tests; modify history/workspace route UI |
| Active session projection | Add Flyway `V51__host_session_trash.sql`; replace normal read joins with `active_sessions`; add architecture and exposure regression tests |
| Trash domain/API/purge | Modify deletion models/port/query/service/transaction/controller; create `HostSessionTrashModels.kt`, `HostSessionTrashUseCases.kt`, `HostSessionTrashService.kt`, `HostSessionTrashScheduler.kt`, `HostSessionTrashProperties.kt` and tests |
| Trash frontend | Extend host contracts/API/queries; modify session loader/route and session ledger route/data/UI/model; create workspace tombstone and tests |
| BFF regression | Modify only `front/tests/unit/cloudflare-bff.test.ts`; do not modify the generic BFF implementation |
| End-to-end proof | Modify `front/tests/e2e/host-club-operations.spec.ts` and its safe DB fixture helper if a deterministic state helper is required |
| Active documentation | Modify `docs/development/architecture.md` and `CHANGELOG.md` |

---

### Task 1: Pure Focus Deck and compatible workspace navigation

**Files:**
- Create: `front/features/host/model/host-session-workspace-model.ts`
- Create: `front/features/host/model/host-session-workspace-model.test.ts`
- Create: `front/features/host/model/host-session-workspace-navigation.ts`
- Create: `front/features/host/model/host-session-workspace-navigation.test.ts`
- Delete after call-site migration in Task 3: `front/features/host/model/host-session-editor-navigation.ts`
- Delete after call-site migration in Task 3: `front/features/host/model/host-session-editor-navigation.test.ts`

**Interfaces:**

```ts
export type HostSessionWorkspacePanel = "focus" | "basic" | "attendance" | "records" | "history";
export type HostSessionWorkspaceLocation = {
  panel: HostSessionWorkspacePanel;
  source: "manual" | "ai" | "json";
};
export type HostSessionWorkspaceInput = {
  state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  meetingDate: string;
  today: string;
  unknownAttendanceCount: number;
  hasRecordDraft: boolean;
  recordDraftStale: boolean;
  recordValidationIssueCount: number;
  hasAppliedRecord: boolean;
  publicationReady: boolean;
};
export type HostSessionWorkspaceView = {
  statusLabel: "모임 작성 중" | "멤버와 준비 중" | "기록 정리 중" | "공개 완료";
  primaryAction: { kind: string; label: string; panel: HostSessionWorkspacePanel };
  progress: ReadonlyArray<{ id: string; label: string; state: "done" | "current" | "next" }>;
};
```

- [ ] **Step 1: Write failing state-priority tests** for all four lifecycle states, including OPEN before meeting date, OPEN on/after meeting date with unknown attendance, CLOSED with no draft, CLOSED with invalid/stale draft, CLOSED ready to publish, and PUBLISHED. Assert exact approved labels and that dates never return an automatic transition.

```ts
it("prioritizes attendance on meeting day without changing OPEN", () => {
  expect(buildHostSessionWorkspace({
    state: "OPEN",
    meetingDate: "2026-08-21",
    today: "2026-08-21",
    unknownAttendanceCount: 2,
    hasRecordDraft: false,
    recordDraftStale: false,
    recordValidationIssueCount: 0,
    hasAppliedRecord: false,
    publicationReady: false,
  })).toMatchObject({
    statusLabel: "멤버와 준비 중",
    primaryAction: { kind: "CHECK_ATTENDANCE", label: "출석 확인하기", panel: "attendance" },
  });
});
```

- [ ] **Step 2: Run RED.**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-session-workspace-model.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure mapping.** Use lexical ISO date comparison only after validating `YYYY-MM-DD`; invalid date falls back to lifecycle-only priority. Return `OPEN_SESSION` for DRAFT, `REVIEW_MEMBER_INPUT` before the meeting, `CHECK_ATTENDANCE` or `FINISH_SESSION` on/after it, `UPLOAD_RECORD → FIX_RECORD → REVIEW_RECORD → PUBLISH_RECORD` for CLOSED, and `VIEW_PUBLIC_RECORD` for PUBLISHED.

- [ ] **Step 4: Write failing navigation compatibility tests.** Assert `section=records&source=json`, `aigen=1`, `records=json`, `section=basic`, and invalid params. Assert URL writes preserve unrelated query/hash and continue emitting legacy `section` keys so bookmarked links remain stable.

```ts
expect(parseHostSessionWorkspaceLocation("?section=records&source=json")).toEqual({
  panel: "records",
  source: "json",
});
expect(buildHostSessionWorkspaceUrl("/app/host/sessions/s-1?from=home#record", {
  panel: "history",
  source: "manual",
})).toBe("/app/host/sessions/s-1?from=home&section=history#record");
```

- [ ] **Step 5: Run RED, implement parser/builder, then run GREEN.**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-session-workspace-model.test.ts features/host/model/host-session-workspace-navigation.test.ts`

Expected: PASS.

- [ ] **Step 6: Focused quality and commit.**

Run: `corepack pnpm --dir front exec eslint features/host/model/host-session-workspace-model.ts features/host/model/host-session-workspace-navigation.ts`

Run: `git diff --check`

Commit: `feat(host): model the session focus workspace`

---

### Task 2: Remove the nested meeting shell and compose one route workspace

**Files:**
- Modify: `front/src/app/host-routes/meeting-route-element.tsx`
- Modify: `front/src/app/host-routes/meeting-route-element.test.tsx`
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/route/host-session-editor-route.test.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/session-editor-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-overview-section.tsx`
- Delete: `front/features/host/ui/session-editor/session-editor-section-nav.tsx`
- Delete: `front/features/host/ui/session-editor/session-editor-section-nav.test.tsx`

**Interfaces:**
- `MeetingRouteElement` renders `EditHostSessionRoute` directly.
- `HostMeetingLedgerRoute` remains available to `HostDashboardRoute`; this task does not remove the dashboard empty/attention behavior.
- `HostSessionEditorRouteData` remains `{ sessionId: string }`; its loader continues prefetching detail, record editor/history, session list, attention and manual dispatches.
- This task keeps the legacy location type internally so the intermediate commit builds. Task 3 migrates every remaining import to `HostSessionWorkspaceLocation` and removes the old module.

- [ ] **Step 1: Replace the route-element test with a failing composition test.** Mock both routes and assert `editor body` is present while `ledger chrome` is absent. Keep the existing editor-route deep-link test for `?section=records&source=json`; Task 3 changes its expected type from `section` to `panel`.

- [ ] **Step 2: Run RED.**

Run: `corepack pnpm --dir front exec vitest run src/app/host-routes/meeting-route-element.test.tsx features/host/route/host-session-editor-route.test.tsx`

Expected: FAIL because the outer ledger still wraps the editor and the route still uses editor-tab navigation.

- [ ] **Step 3: Remove `HostMeetingLedgerRoute` from `MeetingRouteElement`.** Keep return-state continuity and invalidation exactly as today.

```tsx
return (
  <EditHostSessionRoute
    returnTarget={returnTarget}
    LinkComponent={Link}
    hostDashboardReturnTarget={hostDashboardReturnTarget}
    readmatesReturnState={readmatesReturnState}
    onSessionRecordsChanged={onSessionRecordsChanged}
  />
);
```

- [ ] **Step 4: Remove the visible five-section navigation while preserving an intermediate build.** Continue using the current internal `activeSection` switch in this commit, but expose section changes only through existing contextual buttons and deep links. Remove the page-level `tablist`/`tab`/`tabpanel` semantics from `SessionEditorSectionNav`, `SessionOverviewSection` and the shared `Panel`; the record creation-method tabs inside `SessionRecordWorkspace` remain valid. Task 3 replaces the internal switch with Focus Deck disclosures.

- [ ] **Step 5: Keep new-session route behavior isolated.** `NewHostSessionRoute` may continue showing the basic form first, but it uses `panel:"basic"` and does not acquire lifecycle recovery or trash state until creation returns a session id.

- [ ] **Step 6: Run focused GREEN and call-site scan.**

Run: `corepack pnpm --dir front exec vitest run src/app/host-routes/meeting-route-element.test.tsx features/host/route/host-session-editor-route.test.tsx features/host/model/host-session-workspace-navigation.test.ts`

Run: `rg -n "SessionEditorSectionNav|MeetingPhaseRail|role=\"tab(list|panel)?\"" front/src/app/host-routes front/features/host/ui/host-session-editor.tsx front/features/host/ui/session-editor`

Expected: no specific-session call site for section nav or phase rail; any remaining tab-role match is inside `SessionRecordWorkspace` and chooses a record creation method rather than duplicate page navigation. The old navigation model still has call sites until Task 3.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `refactor(host): compose one session workspace route`

---

### Task 3: Build the state-specific Focus Deck and responsive panels

**Files:**
- Create: `front/features/host/ui/session-workspace/host-session-workspace.tsx`
- Create: `front/features/host/ui/session-workspace/host-session-workspace.test.tsx`
- Create: `front/features/host/ui/session-workspace/workspace-header.tsx`
- Create: `front/features/host/ui/session-workspace/workspace-focus-card.tsx`
- Create: `front/features/host/ui/session-workspace/workspace-progress-list.tsx`
- Create: `front/features/host/ui/session-workspace/workspace-panel.tsx`
- Create: `front/features/host/ui/session-workspace/workspace-undo-bar.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/basic-session-panel.tsx`
- Modify: `front/features/host/ui/session-editor/attendance-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-workspace.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-workspace.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-history-panel.tsx`
- Modify: `front/features/host/model/host-session-editor-view-model.ts`
- Modify: `front/features/host/model/host-session-editor-view-model.test.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/route/host-session-editor-route.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/features/host/ui/meeting-ledger/upcoming-book-list.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`
- Delete after call-site migration: `front/features/host/model/host-session-editor-navigation.ts`
- Delete after call-site migration: `front/features/host/model/host-session-editor-navigation.test.ts`
- Delete: `front/features/host/ui/session-editor/session-editor-panel.tsx`
- Delete: `front/features/host/ui/session-editor/session-overview-section.tsx`
- Modify tests for each reused component whose landmark/heading contract changes.

**Visual contract:**
- Header: return link; `No.{number}`; title; date/time/location; exactly one status badge; secondary `모임 정보`, `변경 내역` controls.
- Main column: focus card with one primary action, inline error/retry, then expanded panel content.
- Side rail: compact progress list, draft/save state, next-book context where applicable; `position: sticky` only on desktop.
- Mobile: side content follows main content; primary action is duplicated in a bottom-safe sticky bar wired to the same handler and disabled state.

- [ ] **Step 1: Write failing component tests.** Cover DRAFT, OPEN-before-date, OPEN-meeting-day, CLOSED-import-first, CLOSED-ready, PUBLISHED. Assert one primary button by accessible name, secondary controls are not tabs, and the expected support panel opens. Assert an error stays inside the focus card with `role="alert"` and a retry button.

```tsx
expect(screen.getByText("기록 정리 중")).toBeVisible();
expect(screen.getAllByRole("button", { name: "정리본 올리기" })).toHaveLength(2);
expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
```

The two buttons are desktop/mobile representations; CSS must make exactly one visible at a time and both invoke the same callback.

- [ ] **Step 2: Run RED.**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/session-workspace/host-session-workspace.test.tsx features/host/ui/session-editor/session-record-workspace.test.tsx front/tests/unit/host-session-editor.test.tsx`

Expected: FAIL because workspace components do not exist.

- [ ] **Step 3: Implement semantic primitives and migrate navigation imports.** `WorkspacePanel` renders a heading and disclosure button with `aria-expanded`/`aria-controls`; it is not a tab panel. `WorkspaceUndoBar` renders `role="status"`, change description, `되돌리기`, `변경 내역`, and dismiss. Replace every import found by `rg -l "host-session-editor-navigation|HostSessionEditorLocation|HostSessionEditorSection" front` with Task 1 workspace types before deleting the old module.

- [ ] **Step 4: Recompose existing functions.** Keep all existing basic field values, attendance optimistic queue/rollback, record draft/rebase/import/apply, notification composer, lifecycle confirmation, deletion preview and record revision restore handlers. Remove `activeSection` from basic/attendance/history props, replace the old `Panel` wrapper with `WorkspacePanel`, and move their UI into the appropriate workspace panel instead of reimplementing mutations. Replace `SessionOverviewSection` completely once the Focus Deck owns its remaining lifecycle/import actions.

- [ ] **Step 5: Apply state-specific primary action order.** CLOSED uses JSON upload → preview → commit-to-draft → review/apply → publish. AI generation and manual record editing stay under `다른 방법`. PUBLISHED shows public-result link when available and `수정본 만들기`, which opens records without unpublishing.

- [ ] **Step 6: Add CSS with existing tokens.** Use a max content width, `minmax(0,1fr)` main, 280–320px rail, 16–24px gaps, existing surface/line/text variables, visible focus rings, `scroll-margin-top`, `env(safe-area-inset-bottom)`, and no fixed pixel width on form controls. Remove dead `.rm-meeting-phase-*` and `.rm-host-session-editor__sections` rules only after `rg` proves no remaining call sites.

- [ ] **Step 7: Run focused tests and static checks.**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/session-workspace/host-session-workspace.test.tsx features/host/ui/session-editor/basic-session-panel.test.tsx features/host/ui/session-editor/session-record-workspace.test.tsx front/tests/unit/host-session-editor.test.tsx`

Run: `corepack pnpm --dir front lint`

Expected: PASS.

- [ ] **Step 8: Commit.**

Run: `git diff --check`

Commit: `feat(host): add the session focus deck`

---

### Task 4: Persist mutation snapshots and return change receipts

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V50__host_session_change_snapshots.sql`
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionRecoveryModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionAuditPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionLifecycleAuditPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionDraftCommandService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionAttendanceService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionAuditAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionLifecycleAuditAdapter.kt`
- Modify tests: `HostSessionServicesTest.kt`, `JdbcHostSessionLifecycleAuditAdapterDbTest.kt`, `HostSessionControllerDbTest.kt`, `MySqlFlywayMigrationTest.kt`.

**Schema:**

```sql
alter table host_session_change_audit
  add column before_snapshot_json longtext,
  add column after_snapshot_json longtext,
  add column restored_from_change_id char(36),
  add constraint host_session_change_audit_before_json_check
    check (before_snapshot_json is null or json_valid(before_snapshot_json)),
  add constraint host_session_change_audit_after_json_check
    check (after_snapshot_json is null or json_valid(after_snapshot_json));
```

Do not add a self foreign key: purge deletes a session's change rows in one bounded cleanup and restore lineage remains JSON/audit metadata until then.

**Interfaces:**

```kotlin
enum class HostSessionChangeKind { BASIC_INFO, ATTENDANCE, LIFECYCLE }

data class HostSessionChangeReceipt(
    val changeId: UUID,
    val kind: HostSessionChangeKind,
    val undoAvailable: Boolean,
)
```

Add `val changeReceipt: HostSessionChangeReceipt? = null` to `HostSessionDetailResponse` and `HostAttendanceResponse`. Query detail returns null. A changed mutation returns a receipt; idempotent/no-op mutation returns null.

- [ ] **Step 1: Write failing service tests.** Basic update must pass before/after snapshots and return the exact audit receipt. Attendance must return one receipt for the batch and include transitions. Lifecycle changed result must return the UUID created by `HostSessionLifecycleAuditPort.record`; unchanged transition has no receipt.

- [ ] **Step 2: Run RED.**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionServicesTest`

Expected: FAIL on missing receipt types and changed audit signatures.

- [ ] **Step 3: Change ports before adapters.** Use these signatures:

```kotlin
fun recordBasicUpdate(
    host: CurrentMember,
    sessionId: UUID,
    before: HostSessionBasicAuditSnapshot,
    after: HostSessionBasicAuditSnapshot,
    changedFields: Set<String>,
    restoredFromChangeId: UUID? = null,
): HostSessionChangeReceipt

fun recordAttendanceUpdate(
    host: CurrentMember,
    sessionId: UUID,
    transitions: List<HostAttendanceAuditTransition>,
    restoredFromChangeId: UUID? = null,
): HostSessionChangeReceipt

fun HostSessionLifecycleAuditPort.record(entry: HostSessionLifecycleAuditEntry): UUID?
```

The JDBC lifecycle adapter creates the UUID before insert and returns it; the noop returns null.

- [ ] **Step 4: Persist canonical snapshots.** Basic before/after JSON uses `HostSessionBasicAuditSnapshot`; attendance JSON uses sorted `HostAttendanceAuditTransition` entries. Never log serialized JSON. `changed_fields_json` remains backward-compatible for history readers.

- [ ] **Step 5: Return receipts from application services.** Use `detail.copy(changeReceipt = receipt)` and `attendance.copy(changeReceipt = receipt)`. Lifecycle uses kind `LIFECYCLE` and the lifecycle audit UUID.

- [ ] **Step 6: Add DB/API tests.** Assert JSON columns, lineage null, receipt in PATCH/attendance/lifecycle response, and legacy V39 rows with null snapshots remain readable but non-restorable.

- [ ] **Step 7: Run focused GREEN.**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionServicesTest`

Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.session.adapter.out.persistence.JdbcHostSessionLifecycleAuditAdapterDbTest --tests com.readmates.support.MySqlFlywayMigrationTest`

Expected: PASS.

- [ ] **Step 8: Commit.**

Run: `git diff --check`

Commit: `feat(server): issue recoverable session change receipts`

---

### Task 5: Add conflict-safe restore preview/commit and history recovery metadata

**Files:**
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionRecoveryUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionRecoveryPort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionRecoveryService.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionRecoveryAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionRecoveryController.kt`
- Create: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionRecoveryServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionRecoveryControllerDbTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapterDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/HostSessionHistoryQueryServiceTest.kt`

**HTTP contract:**

```text
GET  /api/host/sessions/{sessionId}/changes/{changeId}/restore-preview
POST /api/host/sessions/{sessionId}/changes/{changeId}/restore
body: { "expectedCurrentHash": "64 lowercase hex chars" }
```

```kotlin
data class HostSessionRestorePreview(
    val sessionId: UUID,
    val changeId: UUID,
    val kind: HostSessionChangeKind,
    val items: List<HostSessionRestoreItem>,
    val expectedCurrentHash: String,
    val canRestore: Boolean,
    val blockedReason: String?,
)

data class HostSessionRestoreItem(
    val field: String,
    val subjectId: UUID? = null,
    val currentValue: String?,
    val targetValue: String?,
    val sensitive: Boolean = false,
)
```

- [ ] **Step 1: Write failing unit tests.** Cover basic restore, attendance restore, missing snapshot, another club's change, removed attendance participant, already-restored lineage, and stale expected hash. No partial attendance restore is allowed.

- [ ] **Step 2: Run RED.**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionRecoveryServiceTest`

Expected: FAIL because recovery ports/service do not exist.

- [ ] **Step 3: Implement affected-field hashing.** Serialize a sorted map containing only the audit row's changed basic fields or attendance membership IDs and their current states, then SHA-256 UTF-8 bytes. Lock the session and affected participant rows in commit, rebuild the same map, compare using constant-time byte comparison, and throw `HostSessionRestoreStaleException` on mismatch.

- [ ] **Step 4: Implement all-or-nothing restore.** For basic fields, construct a complete valid `UpdateHostSessionCommand` by combining current snapshot with target values only for changed fields. For attendance, require every referenced participant to remain ACTIVE and restore all transitions in one command. The new audit row references `restored_from_change_id=changeId` and produces a new receipt, making undo itself undoable.

- [ ] **Step 5: Redact sensitive preview fields.** For `meetingUrl` and `meetingPasscode`, return `currentValue=null`, `targetValue=null`, `sensitive=true`; still include raw values in the server-side hash and restore command. Assert response JSON and captured logs do not contain fixture values.

- [ ] **Step 6: Add error mappings and exact CSRF matcher.** Map not found to 404, non-restorable to 409 `HOST_SESSION_CHANGE_NOT_RESTORABLE`, stale to 409 `HOST_SESSION_RESTORE_STALE`. Add only:

```kotlin
methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/changes/[^/]+/restore$"))
```

- [ ] **Step 7: Extend history metadata.** Add:

```kotlin
data class HostSessionHistoryRecovery(
    val action: String,
    val availability: String,
    val blockedReason: String? = null,
)
```

Audit rows with complete snapshots expose `RESTORE_CHANGE`; record revisions expose `RESTORE_RECORD_DRAFT`; lifecycle rows expose `REVERSE_LIFECYCLE` only when current state makes the corresponding one-step inverse valid. Legacy snapshot-null rows expose `availability=UNAVAILABLE`. The UI must not infer availability from type alone.

- [ ] **Step 8: Add integration/history tests.** Prove host ownership, preview→commit, interleaved edit 409, redaction, history lineage, record-draft behavior unchanged, and lifecycle recovery availability.

- [ ] **Step 9: Run GREEN.**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionRecoveryServiceTest --tests com.readmates.sessionrecord.application.service.HostSessionHistoryQueryServiceTest`

Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionRecoveryControllerDbTest --tests com.readmates.sessionrecord.adapter.out.persistence.JdbcHostSessionHistoryAdapterDbTest`

Expected: PASS.

- [ ] **Step 10: Commit.**

Run: `git diff --check`

Commit: `feat(server): restore session changes without overwriting newer work`

---

### Task 6: Wire immediate undo and later history restore into the workspace

**Files:**
- Create: `front/features/host/api/host-session-recovery-contracts.ts`
- Create: `front/features/host/api/host-session-recovery-contracts.test.ts`
- Create: `front/features/host/api/host-session-recovery-api.ts`
- Create: `front/features/host/api/host-session-recovery-api.test.ts`
- Create: `front/features/host/queries/host-session-recovery-queries.ts`
- Create: `front/features/host/queries/host-session-recovery-queries.test.tsx`
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-session-record-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/route/host-session-editor-actions.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/session-history-panel.tsx`
- Modify: `front/features/host/model/host-session-editor-view-model.ts` and `.test.ts`
- Modify: `front/features/host/ui/session-workspace/workspace-undo-bar.tsx` and workspace tests.

**Frontend contract:**

```ts
export type HostSessionChangeReceipt = {
  changeId: string;
  kind: "BASIC_INFO" | "ATTENDANCE" | "LIFECYCLE";
  undoAvailable: boolean;
};
export type HostSessionRestoreRequest = { expectedCurrentHash: string };
```

- [ ] **Step 1: Write failing Zod/API/query tests.** Parse optional receipts on detail and attendance responses. Change `saveHostSessionAttendance` from a raw `Response` helper to a parsed `HostAttendanceResponse` helper so its receipt is available without a second request. Parse strict restore preview including redacted items. Assert POST body and scoped `clubSlug` context. Assert successful restore invalidates detail, history, list, dashboard/current, closing status and recovery preview keys.

- [ ] **Step 2: Run RED.**

Run: `corepack pnpm --dir front exec vitest run features/host/api/host-session-recovery-contracts.test.ts features/host/api/host-session-recovery-api.test.ts features/host/queries/host-session-recovery-queries.test.tsx`

Expected: FAIL because recovery modules do not exist.

- [ ] **Step 3: Implement contract/API/query modules.** Use `readmatesFetch`/`readmatesFetchResponse` with the same scoped context and error conversion patterns as `host-api.ts`. Do not duplicate global API client behavior.

- [ ] **Step 4: Capture mutation receipts.** Basic save, attendance save and lifecycle result set a single route-level `pendingUndo`. Attendance optimistic behavior remains per-member queued; only the server-confirmed receipt replaces the undo bar. Failed mutation leaves form input/status and does not create a receipt.

- [ ] **Step 5: Implement undo dispatch.** BASIC_INFO/ATTENDANCE: fetch preview, present concise confirm dialog, POST its hash. LIFECYCLE: call existing one-step inverse with `{reasonCode:"ACCIDENTAL_TRANSITION"}`. If preview says unavailable or commit returns stale, keep the bar, show inline explanation, and link to `변경 내역`.

- [ ] **Step 6: Extend history UI by server recovery metadata.** `RESTORE_CHANGE` uses preview/commit; `RESTORE_RECORD_DRAFT` keeps existing draft confirmation; `REVERSE_LIFECYCLE` uses existing reason dialog. Render a disabled explanation instead of a misleading button when availability is not `AVAILABLE`.

- [ ] **Step 7: Add interaction tests.** Cover save→undo, attendance→undo, lifecycle→inverse, stale 409 retaining inputs, history recovery, record revision restore unchanged, dismissal, and focus restoration after dialogs.

- [ ] **Step 8: Run GREEN.**

Run: `corepack pnpm --dir front exec vitest run features/host/api/host-session-recovery-contracts.test.ts features/host/api/host-session-recovery-api.test.ts features/host/queries/host-session-recovery-queries.test.tsx features/host/route/host-session-editor-route.test.tsx features/host/ui/session-workspace/host-session-workspace.test.tsx features/host/model/host-session-editor-view-model.test.ts`

Run: `corepack pnpm --dir front lint`

Expected: PASS.

- [ ] **Step 9: Commit.**

Run: `git diff --check`

Commit: `feat(host): make session changes undoable`

---

### Task 7: Add the trash schema and make active-session visibility structural

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V51__host_session_trash.sql`
- Create: `server/src/test/kotlin/com/readmates/architecture/ActiveSessionProjectionArchitectureTest.kt`
- Modify all normal session read SQL in these files to use `active_sessions`:
  - `server/src/main/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt`
  - `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt`
  - `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationSessionMetaAdapter.kt`
  - `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveDetailQueries.kt`
  - `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveListQueries.kt`
  - `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcMemberArchiveReviewWriteAdapter.kt`
  - `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/MyJourneyQueries.kt`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcHostInvitationStoreAdapter.kt`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberApprovalStoreAdapter.kt`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberLifecycleStoreAdapter.kt`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberProfileStoreAdapter.kt`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcPendingApprovalStoreAdapter.kt`
  - `server/src/main/kotlin/com/readmates/browse/adapter/out/persistence/JdbcGuestRecordBrowseAdapter.kt`
  - `server/src/main/kotlin/com/readmates/browse/adapter/out/persistence/JdbcGuestSessionBrowseAdapter.kt`
  - `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClosingRiskLedgerAdapter.kt`
  - `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`
  - `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt`
  - `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
  - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcHostActionNotificationAdapter.kt`
  - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationDispatchReadQueries.kt`
  - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt`
  - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/SessionScopedNotificationGuard.kt`
  - `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionScheduleDefaultsQueries.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcCurrentSessionAdapter.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionAuditAdapter.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcSessionParticipationWriteAdapter.kt`
  - `server/src/main/kotlin/com/readmates/sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapter.kt`
  - `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt`
  - `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordReadStore.kt`
- Modify write SQL in `HostSessionDraftWriteOperations.kt`, `HostSessionLifecycleWriteOperations.kt`, `HostSessionPublicationWriteOperations.kt`, `HostSessionWriteQueries.kt` to require `deleted_at is null` for existing-session mutation while preserving raw `sessions` for insert and max session number.
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`

**Schema contract:**

```sql
alter table sessions
  add column deleted_at datetime(6),
  add column deleted_by_membership_id char(36),
  add column purge_after datetime(6),
  add constraint sessions_trash_contract_check check (
    (deleted_at is null and deleted_by_membership_id is null and purge_after is null)
    or (deleted_at is not null and deleted_by_membership_id is not null and purge_after is not null)
  );

create index sessions_club_deleted_state_number_idx
  on sessions (club_id, deleted_at, state, number desc);
create index sessions_purge_after_idx on sessions (purge_after, id);
create view active_sessions as
  select * from sessions where deleted_at is null;
```

The same V51 migration drops and recreates `host_session_lifecycle_audit_contract_check` to allow `RESTORED` with `from_state = to_state in ('DRAFT','OPEN')` and `reason_code='OPERATIONAL_RECOVERY'`. This is declared here so Task 8 never edits an already-applied Flyway migration.

- [ ] **Step 1: Write failing migration/architecture tests.** Assert columns, checks, indexes, view and the `RESTORED` lifecycle constraint. The architecture test scans Kotlin SQL for case-insensitive `from sessions`/`join sessions`; it permits `HostSessionDeletionQueries.kt` and only the exact max-number allocation query in `HostSessionWriteQueries.kt`. All normal readers must use `active_sessions`.

- [ ] **Step 2: Run RED.**

Run: `./server/gradlew -p server unitTest --tests com.readmates.architecture.ActiveSessionProjectionArchitectureTest`

Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`

Expected: FAIL before the migration and SQL replacements.

- [ ] **Step 3: Add V51 and replace normal reads mechanically.** Preserve aliases and selected columns. Do not change joins to lifecycle audit because that table intentionally survives purge.

- [ ] **Step 4: Harden write paths.** Every update/select-for-write of an existing session must include `deleted_at is null` or join `active_sessions`. Deleted sessions must behave as not found outside trash/recovery endpoints.

- [ ] **Step 5: Verify query plans.** Update expected table/view plan assertions and prove host list/current/public browse continue using club/state/access indexes through the mergeable view. Add an index only if `EXPLAIN` shows a regression.

- [ ] **Step 6: Run GREEN and source scan.**

Run: `./server/gradlew -p server unitTest --tests com.readmates.architecture.ActiveSessionProjectionArchitectureTest`

Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest --tests com.readmates.performance.MySqlQueryPlanTest`

Run: `rg -n -i "\b(from|join)\s+sessions\b" server/src/main/kotlin`

Expected: only the architecture-test allowlist's trash and allocation reads remain.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `feat(server): isolate trashed sessions from active reads`

---

### Task 8: Move deletions to a 7-day trash, restore safely, and purge in batches

**Files:**
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionTrashModels.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionTrashUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionTrashService.kt`
- Create: `server/src/main/kotlin/com/readmates/session/config/HostSessionTrashProperties.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/in/scheduling/HostSessionTrashScheduler.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionTrashController.kt`
- Create: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionTrashServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionTrashControllerDbTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionLifecycleModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionDeletionPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionDeletionTransaction.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDeletionQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionLifecycleController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapter.kt`
- Modify existing deletion, lifecycle audit, history, security, operational metrics and DB tests.

**HTTP contract:**

```text
DELETE /api/host/sessions/{sessionId}              -> move to trash
GET    /api/host/sessions/trash?limit=50&cursor=  -> cursor page
GET    /api/host/sessions/{sessionId}/trash       -> tombstone detail
POST   /api/host/sessions/{sessionId}/restore     -> active detail
```

```kotlin
data class HostSessionTrashResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val trashed: Boolean,
    val deletedAt: String,
    val purgeAfter: String,
    val counts: HostSessionDeletionCounts,
)
```

- [ ] **Step 1: Write failing service tests.** Cover 7-day server-time calculation, existing state/blocker rules, child preservation, DRAFT restore, OPEN restore, other-OPEN conflict, cross-club not found, expired 410, idempotent scheduler batches, and cache invalidation after trash/restore/purge.

- [ ] **Step 2: Run RED.**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionTrashServiceTest --tests com.readmates.session.application.service.HostSessionServicesTest`

Expected: FAIL because deletion still physically removes rows.

- [ ] **Step 3: Change deletion transaction semantics.** Keep `lockAndAssess` and blocker checks. Record lifecycle `DELETED`, then atomically set `deleted_at=utc_timestamp(6)`, `deleted_by_membership_id`, `purge_after=date_add(deleted_at, interval 7 day)`. Return `trashed=true`; do not call child deletion.

- [ ] **Step 4: Implement trash list/detail/restore.** Cursor is `(deleted_at,id)` descending and uses the shared cursor conventions. Restore locks the row, checks `purge_after > utc_timestamp(6)`, checks another OPEN for OPEN rows, nulls all trash columns, records new lifecycle action `RESTORED` from the preserved state to the same state with reason `OPERATIONAL_RECOVERY`, then invalidates cache.

- [ ] **Step 5: Record restore history against the V51 contract.** Add `SESSION_RESTORED` history type and map the already-migrated `RESTORED` action. `DELETED` UI label becomes `휴지통으로 이동`. Do not modify V51 after Task 7 has committed it.

- [ ] **Step 6: Implement bounded purge.** `HostSessionTrashService.purgeExpired(limit: Int): Int` selects at most the configured batch with `for update skip locked`, deletes child rows in the existing proven FK order, deletes the session, and leaves lifecycle/AI audit evidence. `HostSessionTrashScheduler` calls it at a configurable fixed delay, default one hour, with default batch 50. The scheduler catches/logs a failure without looping unboundedly; the service remains transactional and independently testable.

- [ ] **Step 7: Preserve expired semantics after physical purge.** Restore/detail checks the latest lifecycle action among `DELETED` and `RESTORED` when the session row is absent. A latest `DELETED` returns `410 HOST_SESSION_TRASH_EXPIRED`; latest `RESTORED` or no matching audit stays 404.

- [ ] **Step 8: Add exact CSRF matcher and DB/API tests.** Add POST `/restore` only. Test list cursor, ownership, child preservation before purge, physical deletion after purge, durable lifecycle audit, and no exposure through host/member/guest/public APIs.

- [ ] **Step 9: Run GREEN.**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionTrashServiceTest --tests com.readmates.session.application.service.HostSessionOperationalMetricsTest`

Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionTrashControllerDbTest --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.session.api.CurrentSessionControllerDbTest --tests com.readmates.browse.api.GuestBrowseControllerDbTest --tests com.readmates.publication.api.PublicControllerDbTest --tests com.readmates.archive.api.ArchiveAndNotesDbTest`

Expected: PASS.

- [ ] **Step 10: Commit.**

Run: `git diff --check`

Commit: `feat(server): retain deleted sessions in a seven day trash`

---

### Task 9: Show same-page tombstones and a restorable trash list

**Files:**
- Create: `front/features/host/ui/session-workspace/workspace-trash-tombstone.tsx`
- Create: `front/features/host/ui/session-workspace/workspace-trash-tombstone.test.tsx`
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/model/host-view-types.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/route/host-session-editor-actions.ts`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/model/host-session-ledger-model.ts` and `.test.ts`
- Modify: `front/features/host/route/host-session-ledger-data.ts`
- Modify: `front/features/host/route/host-session-ledger-route.tsx`
- Modify: `front/features/host/ui/host-session-ledger.tsx` and tests.

**Frontend types:**

```ts
export type HostSessionTrashItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  state: SessionState;
  deletedAt: string;
  purgeAfter: string;
};
export type HostSessionTrashPage = {
  items: HostSessionTrashItem[];
  nextCursor: string | null;
};
```

- [ ] **Step 1: Write failing API/query/loader tests.** Assert DELETE parses `trashed`, trash list/detail/restore paths, scoped context, invalidations, and loader fallback only when active detail is 404. A 401/403/500 must not trigger trash fallback.

- [ ] **Step 2: Run RED.**

Run: `corepack pnpm --dir front exec vitest run features/host/queries/host-session-queries.test.ts features/host/route/host-session-editor-route.test.tsx features/host/ui/session-workspace/workspace-trash-tombstone.test.tsx`

Expected: FAIL because trash contracts and tombstone do not exist.

- [ ] **Step 3: Keep deletion on the same URL.** On successful DELETE, replace the active workspace body with `WorkspaceTrashTombstone` using the response. Do not navigate to the list. The restore button calls POST, replaces query data with active detail, clears trash detail, invalidates all session surfaces, and restores focus to the workspace heading.

- [ ] **Step 4: Add refresh fallback.** In `hostSessionEditorLoaderFactory`, fetch active detail first. On exact 404, fetch trash detail and return `mode:"trash"`; skip record editor/history/manual dispatch prefetch for a tombstone. The active editor route makes the same distinction when query state changes after load.

- [ ] **Step 5: Add ledger view mode.** Extend URL model with `view="active"|"trash"`; canonical active URL omits `view`, trash uses `?view=trash`. The session ledger header offers a secondary `휴지통` link, not another equal primary tab. Trash view hides active record filters, shows deletion date and server-derived remaining-day copy, supports cursor loading and inline restore.

- [ ] **Step 6: Implement expiry/error UX.** `410` disables restore and says `복원 기간이 지났습니다.`; other errors preserve tombstone/list position and show `다시 시도`. Client remaining-time copy is display-only; server response decides restore eligibility.

- [ ] **Step 7: Add responsive/accessibility tests.** Assert tombstone heading/description, `aria-live` restore success, focus return, no tablist, no duplicate visible primary CTA at a single media state, and bottom padding for sticky CTA.

- [ ] **Step 8: Run GREEN.**

Run: `corepack pnpm --dir front exec vitest run features/host/queries/host-session-queries.test.ts features/host/route/host-session-editor-route.test.tsx features/host/model/host-session-ledger-model.test.ts features/host/ui/host-session-ledger.test.tsx features/host/ui/session-workspace/workspace-trash-tombstone.test.tsx`

Run: `corepack pnpm --dir front lint`

Expected: PASS.

- [ ] **Step 9: Commit.**

Run: `git diff --check`

Commit: `feat(host): restore sessions from the workspace trash`

---

### Task 10: Prove the full host journey, BFF contract, responsive layout and accessibility

**Files:**
- Modify: `front/tests/e2e/host-club-operations.spec.ts`
- Modify if deterministic DB helpers are needed: `front/tests/e2e/readmates-e2e-db.ts`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionBffSecurityTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`

**Journey matrix:**

| State | Required browser assertion |
| --- | --- |
| DRAFT | `모임 작성 중`, one visible `멤버와 준비 시작`, basic edit preserves input on failed save |
| OPEN before date | `멤버와 준비 중`, member-response guidance, no automatic close |
| OPEN meeting day | attendance primary action, optimistic rollback on rejected update, explicit finish |
| CLOSED | JSON upload → preview → draft → apply → publish in one workspace |
| PUBLISHED | `공개 완료`, result view, `수정본 만들기`, no forced unpublish |
| Recovery | basic/attendance undo; stale restore conflict; history restore; lifecycle inverse |
| Trash | delete → same URL tombstone → refresh → restore; trash list restore; expired 410 |

- [ ] **Step 1: Add failing BFF tests.** Parameterize POST paths `/api/host/sessions/s-1/changes/c-1/restore` and `/api/host/sessions/s-1/restore`; assert exact browser origin and `X-Readmates-Client-Contract:v2` are required and valid calls forward generically. Do not edit `front/functions/api/bff/[[path]].ts`.

- [ ] **Step 2: Add failing server security/Zod contract tests.** Assert host-only recovery/trash mutations, viewer/member rejection, other-club 404, and frontend schema acceptance of new optional receipt/recovery/trash fields.

- [ ] **Step 3: Add the serial Playwright journey.** Reuse public-safe seeded fixtures. Use deterministic dates and synthetic member names. Keep mutations bounded and clean created sessions in `afterEach`. Do not send email or invoke AI.

- [ ] **Step 4: Add viewport proof.** Capture session workspace screenshots at 320×844, 390×844, 768×1024, and 1280×720 for DRAFT, CLOSED and tombstone. At each viewport assert `document.documentElement.scrollWidth <= window.innerWidth`, focused controls remain visible above sticky CTA, dialogs fit viewport, and desktop has no old phase rail/tablist text.

- [ ] **Step 5: Add keyboard/landmark assertions.** Tab through header secondary controls, primary CTA, panel disclosures, form controls, undo and dialogs. Assert Escape close/focus restoration, visible focus, one `<main>`, ordered headings, `role=alert` for actionable failures and `role=status`/`aria-live` for success.

- [ ] **Step 6: Run focused proof.**

Run: `corepack pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts`

Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionBffSecurityTest --tests com.readmates.contract.FrontendZodSchemaContractTest`

Run: `corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts`

Expected: PASS with screenshot artifacts under Playwright's test output only; do not commit generated screenshots unless the repository already tracks the exact snapshot path.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `test(host): cover the focus workspace recovery journey`

---

### Task 11: Update active docs and run release-level verification

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`
- Verify: `docs/superpowers/specs/2026-08-21-host-session-focus-workspace-redesign-design.md`
- Verify: `docs/superpowers/plans/2026-08-21-host-session-focus-workspace-redesign.md`

- [ ] **Step 1: Update architecture.** Document Focus Deck route ownership, legacy deep-link meaning, mutation receipt/restore hash contract, snapshot redaction boundary, `active_sessions` rule and exception allowlist, 7-day trash lifecycle, OPEN restore conflict, bounded purge scheduler, and generic BFF boundary.

- [ ] **Step 2: Add one `CHANGELOG.md` Unreleased entry.** Describe the host workflow redesign, recoverable edits and 7-day trash in user language; do not claim production deployment.

- [ ] **Step 3: Run docs safety checks.**

Run: `git diff --check -- docs/development/architecture.md CHANGELOG.md docs/superpowers/specs/2026-08-21-host-session-focus-workspace-redesign-design.md docs/superpowers/plans/2026-08-21-host-session-focus-workspace-redesign.md`

Run: `rg -n "([/]Users[/]|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|api[_-]?key\s*[:=]|token\s*[:=])" docs/development/architecture.md CHANGELOG.md docs/superpowers/specs/2026-08-21-host-session-focus-workspace-redesign-design.md`

Expected: no private path, key, or token match.

- [ ] **Step 4: Run full frontend gates.**

Run: `corepack pnpm --dir front lint`

Run: `corepack pnpm --dir front test`

Run: `corepack pnpm --dir front build`

- [ ] **Step 5: Run full server gates.**

Run: `./scripts/server-ci-check.sh`

Run: `./server/gradlew -p server integrationTest`

- [ ] **Step 6: Run end-to-end gate.**

Run: `corepack pnpm --dir front test:e2e`

- [ ] **Step 7: Inspect final diff and public safety.**

Run: `git diff --check`

Run: `git status --short --branch`

Run: `git diff --stat origin/main...HEAD`

Run: `rg -n -i "\b(from|join)\s+sessions\b" server/src/main/kotlin`

Expected: only approved raw-session exception files; no untracked generated evidence; no unrelated user files in commits.

- [ ] **Step 8: Commit documentation.**

Commit: `docs: document the recoverable host session workspace`

## Completion Evidence

The implementation is complete only when all of the following are attached to the final handoff:

- Exact focused and full commands run with exit status.
- Browser evidence for DRAFT, OPEN, CLOSED, PUBLISHED, undo conflict, tombstone and restore at desktop and mobile widths.
- Proof that old `section=records` and `source=json|ai` URLs open the intended panel without visible nested page tabs.
- DB/API proof that trash preserves children for seven days, active/member/guest/public reads hide the row, restore preserves data, and purge removes it after expiry.
- Redaction proof for meeting URL/passcode restore previews and logs.
- `git diff --check`, branch status, commit list and any skipped validation with reason.
- Remaining risk statement. If all local checks pass, the remaining operational risk is scheduler timing/configuration and production-data scale; do not state production readiness without deployment/observability evidence.
