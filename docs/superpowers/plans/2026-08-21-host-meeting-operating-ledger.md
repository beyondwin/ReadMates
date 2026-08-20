# Host Meeting Operating Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트 홈을 지금 다루는 한 모임 장부로 바꿔, 만들기 → 열기 → 마치기 → 다음 책 목록 → 정리본 올리기 → 반영 → 공개를 처음 쓰는 운영자도 같은 화면에서 끝내게 한다.

**Architecture:** 서버 상태 `DRAFT|OPEN|CLOSED|PUBLISHED`와 한 `OPEN` 규칙은 유지한다. 프론트 `features/host`가 단계 모델·카피·목록 규칙을 소유하고, 기존 lifecycle·access-scope·session-import API를 운영 순서에 맞게 부른다. 추가 서버 표면은 호스트 전용 `GET /api/host/sessions/schedule-defaults`와 `DRAFT` 삭제 허용뿐이다. 스키마 변경 없다.

**Tech Stack:** React Router 8, TanStack Query v5, Vite frontend; Kotlin/Spring Boot session slice; MySQL/JDBC; Vitest; MockMvc/Testcontainers; Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-08-21-host-meeting-operating-ledger-design.md`

## Global Constraints

- 화면 말: 모임. 「세션」「회차」「기록 작업대」「GUEST_READABLE」을 새 주 경로에 쓰지 않는다. 서버 JSON 필드명은 유지한다.
- 클럽당 `OPEN`은 하나. `OPEN + PUBLIC_RECORD` 금지. `reopen`은 기존처럼 `PUBLIC_RECORD`를 `HIDDEN`으로 내린다.
- 멤버에게 보이기는 `PATCH /api/host/sessions/{id}/access-scope`만. 공개 사이트는 `PUBLISHED + PUBLIC_RECORD`만.
- 정리본 주 경로는 `readmates-session-import:v1` preview/commit 후 apply. 녹음→LLM과 큰 피드백 타이핑 칸은 주 버튼이 아니다.
- 브라우저 `confirm()` 금지. 기존 `SessionLifecycleConfirm` dialog 패턴.
- route-first: `src/app` → `features/host/route` → `ui` / `queries` / `model`. model은 React/router/fetch 금지.
- 패키지 매니저: root `packageManager` `pnpm@11.13.1`. 프론트 명령은 `corepack pnpm --dir front ...`.
- 실제 멤버 데이터, 비밀, 로컬 절대 경로, 토큰 모양 예시를 테스트·문서·커밋에 넣지 않는다.
- 커밋은 사용자가 이 계획을 실행하라고 한 뒤에만 한다. 실행 전에 커밋 스텝을 건너뛰지 말고 사용자 권한을 확인한다.

## Handoff

- 요구사항 → task: spec §5–7 → Task 1–6, §8 → Task 7, §11 삭제 → Task 8, §8 멤버 빈 화면 → Task 9, §9 → Task 10–11, §12 → Task 12, 문서 → Task 13, E2E → Task 14.
- 표면: host UI, session API, member home copy. BFF는 allowlist가 막힌 path가 있을 때만 defaults GET을 연다. 신규 OAuth 없음. migration 없음.
- Acceptance matrix 선택: Session lifecycle, Guest/public exposure, Actor/authorization, UI/runtime state.
- 제외: BFF/OAuth 신규, Persistence/migration, Cursor collection(목록은 기존 cursor 재사용).
- 포커스 후 게이트: `corepack pnpm --dir front lint|test|build`, 서버 포커스 뒤 `./scripts/server-ci-check.sh`, 한 바퀴가 늘면 `corepack pnpm --dir front test:e2e`.
- Non-goal: 동시 OPEN 둘, 알림 회수, 녹음 LLM, dual-write 제거, 공개 사이트에 다음 책 미리 올리기.
- 병렬: Task 8·10은 서버 파일이 겹칠 수 있으니 순차. Task 1은 모든 프론트 UI task의 선행.

## File map

| 책임 | 경로 |
| --- | --- |
| 홈이 고르는 모임·단계 | Create `front/features/host/model/host-meeting-ledger-model.ts` + `.test.ts` |
| 운영 카피·확인 문구 | Modify `front/features/host/model/host-session-lifecycle-model.ts` + test |
| canonical 주소 | Modify `front/features/host/model/host-session-editor-navigation.ts` + `host-dashboard-model.ts` `hostSessionEditHref` |
| 라우트 | Modify `front/src/app/routes/host.tsx`, host-routes elements |
| 장부 UI | Create `front/features/host/ui/meeting-ledger/` |
| 기존 에디터 연결 | Modify `front/features/host/route/host-session-editor-route.tsx`, `host-dashboard-route.tsx` |
| 다음에 읽을 책 | Create `front/features/host/ui/meeting-ledger/upcoming-book-list.tsx` |
| 정리본 올리기 | Modify `front/features/host/ui/session-editor/session-record-workspace.tsx` 사용을 장부 모임 후로 옮김 |
| defaults API client | Modify `front/features/host/api/host-api.ts`, `host-contracts.ts`, `host-session-queries.ts` |
| 멤버 빈 화면 | Modify `front/features/member-home/ui/member-home-current-session.tsx` + view-model |
| schedule-defaults | Modify session query port/service/controller + tests |
| DRAFT 삭제 | Modify `HostSessionDeletionQueries.kt` + DbTest |
| 문서 | `docs/development/architecture.md`, `CHANGELOG.md` |

---

### Task 1: Active meeting and phase model

**Files:**
- Create: `front/features/host/model/host-meeting-ledger-model.ts`
- Test: `front/features/host/model/host-meeting-ledger-model.test.ts`

**Interfaces:**
- Consumes: `HostSessionListItem.state`, `sessionId`, `date` from `front/features/host/model/host-view-types.ts`
- Produces: `MeetingPhase`, `resolveActiveMeeting()`, `meetingPhaseFromState()`, `previousRecordAttentionHref()`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  meetingPhaseFromState,
  previousRecordAttentionHref,
  resolveActiveMeeting,
  type MeetingListItem,
} from "./host-meeting-ledger-model";

function item(partial: Partial<MeetingListItem> & Pick<MeetingListItem, "sessionId" | "state">): MeetingListItem {
  return {
    date: "2026-04-15",
    recordStatus: "NOT_STARTED",
    ...partial,
  };
}

describe("meetingPhaseFromState", () => {
  it.each([
    ["DRAFT", "before"],
    ["OPEN", "during"],
    ["CLOSED", "after"],
    ["PUBLISHED", "after"],
  ] as const)("maps %s to %s", (state, phase) => {
    expect(meetingPhaseFromState(state)).toBe(phase);
  });
});

describe("resolveActiveMeeting", () => {
  it("prefers the open meeting", () => {
    expect(resolveActiveMeeting([
      item({ sessionId: "draft-1", state: "DRAFT", date: "2026-06-11" }),
      item({ sessionId: "open-1", state: "OPEN", date: "2026-04-15" }),
      item({ sessionId: "closed-1", state: "CLOSED", date: "2026-03-18" }),
    ])).toEqual({ sessionId: "open-1", phase: "during" });
  });

  it("then prefers the nearest draft by date", () => {
    expect(resolveActiveMeeting([
      item({ sessionId: "later", state: "DRAFT", date: "2026-07-09" }),
      item({ sessionId: "sooner", state: "DRAFT", date: "2026-06-11" }),
      item({ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15" }),
    ])).toEqual({ sessionId: "sooner", phase: "before" });
  });

  it("then prefers the most recent closed meeting", () => {
    expect(resolveActiveMeeting([
      item({ sessionId: "older", state: "CLOSED", date: "2026-01-21" }),
      item({ sessionId: "newer", state: "CLOSED", date: "2026-04-15" }),
    ])).toEqual({ sessionId: "newer", phase: "after" });
  });

  it("returns null when the club has no meetings", () => {
    expect(resolveActiveMeeting([])).toBeNull();
  });
});

describe("previousRecordAttentionHref", () => {
  it("points at the latest closed meeting when home shows a draft", () => {
    expect(previousRecordAttentionHref(
      { sessionId: "draft-1", phase: "before" },
      [
        item({ sessionId: "draft-1", state: "DRAFT", date: "2026-06-11", recordStatus: "NOT_STARTED" }),
        item({ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15", recordStatus: "NOT_STARTED" }),
      ],
    )).toBe("/app/host/sessions/closed-1");
  });

  it("is null when the closed meeting already has a complete record", () => {
    expect(previousRecordAttentionHref(
      { sessionId: "draft-1", phase: "before" },
      [
        item({ sessionId: "draft-1", state: "DRAFT", date: "2026-06-11" }),
        item({ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15", recordStatus: "COMPLETE" }),
      ],
    )).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-meeting-ledger-model.test.ts`
