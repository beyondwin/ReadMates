# 호스트 세션 편집 UI/UX 재편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트 세션 편집 화면을 상태와 다음 행동 중심의 5개 section으로 재편하고, 직접 작성·AI·JSON을 하나의 기록 작업대로 통합하며, 사용자 화면의 `revision` 용어와 중복 저장 흐름을 제거한다.

**Architecture:** 기존 route-first 경계를 유지한다. route는 query/mutation, 공유 초안 controller, URL section/source 상태를 소유하고, model은 URL 해석·개요·변경 기록 projection을 순수 함수로 제공하며, UI는 props와 callback만으로 한 section씩 렌더링한다. Spring API, BFF, database schema, AI generation contract, notification composer contract는 변경하지 않는다.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, TypeScript 6, Vitest/Testing Library, Playwright, Vite 8, existing ReadMates design tokens/CSS.

## Global Constraints

- 승인된 설계의 source of truth는 `docs/superpowers/specs/2026-07-27-host-session-editor-ui-ux-redesign-design.md`다.
- 구현 시작 전에 `git status --short --branch`와 `python3 scripts/agent-preflight.py`를 다시 실행한다. 다른 작업자의 파일과 commit을 수정, amend, squash, reset하지 않는다.
- 기본 진입은 `개요`다. desktop/mobile 모두 `개요`, `기본 정보`, `출석`, `기록 작업대`, `변경 기록` 중 하나만 보인다.
- 사용자 화면에서는 `revision`을 `버전`으로 표현한다. API type, query key, endpoint path, database 명칭 같은 내부 식별자는 바꾸지 않는다.
- `liveRevision === 0`은 `버전 0`이 아니라 `아직 적용된 기록이 없습니다`로 표시한다.
- 공개 여부와 적용 여부를 분리한다. `현재 적용본`과 `호스트 전용/멤버 공개/외부 공개`를 별도 정보로 보여준다.
- 기본 정보는 `기본 정보 저장`, 출석은 개별 즉시 반영, 기록은 자동 저장 후 `반영 검토`, 변경 기록은 read-only로 구분한다.
- section/source 전환은 `history.replaceState` 성격으로 처리하고 다른 query parameter와 hash를 보존한다. browser Back stack을 section마다 쌓지 않는다.
- section을 바꿔도 저장 전 기본 정보, autosave 대기/실패 기록 입력, AI 검토 상태, JSON preview/commit 결과가 초기화되지 않아야 한다.
- AI/JSON commit은 현재 적용본을 바꾸지 않는다. 공통 공유 초안을 다시 불러오고 직접 편집 영역으로 이동한 뒤 editor focus를 복구한다.
- apply는 명시적인 preview-confirm을 거친다. 취소, Escape, backdrop, section 전환, route 이탈은 apply나 notification mutation을 만들지 않는다.
- 과거 버전 복원은 새 초안만 만들고 현재 적용본을 즉시 바꾸지 않는다. 성공 후 기록 작업대로 이동한다.
- 콘텐츠 apply와 알림 작성기는 계속 분리한다. apply 후 작성기를 닫거나 `이번에는 보내지 않기`를 선택해도 알림 event/outbox를 만들지 않는 기존 contract를 유지한다.
- UI module은 feature API/query/route 또는 `shared/api` client를 import하지 않는다.
- server/BFF/migration 변경은 현재 response로 승인된 상태를 표현할 수 없다는 재현 가능한 증거가 생길 때만 별도 계획으로 분리한다.
- 실제 멤버 데이터, 이메일, 비공개 URL, token-shaped value를 fixture, screenshot, 문서, commit에 넣지 않는다.
- 모든 frontend 명령은 repository pin을 쓰는 `corepack pnpm --dir front ...` 형태로 실행한다.

---

## Task 1: Section/source URL model을 순수 함수로 고정

**Files:**

- Create: `front/features/host/model/host-session-editor-navigation.ts`
- Create: `front/features/host/model/host-session-editor-navigation.test.ts`

**Public interface:**

```ts
export type HostSessionEditorSection =
  | "overview"
  | "basic"
  | "attendance"
  | "records"
  | "history";

export type HostSessionDraftSource = "manual" | "ai" | "json";

export type HostSessionEditorLocation = {
  section: HostSessionEditorSection;
  source: HostSessionDraftSource;
};

export function parseHostSessionEditorLocation(search: string): HostSessionEditorLocation;

export function buildHostSessionEditorUrl(
  currentUrl: string | URL,
  next: HostSessionEditorLocation,
): string;
```

`buildHostSessionEditorUrl`은 origin을 반환하지 않고 `pathname + search + hash`를 반환한다. canonical 규칙은 다음과 같다.

- query 없음 → `{ section: "overview", source: "manual" }`
- `section=overview|basic|attendance|records|history`만 허용
- `section=records&source=ai|json`만 source query를 유지
- 직접 작성은 `section=records`이며 `source=manual` query를 쓰지 않음
- legacy `aigen=1` → records/ai
- legacy `records=json` → records/json
- 유효한 canonical `section/source`가 legacy parameter보다 우선
- invalid section/source는 안전한 overview/manual로 정규화
- canonical URL 생성 시 `aigen`, legacy `records`, 불필요한 `source`를 제거
- unrelated query parameter와 hash는 그대로 유지

- [ ] RED: 위 public interface를 import하는 test를 작성한다.

- [ ] 다음 case를 table-driven test로 고정한다.

  - 빈 search의 overview/manual
  - 5개 canonical section
  - records/manual, records/ai, records/json
  - invalid section/source fallback
  - `?aigen=1` 및 `?records=json` legacy 해석
  - canonical parameter의 legacy 우선권
  - unrelated `returnTo`, `from`, hash 보존
  - overview에서 section/source 삭제
  - records/manual에서 source 삭제