Expected: FAIL because the module is missing.

- [ ] **Step 3: Write minimal implementation**

```ts
export type MeetingPhase = "before" | "during" | "after";
export type MeetingListItem = {
  sessionId: string;
  state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  date: string;
  recordStatus?: "NOT_STARTED" | "INCOMPLETE" | "COMPLETE";
};

export function meetingPhaseFromState(state: MeetingListItem["state"]): MeetingPhase {
  if (state === "DRAFT") return "before";
  if (state === "OPEN") return "during";
  return "after";
}

export function resolveActiveMeeting(items: readonly MeetingListItem[]): { sessionId: string; phase: MeetingPhase } | null {
  const open = items.find((item) => item.state === "OPEN");
  if (open) return { sessionId: open.sessionId, phase: "during" };
  const drafts = items.filter((item) => item.state === "DRAFT").slice().sort((a, b) => a.date.localeCompare(b.date));
  const nearestDraft = drafts[0];
  if (nearestDraft) return { sessionId: nearestDraft.sessionId, phase: "before" };
  const closed = items
    .filter((item) => item.state === "CLOSED" || item.state === "PUBLISHED")
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestClosed = closed[0];
  if (latestClosed) return { sessionId: latestClosed.sessionId, phase: meetingPhaseFromState(latestClosed.state) };
  return null;
}

export function previousRecordAttentionHref(
  active: { sessionId: string; phase: MeetingPhase },
  items: readonly MeetingListItem[],
): string | null {
  if (active.phase !== "before") return null;
  const previous = items
    .filter((item) => item.state === "CLOSED" && item.recordStatus !== "COMPLETE")
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return previous ? `/app/host/sessions/${encodeURIComponent(previous.sessionId)}` : null;
}

export function hostMeetingHref(sessionId: string) {
  return `/app/host/sessions/${encodeURIComponent(sessionId)}`;
}
```

Map `HostSessionListItem` to `MeetingListItem` at the route, not in this file, if the list type already matches.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-meeting-ledger-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** (only if the user asked to execute this plan)