- [ ] RED 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/model/host-session-editor-navigation.test.ts
  ```

  Expected: module missing 또는 export missing으로 실패.

- [ ] `host-session-editor-navigation.ts`에 type, constant section ordering, parser, URL builder를 최소 구현한다.

- [ ] GREEN 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/model/host-session-editor-navigation.test.ts
  ```

  Expected: 해당 test 전부 통과.

- [ ] type/format 확인:

  ```bash
  corepack pnpm --dir front lint -- features/host/model/host-session-editor-navigation.ts features/host/model/host-session-editor-navigation.test.ts
  git diff --check
  ```

- [ ] Commit:

  ```bash
  git add front/features/host/model/host-session-editor-navigation.ts front/features/host/model/host-session-editor-navigation.test.ts
  git commit -m "feat(front): model host editor navigation"
  ```

## Task 2: 개요와 변경 기록 projection을 기술 용어 없이 모델링

**Files:**

- Create: `front/features/host/model/host-session-editor-view-model.ts`
- Create: `front/features/host/model/host-session-editor-view-model.test.ts`
- Modify: `front/features/host/model/host-session-editor-model.ts`
- Modify: `front/tests/unit/host-session-editor-model.test.ts`

**Public interface:**

```ts
export type HostSessionEditorNextActionKind =
  | "SAVE_BASIC"
  | "RESOLVE_DRAFT_SAVE"
  | "RESOLVE_STALE_BASE"
  | "FIX_VALIDATION"
  | "REVIEW_DRAFT"
  | "CREATE_DRAFT"
  | "UP_TO_DATE";

export type HostSessionEditorOverview = {
  applied: {
    exists: boolean;
    versionLabel: string | null;
    visibilityLabel: string;
    appliedAt: string | null;
    summary: string;
  };
  draft: {
    exists: boolean;
    statusLabel: string;
    sourceLabel: string | null;
    updatedAt: string | null;
    tone: "neutral" | "info" | "warning" | "danger";
  };
  nextAction: {
    kind: HostSessionEditorNextActionKind;
    label: string;
    target: HostSessionEditorLocation;
    enabled: boolean;
  };
};

export function buildHostSessionEditorOverview(input: {
  isNewSession: boolean;
  liveRevision: number;
  liveSnapshot: SessionRecordSnapshot | null;
  lastAppliedAt: string | null;
  draft: HostSessionRecordDraft | null;
  draftSaveState: DraftSaveState;
  draftLiveBaseStale: boolean;
  validationIssues: string[];
}): HostSessionEditorOverview;

export type HostSessionHistoryItemView = {
  title: string;
  versionLabel: string | null;
  detailItems: string[];
  sourceLabel: string | null;
  canCreateDraft: boolean;
};

export function buildHostSessionHistoryItemView(
  item: HostSessionHistoryItem,
): HostSessionHistoryItemView;
```

- [ ] RED: overview 우선순위를 순수 model test로 작성한다.

  1. 저장 전 새 세션 → `기본 정보를 먼저 저장하세요`, basic
  2. autosave error → `초안 저장 문제를 해결하세요`, records
  3. stale base → `최신 적용본을 확인하세요`, records
  4. validation issue → `확인이 필요한 항목을 수정하세요`, records
  5. 저장된 유효 초안 → `초안 내용을 검토하세요`, records/manual
  6. 적용본/초안 모두 없음 → `기록 초안을 만들어 보세요`, records/manual
  7. 적용본만 있고 별도 작업 없음 → `현재 기록이 최신입니다`

- [ ] RED: 적용본 projection case를 작성한다.

  - live revision 0은 versionLabel `null`
  - live revision 3은 `버전 3`
  - visibility label은 기존 `recordVisibilityLabel` 재사용
  - 빈 summary는 기술적인 placeholder가 아닌 `요약이 아직 없습니다`
  - `lastAppliedAt`이 없으면 억지로 `liveSessionUpdatedAt`을 반영 시각으로 쓰지 않음

- [ ] RED: draft source label을 고정한다.

  - `MANUAL` → `직접 작성`
  - `AI_GENERATED` → `AI로 생성`
  - `JSON_IMPORT` → `외부 JSON`
  - `RESTORED` → `과거 버전에서 생성`

- [ ] RED: history type/field label을 고정한다.

  - `BASIC_INFO_UPDATED` → `기본 정보 수정`
  - `ATTENDANCE_UPDATED` → `출석 수정`
  - `RECORD_REVISION_APPLIED` → `새 버전 반영`
  - `RECORD_REVISION_RESTORED` → `과거 버전으로 초안 생성`
  - `NOTIFICATION_SENT` → `알림 발송`
  - `NOTIFICATION_SKIPPED` → `알림 보내지 않음`
  - `publicationSummary`, `visibility`, `highlights`, `oneLineReviews`, `feedbackDocument`를 한국어 변경 항목으로 변환
  - `actorMembershipId`, `revisionId`, `notificationEventId`를 기본 row에 노출하지 않음

- [ ] RED 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/model/host-session-editor-view-model.test.ts tests/unit/host-session-editor-model.test.ts
  ```

  Expected: 새 module/export가 없어 실패.

- [ ] `host-session-editor-view-model.ts`를 구현하고 기존 visibility label을 import한다.

- [ ] `recordVisibilityDescription`의 사용자 카피를 `기록 공개를 완료하면`에서 `새 버전으로 반영하면`으로 바꿔 새 작업 흐름과 맞춘다.

- [ ] GREEN 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/model/host-session-editor-view-model.test.ts tests/unit/host-session-editor-model.test.ts
  ```

- [ ] public-safety/type 확인:

  ```bash
  corepack pnpm --dir front lint -- features/host/model/host-session-editor-view-model.ts features/host/model/host-session-editor-view-model.test.ts features/host/model/host-session-editor-model.ts tests/unit/host-session-editor-model.test.ts
  git diff --check
  ```

- [ ] Commit:

  ```bash
  git add front/features/host/model/host-session-editor-view-model.ts front/features/host/model/host-session-editor-view-model.test.ts front/features/host/model/host-session-editor-model.ts front/tests/unit/host-session-editor-model.test.ts
  git commit -m "feat(front): model host editor overview"
  ```

## Task 3: 공통 shell, 5개 section navigation, 개요 UI 구축

**Files:**

- Create: `front/features/host/ui/session-editor/session-editor-section-nav.tsx`
- Create: `front/features/host/ui/session-editor/session-editor-section-nav.test.tsx`
- Create: `front/features/host/ui/session-editor/session-overview-section.tsx`
- Create: `front/features/host/ui/session-editor/session-overview-section.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-editor-panel.tsx`
- Delete after imports are migrated: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`

**Component interfaces:**

```ts
export function SessionEditorSectionNav(props: {
  activeSection: HostSessionEditorSection;
  onSectionChange: (section: HostSessionEditorSection) => void;
}): JSX.Element;

export function SessionOverviewSection(props: {
  overview: HostSessionEditorOverview;
  sessionState: HostSessionState | undefined;
  onNextAction: (target: HostSessionEditorLocation) => void;
  onCloseSession?: () => void | Promise<void>;
  onPublishSession?: () => void | Promise<void>;
  lifecyclePending: boolean;
}): JSX.Element;

export function Panel(props: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  tone?: "warn";
  section: HostSessionEditorSection;
  panelId: string;
  activeSection: HostSessionEditorSection;
}): JSX.Element;
```

`Panel`은 desktop에서 전부 노출하고 mobile에서만 숨기는 현재 구조를 제거한다. active section만 보이고 접근성 tree에 참여한다. 한 번 방문한 stateful section/source는 `hidden`으로 keep-alive할 수 있지만, 방문하지 않은 무거운 AI view까지 선행 mount하지 않는다. form/controller/JSON state는 `HostSessionEditor` 또는 route에 유지하고, AI review처럼 child-local state가 있는 source는 방문 후 숨겨도 unmount하지 않는다.

- [ ] RED: section nav test를 작성한다.

  - desktop label: `개요`, `기본 정보`, `출석`, `기록 작업대`, `변경 기록`
  - mobile label: `개요`, `기본`, `출석`, `기록`, `변경`
  - 하나의 의미상 tablist와 5개 tab
  - active tab만 `aria-selected=true`, `tabIndex=0`
  - click callback
  - ArrowLeft/ArrowRight wrap
  - Home/End 이동과 focus
  - 320px를 위해 navigation wrapper에 horizontal overflow class

- [ ] RED: overview section test를 작성한다.

  - `현재 적용본`, `작업 중인 초안`, `다음 할 일` 세 영역
  - 적용본 없음에서 `버전 0` 미노출
  - 공개 범위 badge 분리
  - next action click target 전달
  - OPEN은 `세션 마감`, CLOSED는 lifecycle 문맥과 `기록 작업대` action, PUBLISHED는 수정 가능한 상태 설명
  - lifecycle action과 기록 공개 범위를 같은 버튼/상태로 표현하지 않음

- [ ] RED 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/ui/session-editor/session-editor-section-nav.test.tsx features/host/ui/session-editor/session-overview-section.test.tsx
  ```

- [ ] `SessionEditorSectionNav`를 semantic tablist로 구현한다. label은 CSS media query나 visually paired label span으로 바꾸되 접근 가능한 이름은 desktop full label을 유지한다.

- [ ] `SessionOverviewSection`을 ReadMates의 문서형 hierarchy로 구현한다. KPI tile처럼 독립 카드 3개를 나열하지 말고 divider와 typography로 한 회차의 상태→다음 행동을 연결한다.

- [ ] `Panel`을 새 section type에 맞게 바꾸고 active section이 아니면 `hidden`과 inactive class를 적용해 화면과 접근성 tree에서 제외한다.

- [ ] 기존 `mobile-editor-tabs.tsx`의 keyboard logic을 새 nav로 이동한다. 아직 남은 import가 있으면 이 task에서 삭제하지 말고 Task 4 마지막에 삭제한다.

- [ ] GREEN 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/ui/session-editor/session-editor-section-nav.test.tsx features/host/ui/session-editor/session-overview-section.test.tsx
  corepack pnpm --dir front lint -- features/host/ui/session-editor/session-editor-section-nav.tsx features/host/ui/session-editor/session-overview-section.tsx features/host/ui/session-editor/session-editor-panel.tsx
  git diff --check
  ```

- [ ] Commit:

  ```bash
  git add front/features/host/ui/session-editor/session-editor-section-nav.tsx front/features/host/ui/session-editor/session-editor-section-nav.test.tsx front/features/host/ui/session-editor/session-overview-section.tsx front/features/host/ui/session-editor/session-overview-section.test.tsx front/features/host/ui/session-editor/session-editor-panel.tsx front/features/host/ui/session-editor/mobile-editor-tabs.tsx
  git commit -m "feat(front): add host editor section shell"
  ```

## Task 4: HostSessionEditor에 one-section layout과 저장 의미 통합

**Files:**

- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/basic-session-panel.tsx`
- Modify: `front/features/host/ui/session-editor/attendance-panel.tsx`
- Modify: `front/features/host/ui/session-editor/document-state-panel.tsx`
- Modify: `front/features/host/ui/session-editor/publication-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-editor-notifications.tsx`
- Delete: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

**HostSessionEditor navigation prop:**

```ts
navigation: {
  location: HostSessionEditorLocation;
  onChange: (next: HostSessionEditorLocation) => void;
};
```