```bash
git add front/features/host/model/host-meeting-ledger-model.ts front/features/host/model/host-meeting-ledger-model.test.ts
git commit -m "$(cat <<'EOF'
feat(host): resolve the active meeting for the operating ledger

EOF
)"
```

---

### Task 2: Operator copy and open confirmation

**Files:**
- Modify: `front/features/host/model/host-session-lifecycle-model.ts`
- Modify: `front/features/host/model/host-session-lifecycle-model.test.ts`

**Interfaces:**
- Consumes: existing `SessionLifecycleConfirmKind`
- Produces: `SessionLifecycleConfirmKind` includes `"open"`; reverse labels from spec §10–11

- [ ] **Step 1: Write the failing assertions**

In `host-session-lifecycle-model.test.ts` change expected copy:

```ts
["OPEN", { kind: "return-to-draft", label: "모임 전으로 되돌리기" }],
["CLOSED", { kind: "reopen", label: "다시 진행 중으로" }],
["PUBLISHED", { kind: "unpublish", label: "공개 취소" }],
```

Add:

```ts
it("returns open confirmation copy", () => {
  expect(lifecycleConfirmCopy("open")).toEqual({
    kind: "open",
    title: "멤버에게 열기",
    body: "멤버 참석과 질문이 시작됩니다.",
    confirmLabel: "멤버에게 열기",
    successFlash: "모임을 열었습니다.",
  });
});
```

Update close/publish/reopen/return-to-draft bodies to spec language:

- close title `모임 마치기`, body `모임을 마치면 참석과 질문이 멈춥니다. 기록은 남습니다.`
- publish title `기록 공개`
- return-to-draft title `모임 전으로 되돌리기`
- reopen title `다시 진행 중으로`

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-session-lifecycle-model.test.ts`
Expected: FAIL on label/copy mismatch.

- [ ] **Step 3: Update the copy module**

```ts
export type SessionLifecycleConfirmKind =
  | "open"
  | "close"
  | "publish"
  | "reopen"
  | "unpublish"
  | "return-to-draft";
```

Fill `confirmCopyByKind.open` and replace Korean strings. `reverseLifecycleAction("OPEN")` returns `{ kind: "return-to-draft", label: "모임 전으로 되돌리기" }`. `openAlreadyExistsMessage()` returns `이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.`

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-session-lifecycle-model.test.ts`
Expected: PASS. Fix any UI tests that snapshot the old strings in the same commit if they fail (`session-overview-section.test.ts`, `session-lifecycle-confirm-dialog.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-session-lifecycle-model.ts front/features/host/model/host-session-lifecycle-model.test.ts
git commit -m "$(cat <<'EOF'
feat(host): use meeting copy and confirm opening

EOF
)"
```

---

### Task 3: Canonical meeting URLs

**Files:**
- Modify: `front/features/host/model/host-session-editor-navigation.ts`
- Modify: `front/features/host/model/host-session-editor-navigation.test.ts`
- Modify: `front/features/host/model/host-dashboard-model.ts` `hostSessionEditHref`
- Modify: any test that expects `/edit` as canonical (`host-dashboard-model.test.ts`, `host-session-editor-navigation.test.ts`)

**Interfaces:**
- Consumes: `hostMeetingHref` from Task 1
- Produces: `hostSessionEditHref(sessionId)` → `/app/host/sessions/{id}`; `parseHostSessionEditorLocation` still reads `section`/`records`/`aigen` for compatibility

- [ ] **Step 1: Write the failing test**

In `host-session-editor-navigation.test.ts` change the preserved URL fixture from `.../edit?` to `.../sessions/session-1?` and expected path without `/edit`.

Add to `host-meeting-ledger-model.test.ts` or dashboard test:

```ts
expect(hostSessionEditHref("abc")).toBe("/app/host/sessions/abc");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-session-editor-navigation.test.ts features/host/model/host-dashboard-model.test.ts`
Expected: FAIL on `/edit` path.

- [ ] **Step 3: Implement**

```ts
export function hostSessionEditHref(sessionId: string) {
  return `/app/host/sessions/${encodeURIComponent(sessionId)}`;
}
```

Update `buildHostSessionEditorUrl` fixtures so they operate on `/app/host/sessions/session-1` without `/edit`. Keep parsing `?section=records&source=json`, `?aigen=1`, `?records=json` as today so old links still open the records area.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-session-editor-navigation.test.ts features/host/model/host-dashboard-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-session-editor-navigation.ts front/features/host/model/host-session-editor-navigation.test.ts front/features/host/model/host-dashboard-model.ts front/features/host/model/host-dashboard-model.test.ts
git commit -m "$(cat <<'EOF'
feat(host): make /app/host/sessions/:id the meeting URL

EOF
)"
```

---

### Task 4: Host routes and redirects

**Files:**
- Modify: `front/src/app/routes/host.tsx` (both scoped and unscoped trees)
- Create: `front/src/app/host-routes/meeting-route-element.tsx`
- Modify: `front/src/app/host-routes/edit-session-route-element.tsx`
- Modify: `front/src/app/host-routes/session-closing-route-element.tsx`
- Test: `front/src/app/routes/host.tsx` if a route table test exists; otherwise `front/features/host/route/host-session-editor-navigation` is already covered — add `front/src/app/host-routes/meeting-redirects.test.ts` that tests loader redirect helpers

**Interfaces:**
- Consumes: `hostMeetingHref`
- Produces: path `sessions/:sessionId` renders the editor/ledger; `sessions/:sessionId/edit` and `sessions/:sessionId/closing` redirect with search preserved

- [ ] **Step 1: Write the failing redirect helper test**

Create `front/src/app/host-routes/meeting-redirects.ts` and test:

```ts
import { describe, expect, it } from "vitest";
import { canonicalMeetingPath } from "./meeting-redirects";