기존 test helper에는 기본값 `{ section: "overview", source: "manual" }`을 주어 unrelated test setup을 단순하게 유지한다.

- [ ] RED: `host-session-editor.test.tsx`의 기존 mobile-only 4-tab test를 5-section desktop/mobile behavior로 교체한다.

- [ ] RED: 기본 진입 시 다음을 검증한다.

  - overview만 보임
  - 전역 `변경 사항 저장` 없음
  - `현재 적용본`, `작업 중인 초안`, `다음 할 일` 보임
  - 기본 정보 input과 기록 editor는 숨김

- [ ] RED: basic section에서 다음을 검증한다.

  - `기본 정보 저장` 버튼만 해당 section 안에 보임
  - 기존 title/book/date/location 값과 validation 유지
  - 저장 성공/실패 live region이 basic action 근처에 있음

- [ ] RED: section state preservation test를 작성한다.

  1. basic에서 세션 제목을 수정
  2. records로 이동해 공개 요약을 수정
  3. history로 이동
  4. basic과 records로 돌아와 두 입력이 그대로인지 확인

- [ ] RED: attendance section에서 개별 action만 저장되고 global submit이 호출되지 않는 기존 behavior를 유지한다.

- [ ] RED: notification actions와 위험 작업이 모든 section의 긴 aside로 반복되지 않는지 검증한다.

  - 개요에는 세션 lifecycle/상태와 필요한 notification entry만 표시
  - 기본/출석/변경 section에는 현재 action과 무관한 운영 순서 카드 미표시
  - 세션 삭제는 기본 정보의 별도 danger zone 또는 개요 하단에 배치

- [ ] RED 확인:

  ```bash
  corepack pnpm --dir front test -- tests/unit/host-session-editor.test.tsx
  ```

  Expected: old 4-tab/global-save 구조 때문에 새 assertion 실패.

- [ ] `HostSessionEditor`에서 `activeMobileSection`, `readInitialImportMode`, `writeImportModeToUrl`을 제거하고 navigation prop을 사용한다.

- [ ] `HostSessionEditor`의 reducer/form state, session import state, toast/dialog state는 section conditional render보다 위에 유지한다.

- [ ] `visitedSections`와 records 내부 `visitedSources`를 추가한다. active item은 즉시 visited로 기록하고, 한 번 방문한 section/source는 keep-alive하되 inactive일 때 `hidden` 처리한다. 이로써 AI review child state까지 section/source 전환 후 유지하고, 처음부터 모든 무거운 source를 mount하지 않는다.

- [ ] header는 session identity, lifecycle, visibility, draft status만 보여주고 global submit button과 장문의 저장 설명을 제거한다.

- [ ] `SessionEditorSectionNav` 아래에 active section 하나를 렌더링한다.

  - overview: `SessionOverviewSection`
  - basic: `BasicSessionPanel` + local `기본 정보 저장`
  - attendance: `AttendancePanel`
  - records: Task 5에서 교체할 기존 adapter
  - history: `SessionHistoryPanel`

- [ ] `DocumentStatePanel`의 유용한 상태를 overview projection으로 이동하고, 중복 카드가 된 component는 삭제하거나 기록 context rail의 좁은 summary component로 축소한다.

- [ ] 기존 `PublicationPanel`의 세션 마감/공개 lifecycle action은 overview에 연결한다. legacy publication form은 record workflow가 없는 새 세션에서 노출하지 않고, 새 세션은 기본 정보 저장 후 canonical edit route로 이동하게 한다.

- [ ] `operationOrder`와 generic `저장 안내` aside를 제거한다. notification action과 danger action은 승인된 section 문맥에 배치한다.

- [ ] `mobile-editor-tabs.tsx`의 모든 import가 사라졌는지 확인한 뒤 삭제한다.

- [ ] GREEN 및 focused regression:

  ```bash
  corepack pnpm --dir front test -- tests/unit/host-session-editor.test.tsx features/host/ui/session-editor/session-editor-section-nav.test.tsx features/host/ui/session-editor/session-overview-section.test.tsx
  corepack pnpm --dir front lint -- features/host/ui/host-session-editor.tsx features/host/ui/session-editor tests/unit/host-session-editor.test.tsx
  git diff --check
  ```

- [ ] Commit:

  ```bash
  git add front/features/host/ui/host-session-editor.tsx front/features/host/ui/session-editor front/tests/unit/host-session-editor.test.tsx
  git commit -m "feat(front): reorganize host session editor sections"
  ```

## Task 5: 직접 작성·AI·JSON을 하나의 기록 작업대로 통합

**Files:**

- Create: `front/features/host/ui/session-editor/session-record-workspace.tsx`
- Create: `front/features/host/ui/session-editor/session-record-workspace.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-draft-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-draft-panel.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-import-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-import-panel.test.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

**Workspace interface:**

```ts
export function SessionRecordWorkspace(props: {
  source: HostSessionDraftSource;
  onSourceChange: (source: HostSessionDraftSource) => void;
  liveRevision: number;
  liveSnapshot: SessionRecordDraftSnapshot;
  draft: {
    snapshot: SessionRecordDraftSnapshot;
    source: SessionRecordDraftSource | null;
    updatedAt: string | null;
    saveState: DraftSaveState;
    validationIssues: string[];
    liveBaseStale: boolean;
  };
  creation: {
    sessionId?: string;
    clubSlug?: string;
    expectedDraftRevision: number | null;
    importPreview: SessionImportPreviewResponse | null;
    importCommitResult: SessionImportCommitResult | null;
    importStatus: "idle" | "previewing" | "ready" | "committing" | "error";
    importError: string | null;
  };
  actions: {
    onSnapshotChange: (snapshot: SessionRecordDraftSnapshot) => void;
    onReloadDraft: () => void | Promise<void>;
    onRebaseDraft: () => void | Promise<void>;
    onCopyInput: () => void | Promise<void>;
    onReviewDraft: () => void | Promise<void>;
    onAigenCommitted: (result: AiCommitResponse | null) => void;
    onImportFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
    onImportCommit: () => void;
  };
}): JSX.Element;
```

- [ ] RED: workspace structure test를 작성한다.

  - 상단에 `현재 적용본`, `작업 중인 초안`, `다음 할 일`
  - 적용본 version 0 미표시
  - `초안 만들기` source control: `직접 작성`, `AI로 생성`, `외부 JSON`
  - source를 바꿔도 공통 초안 editor와 저장 상태가 유지
  - 한 번 연 AI/JSON source를 다른 section/source로 바꿨다가 돌아와도 review state가 유지
  - AI/JSON은 별도 `세션 기록 완성` 결과물이 아니라 초안 생성 도구
  - `세션 기록 완성`, `공개 기록 초안`, `live revision`, `draft revision` 미노출

- [ ] RED: common draft editor test를 갱신한다.

  - 현재 적용본 preview와 draft input이 분리
  - 공개 범위 radio는 draft에만 적용
  - autosave success/error/stale/validation 상태
  - 저장 실패 후 retry/reload/copy recovery action
  - 긴 file name, URL, Markdown input은 wrap/overflow class 보유

- [ ] RED: sticky action state test를 작성한다.

  - draft 없음 → `초안을 먼저 만들어 주세요`, disabled
  - saving → `저장 중`, disabled
  - save error → retry 안내, disabled
  - stale → `최신 적용본 확인`, review disabled
  - validation issue → 첫 오류 anchor 제공, disabled
  - saved/valid → `반영 검토`, enabled

- [ ] RED: AI commit/JSON commit convergence test를 작성한다.

  - `onDraftCommitted` 뒤 `source=manual` callback
  - 공통 draft reload
  - draft editor heading 또는 첫 편집 field focus
  - current applied preview는 commit result만으로 바뀌지 않음
  - JSON preview와 AI review state는 다른 section으로 이동했다 돌아와도 유지

- [ ] RED 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/ui/session-editor/session-record-workspace.test.tsx features/host/ui/session-editor/session-record-draft-panel.test.tsx features/host/ui/session-editor/session-import-panel.test.tsx tests/unit/host-session-editor.test.tsx
  ```

- [ ] `SessionRecordDraftPanel`에서 outer `Panel`, 별도 live preview, sticky action을 분리해 workspace가 조립할 수 있는 body component로 바꾼다. 기존 draft controller/autosave behavior는 바꾸지 않는다.

- [ ] `SessionRecordCompletionPanel`을 source body로 축소한다.

  - `SessionRecordCompletionMode`를 URL model의 `HostSessionDraftSource`에 맞춤
  - AI/JSON body만 렌더링
  - `세션 기록 완성 방식` aria-label은 `초안 만드는 방법`으로 변경
  - feedback document status/preview는 common draft context로 이동

- [ ] `SessionRecordWorkspace`를 구현한다.

  - source chooser 위에 적용본/초안 상태
  - desktop에서 editor + narrow context rail
  - mobile에서 context rail을 복제하지 않고 상단 summary로 합침
  - sticky action은 `반영 검토`

- [ ] AI/JSON commit 성공 handler는 `recordWorkflow.onDraftCommitted`와 records surface refresh를 기다린 뒤 navigation을 records/manual로 바꾸고 editor focus를 이동한다. `window.location.reload()`는 사용하지 않는다.

- [ ] `HostSessionEditor` records section을 workspace 하나로 교체한다.

- [ ] GREEN 및 focused regression:

  ```bash
  corepack pnpm --dir front test -- features/host/ui/session-editor/session-record-workspace.test.tsx features/host/ui/session-editor/session-record-draft-panel.test.tsx features/host/ui/session-editor/session-import-panel.test.tsx tests/unit/host-session-editor.test.tsx
  corepack pnpm --dir front lint -- features/host/ui/session-editor/session-record-workspace.tsx features/host/ui/session-editor/session-record-draft-panel.tsx features/host/ui/session-editor/session-record-completion-panel.tsx features/host/ui/host-session-editor.tsx
  git diff --check
  ```

- [ ] Commit:

  ```bash
  git add front/features/host/ui/session-editor front/features/host/ui/host-session-editor.tsx front/tests/unit/host-session-editor.test.tsx
  git commit -m "feat(front): unify the session record workspace"
  ```

## Task 6: Apply dialog과 변경 기록/복원을 버전 언어로 재작성

**Files:**

- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/session-history-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-history-panel.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-history-model.ts`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [ ] RED: apply dialog test를 승인 카피로 갱신한다.

  - heading `새 버전으로 반영`
  - changed section 목록
  - 적용본이 없으면 `현재 적용본 없음 → 버전 1`
  - 적용본이 있으면 `버전 N → 버전 N+1`
  - 공개 범위 label
  - `이 단계에서는 알림을 만들거나 보내지 않습니다`
  - primary CTA `새 버전으로 반영`
  - `revision`, `live`, `draft` 사용자 카피 미노출

- [ ] RED: Escape, 취소, backdrop 각각 `onConfirm`을 호출하지 않고 trigger focus를 복원하는 test를 유지/추가한다.

- [ ] RED: history panel test를 승인 카피로 갱신한다.

  - eyebrow/title `변경 기록`
  - apply row `새 버전 반영`, `버전 2`
  - restore row `과거 버전으로 초안 생성`
  - button `이 버전으로 초안 만들기`
  - dialog `버전 2로 작업 초안을 만들까요?`
  - 설명 `현재 적용본은 바뀌지 않습니다`
  - confirm `작업 초안 만들기`
  - empty `아직 변경 기록이 없습니다`
  - pagination `변경 기록 더 보기`

- [ ] RED: restore success callback이 다음 결과를 구분하도록 interface를 갱신한다.

  ```ts
  onRestore(request): Promise<void>
  onRestoreCompleted(): void
  ```

  UI는 restore mutation을 직접 알지 않고 성공 후 callback만 호출한다.

- [ ] RED 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/ui/session-editor/session-history-panel.test.tsx tests/unit/host-session-editor.test.tsx
  ```