describe("canonicalMeetingPath", () => {
  it("drops /edit and keeps search", () => {
    expect(canonicalMeetingPath("/clubs/demo/app/host/sessions/abc/edit", "?section=records&source=json"))
      .toBe("/clubs/demo/app/host/sessions/abc?section=records&source=json");
  });

  it("maps /closing to the after phase", () => {
    expect(canonicalMeetingPath("/app/host/sessions/abc/closing", ""))
      .toBe("/app/host/sessions/abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run src/app/host-routes/meeting-redirects.test.ts`
Expected: FAIL missing module. If vitest does not include `src/app`, put the helper under `front/features/host/model/host-meeting-redirects.ts` instead and test there.

- [ ] **Step 3: Implement redirects and register `sessions/:sessionId`**

```ts
export function canonicalMeetingPath(pathname: string, search: string): string {
  const next = pathname.replace(/\/(edit|closing)$/, "");
  return `${next}${search}`;
}
```

In `host.tsx` insert `path: "sessions/:sessionId"` **before** `sessions/:sessionId/edit`. The new route uses the existing `hostSessionEditorLoaderFactory` and a thin `MeetingRouteElement` that renders `EditHostSessionRoute`.

`edit` and `closing` route elements:

```tsx
import { Navigate, useLocation, useParams } from "react-router";
import { canonicalMeetingPath } from "./meeting-redirects";

export function EditHostSessionRouteElement() {
  const { sessionId } = useParams();
  const location = useLocation();
  return <Navigate replace to={canonicalMeetingPath(location.pathname, location.search)} />;
}
```

Same for closing. Keep `sessions/new`.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-meeting-ledger-model.test.ts src/app/host-routes/meeting-redirects.test.ts`
Expected: PASS. Run editor route tests if they mount `/edit`.

- [ ] **Step 5: Commit**

```bash
git add front/src/app/routes/host.tsx front/src/app/host-routes
git commit -m "$(cat <<'EOF'
feat(host): redirect edit and closing URLs to the meeting ledger

EOF
)"
```

---

### Task 5: Host home shows the operating ledger

**Files:**
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Create: `front/features/host/ui/meeting-ledger/host-meeting-ledger.tsx`
- Create: `front/features/host/ui/meeting-ledger/meeting-phase-rail.tsx`
- Test: `front/features/host/ui/meeting-ledger/host-meeting-ledger.test.tsx`
- Modify: `front/features/host/ui/host-dashboard.test.tsx` only if index still imports dashboard as the first viewport — replace expectations with ledger empty/active states

**Interfaces:**
- Consumes: `resolveActiveMeeting`, `previousRecordAttentionHref`, `hostSessionListQuery`, `hostCurrentSessionQuery`
- Produces: empty club CTA `첫 모임 만들기` → `/app/host/sessions/new`; otherwise render the meeting for `active.sessionId`

- [ ] **Step 1: Write the failing UI test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { HostMeetingLedger } from "./host-meeting-ledger";

it("asks the host to create the first meeting when none exist", () => {
  render(
    <MemoryRouter>
      <HostMeetingLedger
        items={[]}
        LinkComponent={({ to, children }) => <a href={typeof to === "string" ? to : ""}>{children}</a>}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "첫 모임 만들기" })).toHaveAttribute("href", "/app/host/sessions/new");
});
```

Do not render the old dashboard priority ledger as the first viewport.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/meeting-ledger/host-meeting-ledger.test.tsx`
Expected: FAIL missing module.

- [ ] **Step 3: Implement the shell**

`HostMeetingLedger` uses `resolveActiveMeeting`. Empty state as the test. When active, show `meeting-phase-rail` with labels `모임 전` / `진행 중` / `모임 후` and `aria-current` on the active phase. If `previousRecordAttentionHref` is non-null, show a link `이전 모임 기록 남음`.

Wire `host-dashboard-route.tsx` to render `HostMeetingLedger` with list items from `hostSessionListQuery` (limit 50 is enough for OPEN + drafts + latest closed). Keep members/notifications navigation in the existing host chrome, not inside this card.

Phase body can still mount the existing editor for that `sessionId` in this task; Task 6 restyles primary actions.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/meeting-ledger/host-meeting-ledger.test.tsx features/host/route/host-dashboard-route.test.tsx`
Expected: PASS after dashboard route test updates.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/meeting-ledger front/features/host/route/host-dashboard-route.tsx
git commit -m "$(cat <<'EOF'
feat(host): show the active meeting ledger on host home

EOF
)"
```

---

### Task 6: Phase primary actions and open confirm

**Files:**
- Modify: `front/features/host/ui/session-editor/session-overview-section.tsx`
- Modify: `front/features/host/ui/session-editor/session-lifecycle-confirm-dialog.tsx`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: matching `*.test.tsx`
- Modify: `front/features/host/ui/dashboard/upcoming-session-row.tsx` open button must go through confirm — or remove open from dashboard if home no longer lists upcoming as the opener. Keep confirm on 모임 전 primary `멤버에게 열기`.

**Interfaces:**
- Consumes: `lifecycleConfirmCopy("open"|"close"|...)`, `useOpenHostSessionMutation`
- Produces: DRAFT primary `멤버에게 열기` with confirm; OPEN primary `모임 마치기`; CLOSED primary `정리본 올리기` (can still be a section jump until Task 12) + `기록 공개`; reverse ghost buttons from Task 2

- [ ] **Step 1: Write the failing overview test**

In `session-overview-section.test.tsx` (create if missing):

```tsx
it("asks to open a draft meeting after confirm", () => {
  render(<SessionOverviewSection sessionState="DRAFT" onOpenSession={onOpen} ... />);
  expect(screen.getByRole("button", { name: "멤버에게 열기" })).toBeEnabled();
});
```

Assert OPEN shows `모임 마치기` and `모임 전으로 되돌리기`. Assert no raw `confirm(` in the component (grep in test via not calling window.confirm).

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/session-editor/session-overview-section.test.tsx`
Expected: FAIL — DRAFT currently has no open button (open lives on dashboard).

- [ ] **Step 3: Implement**

Pass `onOpenSession` into overview. Clicking 멤버에게 열기 / 마치기 / 공개 / 되돌리기 only opens `SessionLifecycleConfirmDialog` with `lifecycleConfirmCopy(kind)`. Confirm calls the existing mutation. Add `"open"` to the dialog kind union.

Disable both forward and reverse while `lifecyclePending`. Mobile: forward above reverse.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/session-editor/session-overview-section.test.tsx features/host/ui/session-editor/session-lifecycle-confirm-dialog.test.tsx features/host/route/host-session-editor-route.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/session-editor front/features/host/route/host-session-editor-route.tsx
git commit -m "$(cat <<'EOF'
feat(host): confirm open, close, and revert on the meeting ledger

EOF
)"
```

---

### Task 7: Upcoming book list and member visibility

**Files:**
- Create: `front/features/host/model/upcoming-book-list-model.ts` + test
- Create: `front/features/host/ui/meeting-ledger/upcoming-book-list.tsx` + test
- Modify: meeting ledger to show the list on `during` and `after`
- Reuse: `useSaveHostSessionAccessScopeMutation`, `useCreateHostSessionMutation`

**Interfaces:**
- Consumes: list items with `state === "DRAFT"`, `accessScope`, `date`, `bookTitle`
- Produces: `draftsByDate(items)`, `memberVisibilityLabel(accessScope)`

- [ ] **Step 1: Write the failing model test**

```ts
import { draftsByDate, memberVisibilityLabel } from "./upcoming-book-list-model";

it("orders drafts by date ascending", () => {
  expect(draftsByDate([
    { sessionId: "b", state: "DRAFT", date: "2026-07-09", bookTitle: "B", accessScope: "HOST_ONLY" },
    { sessionId: "a", state: "DRAFT", date: "2026-06-11", bookTitle: "A", accessScope: "GUEST_READABLE" },
    { sessionId: "open", state: "OPEN", date: "2026-04-15", bookTitle: "Now", accessScope: "GUEST_READABLE" },
  ]).map((item) => item.sessionId)).toEqual(["a", "b"]);
});

it("uses member-facing visibility copy", () => {
  expect(memberVisibilityLabel("GUEST_READABLE")).toBe("멤버에게 보이기");
  expect(memberVisibilityLabel("HOST_ONLY")).toBe("호스트만");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run features/host/model/upcoming-book-list-model.test.ts`
Expected: FAIL missing module.

- [ ] **Step 3: Implement list UI**

Each row: book title, date, switch `멤버에게 보이기` calling `saveHostSessionAccessScope({ accessScope: checked ? "GUEST_READABLE" : "HOST_ONLY" })`. Footer button `모임 하나 더` expands the same required fields as 모임 전 (title/author/date) and `POST /api/host/sessions`. Do not call open. Switch default on create comes from Task 11; until then default `HOST_ONLY`.

Show this list on during and after phases. Do not add drag-and-drop.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm --dir front exec vitest run features/host/model/upcoming-book-list-model.test.ts features/host/ui/meeting-ledger/upcoming-book-list.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/upcoming-book-list-model.ts front/features/host/model/upcoming-book-list-model.test.ts front/features/host/ui/meeting-ledger
git commit -m "$(cat <<'EOF'
feat(host): queue upcoming books and toggle member visibility

EOF
)"
```

---

### Task 8: Allow deleting a draft without durable history

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDeletionQueries.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Keep: `HostSessionDeletionHistoryExistsException` for revisions/notification decisions

**Interfaces:**
- Consumes: existing `DELETE /api/host/sessions/{id}` and `GET .../deletion-preview`
- Produces: `DRAFT` with no durable history deletes; `CLOSED`/`PUBLISHED` still `SESSION_DELETE_NOT_ALLOWED`; OPEN rules unchanged

- [ ] **Step 1: Write the failing DB tests**

In `HostSessionControllerDbTest.kt` add:

```kotlin
@Test
fun `host can delete draft session without durable history`() {
    val sessionId = createSession(state = "DRAFT", visibility = "HOST_ONLY", accessScope = "HOST_ONLY")
    mockMvc.delete("/api/host/sessions/$sessionId") { withHost() }
        .andExpect { status { isOk() } }
        .andExpect { jsonPath("$.deleted") { value(true) } }
}

@Test
fun `host cannot delete draft session with record revision history`() {
    val sessionId = createDraftWithRevision()
    mockMvc.delete("/api/host/sessions/$sessionId") { withHost() }
        .andExpect { status { isConflict() } }
        .andExpect { jsonPath("$.code") { value("SESSION_DELETE_HISTORY_EXISTS") } }
}
```

Reuse the existing OPEN history fixture helper if one exists; otherwise insert a `session_record_revisions` row like the OPEN test.

Keep `host cannot delete closed or published session`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest.host can delete draft session without durable history`
Expected: FAIL `SESSION_DELETE_NOT_ALLOWED` because `requireOpenDeletionTarget` allows only OPEN.

- [ ] **Step 3: Implement**

Replace `requireOpenDeletionTarget` with:

```kotlin
private fun requireDeletableTarget(target: HostSessionDeletionTarget) {
    if (target.state != "OPEN" && target.state != "DRAFT") {
        throw HostSessionDeletionNotAllowedException()
    }
}
```

Change SQL `and state = 'OPEN'` to `and state in ('OPEN', 'DRAFT')` in both preview path (no delete) and delete update. Preview `canDelete` remains `!hasDurableHistory`. Rename methods only if tests depend on names — prefer keeping `deleteOpenHostSession` but accepting DRAFT to avoid a wide rename.

- [ ] **Step 4: Run tests**

Run: `./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.session.application.service.HostSessionServicesTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDeletionQueries.kt server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
git commit -m "$(cat <<'EOF'
feat(session): allow deleting draft meetings without durable history

EOF
)"
```

Wire the existing deletion preview dialog on 모임 전 as `목록에서 지우기` in the same task if the button is missing. Reuse `useDeleteHostSessionMutation`.

---

### Task 9: Member empty current meeting shows upcoming books

**Files:**
- Modify: `front/features/member-home/ui/member-home-current-session.tsx`
- Modify: `front/features/member-home/ui/member-home.tsx` if empty current and upcoming are siblings
- Modify: `front/tests/unit/member-home.test.tsx`, `front/tests/unit/current-session.test.tsx`
- Guest copy: `front/features/guest-browse` current empty if it uses the same heading

**Interfaces:**
- Consumes: `upcomingSessions` already loaded on member home
- Produces: when `currentSession === null` and `upcomingSessions.length > 0`, heading is not a dead end

- [ ] **Step 1: Write the failing test**

In `member-home.test.tsx`:

```tsx
it("shows upcoming books when there is no open meeting", () => {
  renderMemberHome({
    current: { currentSession: null },
    upcomingSessions: [{ bookTitle: "다음 책", date: "2026-06-11" }],
  });
  expect(screen.queryByRole("heading", { name: "아직 열린 세션이 없습니다" })).not.toBeInTheDocument();
  expect(screen.getByText("다음 책")).toBeInTheDocument();
  expect(screen.getByText(/참석과 질문은 모임을 연 뒤에 시작/)).toBeInTheDocument();
});
```

Use the actual render helper already in that file. Copy must not say 세션.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run tests/unit/member-home.test.tsx`
Expected: FAIL because empty heading is still shown.

- [ ] **Step 3: Implement**

Pass `upcomingSessions` into the empty current card. If length > 0, title `다음 모임` / book list, helper `참석과 질문은 호스트가 모임을 열면 시작됩니다.` If length === 0, heading `아직 열린 모임이 없습니다` (replace 세션). Host CTA becomes `첫 모임 만들기` linking `/app/host/sessions/new`.

Update guest current empty the same way using guest upcoming data already on that route.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm --dir front exec vitest run tests/unit/member-home.test.tsx tests/unit/current-session.test.tsx`
Expected: PASS. Update e2e `guest-browsing.spec.ts` heading if it asserts the old string.

- [ ] **Step 5: Commit**

```bash
git add front/features/member-home front/tests/unit/member-home.test.tsx front/tests/unit/current-session.test.tsx
git commit -m "$(cat <<'EOF'
feat(member): connect empty current meeting to upcoming books

EOF
)"
```

---

### Task 10: Schedule defaults API

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt` (add `HostSessionScheduleDefaults`)
- Modify: `HostSessionQueryUseCase`, `HostSessionQueryPort`, `HostSessionQueryService`, `HostSessionQueries` / new `HostSessionScheduleDefaultsQueries.kt`
- Modify: `HostSessionController.kt` `@GetMapping("/schedule-defaults")`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionScheduleDefaultsTest.kt` for pure majority/median logic
- Security: GET needs no CSRF ignore. Confirm `GET /api/host/**` is authenticated host. Non-host 403.

**Interfaces:**
- Consumes: last 10 `sessions` rows for `host.clubId` ordered by `session_date DESC, number DESC`
- Produces:

```kotlin
data class HostSessionScheduleDefaults(
    val startTime: String,
    val endTime: String,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
    val accessScope: SessionAccessScope,
    val suggestedDate: String?,
    val questionDeadlineOffsetDays: Long,
    val hints: List<String>,
)
```

- [ ] **Step 1: Write failing unit tests for the policy object**

Create `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionScheduleDefaultsPolicy.kt` as an `internal object` and test in `server/src/test/kotlin/com/readmates/session/adapter/out/persistence/HostSessionScheduleDefaultsPolicyTest.kt`:

```kotlin
@Test
fun `uses majority start and end time`() {
    val samples = List(7) { sample(start = "19:30:00", end = "21:30:00") } +
        List(3) { sample(start = "20:00:00", end = "22:00:00") }
    val defaults = HostSessionScheduleDefaultsPolicy.from(samples)
    assertEquals("19:30", defaults.startTime)
    assertEquals("21:30", defaults.endTime)
}

@Test
fun `leaves date empty when only one past meeting exists`() {
    val defaults = HostSessionScheduleDefaultsPolicy.from(listOf(sample(date = LocalDate.parse("2026-04-15"))))
    assertNull(defaults.suggestedDate)
}

@Test
fun `does not copy book fields`() {
    val defaults = HostSessionScheduleDefaultsPolicy.from(listOf(sample(bookTitle = "Secret Book")))
    assertFalse(defaults.toString().contains("Secret Book"))
}
```

Define `from` to ignore book fields entirely.

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server test --tests com.readmates.session.adapter.out.persistence.HostSessionScheduleDefaultsPolicyTest`
Expected: FAIL missing type.

- [ ] **Step 3: Implement policy + query + controller**

Policy rules from spec §9:

- Majority (`count * 2 > n`) else latest meeting for time/location.
- Meeting URL/passcode from the latest row that has a URL; passcode only if that same row is used.
- `accessScope` majority else `HOST_ONLY`.
- Date: if `n >= 2`, median gap of consecutive dates (sorted ascending); snap to majority weekday when that weekday is majority; format `YYYY-MM-DD`. If `n < 2`, `suggestedDate = null`.
- `questionDeadlineOffsetDays` majority of `session_date - deadline.toLocalDate` else `1`.
- Empty samples: start `20:00`, end `22:00`, location `온라인`, access `HOST_ONLY`, date null, offset 1, hints empty.
- Hints like `이전 모임과 같은 시간으로 넣었습니다.` when time came from a pattern.

SQL (club scoped, limit 10):

```sql
select session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
       access_scope, question_deadline_at
from sessions
where club_id = ?
order by session_date desc, number desc
limit 10
```

Controller:

```kotlin
@GetMapping("/schedule-defaults")
fun scheduleDefaults(member: CurrentMember) = hostSessionQueryUseCase.scheduleDefaults(member)
```

Place this mapping on `HostSessionController` next to list, not as `/{sessionId}`.

Do not log passcode. Do not add passcode to metrics.

DbTest: host 200; viewer/member 403; second club's times do not leak. Response JSON keys match the data class. `meetingPasscode` may be present in JSON for the host form only.

- [ ] **Step 4: Run tests**

Run: `./server/gradlew -p server test --tests com.readmates.session.adapter.out.persistence.HostSessionScheduleDefaultsPolicyTest --tests com.readmates.session.api.HostSessionControllerDbTest`
Expected: PASS including existing list/detail tests (schedule-defaults must not be parsed as a session id).

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/session
git commit -m "$(cat <<'EOF'
feat(session): suggest schedule defaults from the last ten meetings

EOF
)"
```

If Pages Functions host GET allowlist is path-explicit, add `/api/host/sessions/schedule-defaults`. If it already proxies all `/api/host/**`, do not add policy.

---

### Task 11: Prefill create and “모임 하나 더” from defaults

**Files:**
- Modify: `front/features/host/api/host-api.ts`, `host-contracts.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: 모임 전 form / new session route / upcoming add form
- Test: `front/features/host/api/host-api.test.ts`, form test

**Interfaces:**
- Consumes: `HostSessionScheduleDefaults` JSON
- Produces: `fetchHostSessionScheduleDefaults(context)`, `hostSessionKeys.scheduleDefaults`, `applyScheduleDefaults(form, defaults)` that does not overwrite non-empty fields

- [ ] **Step 1: Write the failing mapper test**

```ts
it("fills empty time and keeps typed book title", () => {
  const next = applyScheduleDefaults(
    { bookTitle: "새 책", bookAuthor: "", date: "", startTime: "", endTime: "", locationLabel: "" },
    {
      startTime: "19:30",
      endTime: "21:30",
      locationLabel: "온라인",
      meetingUrl: null,
      meetingPasscode: null,
      accessScope: "GUEST_READABLE",
      suggestedDate: "2026-06-11",
      questionDeadlineOffsetDays: 1,
      hints: ["이전 모임과 같은 시간으로 넣었습니다."],
    },
  );
  expect(next.startTime).toBe("19:30");
  expect(next.date).toBe("2026-06-11");
  expect(next.bookTitle).toBe("새 책");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-schedule-defaults-model.test.ts`
Expected: FAIL missing function.

- [ ] **Step 3: Implement fetch + apply**

```ts
export function fetchHostSessionScheduleDefaults(context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionScheduleDefaults>("/api/host/sessions/schedule-defaults", undefined, context);
}
```

On 모임 전 and 모임 하나 더 mount, load defaults. On fetch error, apply built-in `20:00`/`22:00`/`온라인` with no throw. Show `defaults.hints[0]` under the time field. Default visibility switch from `defaults.accessScope`.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm --dir front exec vitest run features/host/model/host-schedule-defaults-model.test.ts features/host/api/host-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/features/host/api front/features/host/queries/host-session-queries.ts front/features/host/model/host-schedule-defaults-model.ts
git commit -m "$(cat <<'EOF'
feat(host): prefill new meetings from club schedule defaults

EOF
)"
```

---

### Task 12: Wrap-up primary path is 정리본 올리기

**Files:**
- Modify: `front/features/host/ui/meeting-ledger` after-phase panel
- Modify: `front/features/host/ui/session-editor/session-record-workspace.tsx` — default source `json` when opened from wrap-up; hide filename/title/Markdown as the first view
- Modify: `front/features/host/ui/session-editor/session-import-panel.tsx` copy
- Test: `front/features/host/ui/session-editor/session-import-panel.test.tsx`, wrap-up test

**Interfaces:**
- Consumes: existing `previewHostSessionImport` / `commitHostSessionImport` / apply mutations
- Produces: after-phase primary `정리본 올리기` → file picker → preview → `반영 전 확인` → apply. AI tab not a primary button.

- [ ] **Step 1: Write the failing wrap-up test**

```tsx
it("offers package upload not a feedback textarea", () => {
  render(<MeetingAfterPanel state="CLOSED" ... />);
  expect(screen.getByRole("button", { name: "정리본 올리기" })).toBeInTheDocument();
  expect(screen.queryByLabelText(/Markdown/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "피드백 넣기" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/meeting-ledger/meeting-after-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

After-phase left column: 출석 수정, 정리본 올리기, 기록 공개 (disabled with `공개하려면 요약이 필요합니다` when summary empty or access is HOST_ONLY). Opening 정리본 올리기 shows drop zone copy `정리한 파일을 여기에 놓으세요` and uses existing import preview/commit. Success lands on existing apply review (`반영 전 확인`, confirm `멤버에게 반영`). Escape/나중/닫기 do not apply.

Do not add a large empty feedback textarea. Keep in-app AI reachable only from a collapsed `다른 방법` if the route still exists; do not put it on the after-phase primary row.

`HOST_ONLY` import failure: show the existing rejection as one line and a control to set `GUEST_READABLE` first.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/meeting-ledger features/host/ui/session-editor/session-import-panel.test.tsx features/host/ui/session-editor/session-record-workspace.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/meeting-ledger front/features/host/ui/session-editor
git commit -m "$(cat <<'EOF'
feat(host): take meeting records from an uploaded package

EOF
)"
```

---

### Task 13: Architecture docs and CHANGELOG

**Files:**
- Modify: `docs/development/architecture.md` host app row and lifecycle paragraph (operator-facing names; keep enum names)
- Modify: `CHANGELOG.md` Unreleased
- Modify: `docs/development/session-import-generator.md` one sentence that the host button is `정리본 올리기`

**Interfaces:** none

- [ ] **Step 1: Draft CHANGELOG Unreleased highlight**

```md
- **모임 운영 장부:** 호스트 홈이 지금 다루는 모임의 모임 전·진행 중·모임 후 장부입니다. 다음 책은 여러 권 미리 넣고 멤버에게 보일 수 있으며, 기록은 정리본 파일로 올립니다.
```

- [ ] **Step 2: Align architecture.md**

Update the host app bullet so `/app/host` is the meeting ledger, `/sessions/:id` is canonical, `/edit` and `/closing` redirect. Keep `DRAFT/OPEN/CLOSED/PUBLISHED` as server states. Mention `GET /api/host/sessions/schedule-defaults` and DRAFT deletion without durable history.

- [ ] **Step 3: `git diff --check` on the docs**

Run: `git diff --check -- CHANGELOG.md docs/development/architecture.md docs/development/session-import-generator.md`
Expected: no trailing whitespace.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/development/architecture.md docs/development/session-import-generator.md
git commit -m "$(cat <<'EOF'
docs: describe the host meeting operating ledger

EOF
)"
```

---

### Task 14: One-cycle E2E

**Files:**
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts` (extend, do not invent production member data)

**Interfaces:** consumes local seed host login already used by that spec

- [ ] **Step 1: Add failing assertions to the existing host session spec**

After close:

```ts
await expect(page.getByRole("heading", { name: /모임을 마쳤습니다/ })).toBeVisible();
await expect(page.getByRole("button", { name: "정리본 올리기" })).toBeVisible();
await expect(page.getByRole("button", { name: "모임 하나 더" })).toBeVisible();
```

Assert `/edit` is not the URL after opening a meeting from home (`/app/host/sessions/` without `/edit`). Assert 멤버에게 열기 uses the dialog, not `window.confirm`.

- [ ] **Step 2: Run the spec to see it fail**

Run: `corepack pnpm --dir front test:e2e -- tests/e2e/dev-login-session-flow.spec.ts`
Expected: FAIL on new headings/buttons. Use the repo's isolated e2e ports; do not stop existing local servers.

- [ ] **Step 3: Fix product gaps the spec reveals, not the test**

If close still lands on editor overview tabs, the after-phase heading is missing — fix Task 6/12 UI. Do not weaken the assertion.

- [ ] **Step 4: Re-run**

Run: `corepack pnpm --dir front test:e2e -- tests/e2e/dev-login-session-flow.spec.ts`
Expected: PASS

- [ ] **Step 5: PR-level gates**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
./scripts/server-ci-check.sh
```

Expected: PASS. Then commit the e2e + any UI fixes.

```bash
git add front/tests/e2e/dev-login-session-flow.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): cover the host meeting close and next-book ledger

EOF
)"
```

---

## Self-review

1. Spec coverage: §5–7 tasks 1–6; §8 tasks 7+9; §9 tasks 10–11; §11 delete task 8; §12 task 12; §13 docs; §15 e2e+gates. Recording→LLM explicitly omitted. Dual-write omitted.
2. Placeholder scan: no deferred work items. If `host-dashboard-route.test.tsx` is coupled to the old dashboard, update that test in Task 5 in the same change.
3. Types: `MeetingPhase` is `"before"|"during"|"after"`; href helper is `hostMeetingHref` / updated `hostSessionEditHref`; defaults type `HostSessionScheduleDefaults`; confirm kind includes `"open"`.