- [ ] `SessionRecordApplyDialog`을 user-facing version 카피로 바꾸고 visibility를 `HostSessionRecordApplyReview`에 포함한다.

- [ ] `SessionHistoryPanel`이 Task 2의 `buildHostSessionHistoryItemView`를 사용하도록 바꾼다. 기본 row에는 opaque ID를 렌더링하지 않는다.

- [ ] restore dialog의 focus trap, Escape, backdrop, inline error, trigger focus restore를 유지한다.

- [ ] restore 성공 후 dialog를 닫고 `onRestoreCompleted`를 호출한다. mutation failure면 history row와 dialog를 유지한다.

- [ ] GREEN:

  ```bash
  corepack pnpm --dir front test -- features/host/ui/session-editor/session-history-panel.test.tsx tests/unit/host-session-editor.test.tsx
  corepack pnpm --dir front lint -- features/host/ui/session-editor/session-history-panel.tsx features/host/ui/session-editor/session-history-model.ts features/host/ui/host-session-editor.tsx
  git diff --check
  ```

- [ ] 사용자 UI residue scan:

  ```bash
  rg -n '"[^"]*(revision|live revision|draft revision|세션 기록 완성|공개 기록 초안|변경 이력)[^"]*"' front/features/host/ui front/tests/unit/host-session-editor.test.tsx front/features/host/ui/session-editor
  ```

  Expected: API/internal test description을 제외하고 렌더링 문자열 0건. 예외가 있으면 plan closeout note에 이유를 기록한다.

- [ ] Commit:

  ```bash
  git add front/features/host/ui/host-session-editor.tsx front/features/host/ui/session-editor/session-history-panel.tsx front/features/host/ui/session-editor/session-history-panel.test.tsx front/features/host/ui/session-editor/session-history-model.ts front/tests/unit/host-session-editor.test.tsx
  git commit -m "feat(front): clarify record apply and version history"
  ```

## Task 7: Route-owned navigation, legacy URL 호환, workflow 후속 이동 연결

**Files:**

- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/route/host-session-editor-route.test.tsx`
- Modify: `front/tests/unit/host-session-editor-route.test.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`

**Route helper:**

```ts
function useHostSessionEditorLocation(): {
  location: HostSessionEditorLocation;
  replaceLocation: (next: HostSessionEditorLocation) => void;
};
```

hook은 Task 1의 pure model을 사용하고 route module에 남긴다. UI에서 `window.location` 또는 React Router hook을 직접 호출하지 않는다.

- [ ] RED: route test mock이 `navigation` prop을 캡처하도록 바꾼다.

- [ ] RED: initial/canonical behavior를 검증한다.

  - query 없음 → overview
  - `?section=records&source=ai` → records/ai
  - `?section=records&source=json` → records/json
  - `?aigen=1` → records/ai 후 canonical replace
  - `?records=json` → records/json 후 canonical replace
  - unrelated query/hash 보존
  - section/source 전환에 pushState 또는 full page navigation 없음

- [ ] RED: route workflow test를 추가한다.

  - AI/JSON commit 성공 → record editor refresh → records/manual
  - restore 성공 → current applied revision 불변 → records/manual
  - apply 성공 → controller reload, history/overview query refresh, optional composer request
  - apply cancel/Escape/route navigation → apply mutation 0회, composer request 0회
  - draft autosave error일 때 실제 route 이탈 guard 카피는 `저장되지 않은 작업 초안`
  - section 내부 전환은 route 이탈 guard를 띄우지 않음

- [ ] RED: loader pending/error projection을 고정한다.

  - data가 아직 없을 때 blank `null` 대신 editor hierarchy를 유지한 loading state
  - record editor query error에서 retry action
  - auth/role denial은 기존 router error/guard를 우회하지 않음

- [ ] RED 확인:

  ```bash
  corepack pnpm --dir front test -- features/host/route/host-session-editor-route.test.tsx tests/unit/host-session-editor-route.test.tsx
  ```

- [ ] `NewHostSessionRoute`와 `EditHostSessionRoute`에서 `useHostSessionEditorLocation`을 호출해 동일한 navigation prop을 전달한다.

- [ ] initial legacy query는 첫 effect에서 canonical URL로 한 번만 replace한다. 다른 query/hash를 보존하고 navigation state와 URL이 같은 값을 갖게 한다.

- [ ] `EditHostSessionRecordWorkflow`에서 아래 callback을 `HostSessionEditor`에 전달한다.

  - `onDraftCommitted`: controller revision adopt/reload가 끝난 뒤 records/manual
  - `onRestoreCompleted`: records/manual
  - `onApplyCompleted`: overview projection/history refresh에 필요한 query invalidation

- [ ] apply result의 composer contract는 그대로 유지한다. contentRevision을 새로 계산하거나 UI label용 version number로 대체하지 않는다.

- [ ] navigation guard 카피를 `저장되지 않은 작업 초안이 있습니다. 이 화면을 떠날까요?`로 바꾼다.

- [ ] query pending/error UI를 추가하되 route guard/auth behavior를 변경하지 않는다.

- [ ] GREEN:

  ```bash
  corepack pnpm --dir front test -- features/host/route/host-session-editor-route.test.tsx tests/unit/host-session-editor-route.test.tsx tests/unit/host-session-editor.test.tsx
  corepack pnpm --dir front lint -- features/host/route/host-session-editor-route.tsx features/host/route/host-session-editor-route.test.tsx tests/unit/host-session-editor-route.test.tsx
  git diff --check
  ```

- [ ] Commit:

  ```bash
  git add front/features/host/route/host-session-editor-route.tsx front/features/host/route/host-session-editor-route.test.tsx front/tests/unit/host-session-editor-route.test.tsx front/features/host/ui/host-session-editor.tsx
  git commit -m "feat(front): route host editor section state"
  ```

## Task 8: Responsive visual system과 browser/E2E evidence 완성

**Files:**

- Modify: `front/shared/styles/mobile.css`
- Modify: `front/tests/e2e/host-session-record-preview.spec.ts`
- Modify: `front/tests/e2e/host-session-record-revisions.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify if selectors require it: `front/tests/e2e/aigen-mobile-evidence.spec.ts`

- [ ] RED: E2E selector와 기대 카피를 새 정보 구조로 바꾼다.

  - editor 진입 → overview
  - records 이동 → `기록`/`기록 작업대`
  - basic 저장 → `기본 정보 저장`
  - review → `반영 검토`
  - confirm → `새 버전으로 반영`
  - history → `변경`/`변경 기록`
  - restore → `이 버전으로 초안 만들기`

- [ ] RED: `host-session-record-preview.spec.ts`를 canonical URL `?section=records&source=json`으로 바꾼다. 별도 test에서 `?records=json` legacy URL이 canonicalize되며 JSON source를 여는지도 유지한다.

- [ ] RED: `host-session-record-revisions.spec.ts`를 다음 흐름으로 바꾼다.

  1. overview 진입
  2. basic section에서 정보 저장
  3. records/json에서 공통 초안 생성
  4. 현재 적용본 불변 확인
  5. stale 해결
  6. 새 버전 반영 후 알림 skip
  7. 새 버전 반영 후 알림 confirm
  8. 변경 기록에서 과거 버전으로 초안 생성 후 적용본 불변

- [ ] RED: 390px와 320px responsive assertion을 추가한다.

  - 5개 section tab horizontal scroll
  - active panel 하나
  - sticky action이 bottom app navigation 및 safe area와 겹치지 않음
  - dialog가 viewport 밖으로 나가지 않음
  - `document.documentElement.scrollWidth <= window.innerWidth`
  - 긴 filename/URL/Markdown이 horizontal overflow를 만들지 않음
  - desktop context rail이 mobile 본문 끝에 복제되지 않음

- [ ] focused E2E RED 확인:

  ```bash
  corepack pnpm --dir front test:e2e -- host-session-record-preview.spec.ts host-session-record-revisions.spec.ts responsive-navigation-chrome.spec.ts
  ```

  Expected: 새 label/section/URL assertion이 현재 구현과 달라 실패. 환경 의존 실패라면 application assertion 실패와 구분해 기록한다.

- [ ] `mobile.css`의 기존 `.rm-host-session-editor__section:not(.is-mobile-active)` 기반 구조를 제거한다.

- [ ] 새 class를 구현한다.

  - `.rm-host-session-editor__section-nav`
  - `.rm-host-session-editor__section-tab`
  - `.rm-host-session-editor__section-panel`
  - `.rm-host-session-overview`
  - `.rm-session-record-workspace`
  - `.rm-session-record-workspace__context`
  - `.rm-session-record-workspace__sticky-action`

- [ ] visual rule을 반영한다.

  - warm paper, ink hierarchy, restrained accent
  - nested card 수 축소
  - reading measure 유지
  - 44px practical mobile target
  - visible focus
  - reduced-motion
  - safe-area bottom padding
  - Korean/English/URL/Markdown `overflow-wrap:anywhere` 또는 scroll container

- [ ] desktop 1280×900, mobile 390×844, narrow mobile 320×720에서 browser evidence를 캡처한다.

  필수 상태:

  - overview
  - records/manual with saved draft
  - records/json preview
  - history
  - apply dialog
  - restore dialog
  - autosave error 또는 stale state

- [ ] screenshot을 육안 검토하고 다음을 기록한다.

  - header/nav/section hierarchy
  - sticky action과 bottom nav 간격
  - context rail 중복 여부
  - 긴 content wrapping
  - focus/disabled/error 상태

- [ ] GREEN:

  ```bash
  corepack pnpm --dir front test:e2e -- host-session-record-preview.spec.ts host-session-record-revisions.spec.ts responsive-navigation-chrome.spec.ts
  ```

- [ ] AI mobile selector가 바뀐 경우 targeted regression:

  ```bash
  corepack pnpm --dir front test:e2e -- aigen-mobile-evidence.spec.ts
  ```

- [ ] lint/diff:

  ```bash
  corepack pnpm --dir front lint -- tests/e2e/host-session-record-preview.spec.ts tests/e2e/host-session-record-revisions.spec.ts tests/e2e/responsive-navigation-chrome.spec.ts
  git diff --check
  ```

- [ ] Commit:

  ```bash
  git add front/shared/styles/mobile.css front/tests/e2e/host-session-record-preview.spec.ts front/tests/e2e/host-session-record-revisions.spec.ts front/tests/e2e/responsive-navigation-chrome.spec.ts front/tests/e2e/aigen-mobile-evidence.spec.ts
  git commit -m "test(front): verify responsive host editor workflow"
  ```

## Task 9: Active docs 동기화와 최종 검증

**Files:**

- Modify: `docs/development/session-import-generator.md`
- Modify if current behavior is described: `docs/development/architecture.md`
- Modify: `docs/superpowers/plans/2026-07-27-host-session-editor-ui-ux-redesign.md`

- [ ] active docs에서 UI terminology를 검색한다.

  ```bash
  rg -n "세션 기록 완성|공개 기록 초안|revision과 작업 이력|변경 이력|live revision|draft revision" docs/development docs/operations docs/showcase
  ```

- [ ] `session-import-generator.md`를 현재 UI에 맞춘다.

  - `세션 기록 완성` 패널 → `기록 작업대`의 `초안 만들기`
  - AI 기본 경로/외부 JSON fallback 설명 → 직접 작성·AI·JSON이 같은 공유 초안으로 수렴
  - JSON 절차 → `기록 작업대` → `외부 JSON` → preview → `초안으로 가져오기`
  - 내부 AI generation revision contract는 운영/기술 문맥이므로 그대로 유지

- [ ] `architecture.md`에 사용자 UI 이름이 있다면 새 이름으로만 갱신한다. API의 revision contract 또는 database term은 번역/rename하지 않는다.

- [ ] plan의 실행 checkbox를 실제 결과에 맞게 체크하고, command가 환경 문제로 skip된 경우 명령과 이유를 해당 task에 짧게 기록한다.

- [ ] focused frontend test 전체를 다시 실행한다.

  ```bash
  corepack pnpm --dir front test -- features/host/model/host-session-editor-navigation.test.ts features/host/model/host-session-editor-view-model.test.ts features/host/ui/session-editor/session-editor-section-nav.test.tsx features/host/ui/session-editor/session-overview-section.test.tsx features/host/ui/session-editor/session-record-workspace.test.tsx features/host/ui/session-editor/session-record-draft-panel.test.tsx features/host/ui/session-editor/session-history-panel.test.tsx features/host/ui/session-editor/session-import-panel.test.tsx features/host/route/host-session-editor-route.test.tsx tests/unit/host-session-editor-model.test.ts tests/unit/host-session-editor-route.test.tsx tests/unit/host-session-editor.test.tsx
  ```

- [ ] canonical frontend gates를 최종 HEAD에서 실행한다.

  ```bash
  corepack pnpm --dir front lint
  corepack pnpm --dir front test
  corepack pnpm --dir front build
  ```

- [ ] 최종 high-risk E2E를 한 번 더 실행한다.

  ```bash
  corepack pnpm --dir front test:e2e -- host-session-record-preview.spec.ts host-session-record-revisions.spec.ts responsive-navigation-chrome.spec.ts aigen-mobile-evidence.spec.ts
  ```

- [ ] architecture/public-safety residue를 확인한다.

  ```bash
  rg -n "from [\"']@/features/host/(api|queries|route)|from [\"']@/shared/api" front/features/host/ui/session-editor
  rg -n '"[^"]*(live revision|draft revision|revision과 작업 이력|세션 기록 완성|공개 기록 초안)[^"]*"' front/features/host/ui
  rg -n "host@example\\.com|member1@example\\.com|private\\.example\\.com|Bearer [A-Za-z0-9._-]+" docs/superpowers/plans/2026-07-27-host-session-editor-ui-ux-redesign.md docs/development/session-import-generator.md front/features/host front/tests
  git diff --check
  ```

  Expected:

  - UI → API/query/route import 0건
  - 사용자 렌더링 문자열의 금지 용어 0건
  - 새 private fixture 0건. 기존 synthetic E2E fixture match는 변경하지 않았음을 diff로 확인
  - whitespace error 0건

- [ ] base diff와 관련 없는 파일이 섞이지 않았는지 확인한다.

  ```bash
  git status --short --branch
  git diff --stat origin/main...HEAD
  git diff --name-only origin/main...HEAD
  ```

- [ ] docs commit:

  ```bash
  git add docs/development/session-import-generator.md docs/development/architecture.md docs/superpowers/plans/2026-07-27-host-session-editor-ui-ux-redesign.md
  git commit -m "docs: update host session editor workflow"
  ```

- [ ] `verification-before-completion` skill을 적용해 최종 HEAD의 실제 command output을 다시 확인한다. 통과하지 않은 검증은 통과했다고 보고하지 않는다.

## Final Acceptance Checklist

- [ ] edit route 첫 화면이 개요이며 상태와 다음 행동이 form보다 먼저 보인다.
- [ ] desktop/mobile에서 한 번에 section 하나만 보인다.
- [ ] section 전환 후 기본 정보, 공유 초안, AI/JSON review state가 유지된다.
- [ ] 전역 `변경 사항 저장`이 없고 각 section의 저장 의미가 분명하다.
- [ ] 직접 작성·AI·JSON이 하나의 작업 중 초안으로 수렴한다.
- [ ] 현재 적용본과 공개 범위가 분리되어 보인다.
- [ ] 사용자 UI에 `revision`, `live revision`, `draft revision`이 남지 않는다.
- [ ] 적용 기록이 없을 때 `버전 0`이 보이지 않는다.
- [ ] apply dialog가 현재→다음 버전, 변경 항목, 공개 범위, 알림 분리를 설명한다.
- [ ] restore는 새 초안을 만들고 현재 적용본을 즉시 바꾸지 않는다.
- [ ] 취소/Escape/backdrop/section 전환/route navigation이 apply나 notification mutation을 만들지 않는다.
- [ ] autosave error, validation issue, stale base, history pagination error에 복구 action이 있다.
- [ ] OPEN/CLOSED/PUBLISHED와 HOST_ONLY/MEMBER/PUBLIC이 서로 다른 축으로 표현된다.
- [ ] 320px와 390px에서 tab, sticky action, dialog, bottom app navigation이 겹치지 않는다.
- [ ] UI module의 route-first dependency direction이 유지된다.
- [ ] focused unit/component/route tests, canonical lint/test/build, high-risk E2E, browser evidence가 최종 HEAD 기준으로 확인된다.
