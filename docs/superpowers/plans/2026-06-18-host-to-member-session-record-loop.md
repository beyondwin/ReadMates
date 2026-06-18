# Host-to-Member Session Record Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a thin end-to-end record loop where hosts see exactly what a session-record import commit changed, and members get a clearer path into newly preserved records and feedback documents.

**Architecture:** Keep this frontend-first and server-contract-preserving. Host import commit state stays in `front/features/host`, member recent-record affordances stay in `front/features/member-home`, and archive feedback readability copy stays in `front/features/archive`; do not add host-to-member direct imports. Use pure model functions first, then pass their outputs into prop-driven UI components.

**Tech Stack:** Vite React, React Router 7, TanStack Query v5, Vitest + Testing Library, Playwright E2E, Cloudflare Pages Functions BFF. Kotlin/Spring server remains unchanged for this plan.

---

## File Structure

- Modify: `front/features/host/model/session-import-model.ts`
  - Add commit-result and failure-state model helpers.
- Modify: `front/features/host/model/session-import-model.test.ts`
  - Pin commit-result summary, refresh-failure copy, and non-leak behavior.
- Modify: `front/features/host/ui/session-editor/session-import-panel.tsx`
  - Render the commit-result card and refined failure messages.
- Modify: `front/features/host/ui/session-editor/session-import-panel.test.tsx`
  - Verify commit-result rendering, blocked state, and raw JSON non-rendering.
- Modify: `front/features/host/ui/host-session-editor.tsx`
  - Store latest import outcome, pass it to the import panel, and preserve existing dispatch behavior.
- Modify: `front/tests/unit/host-session-editor.test.tsx`
  - Cover successful import outcome and failed import copy at editor level.
- Modify: `front/features/member-home/model/member-home-view-model.ts`
  - Add a recent preserved-record model derived from note feed items.
- Modify: `front/features/member-home/model/member-home-view-model.test.ts`
  - Pin recent-record selection and empty states.
- Modify: `front/features/member-home/ui/member-home-records.tsx`
  - Add desktop/mobile recent-record entry components that link to archive detail or notes.
- Modify: `front/features/member-home/ui/member-home.tsx`
  - Wire recent-record entry into desktop and mobile member home.
- Modify: `front/tests/unit/member-home.test.tsx`
  - Verify recent-record entry and public-safe rendering.
- Modify: `front/features/archive/model/archive-model.ts`
  - Add feedback document status copy helper for readable, locked, unavailable, and unpublished-like states.
- Modify: `front/tests/unit/archive-page.test.tsx`
  - Verify clearer archive feedback status copy on desktop/mobile.
- Modify: `front/tests/unit/member-session-detail-page.test.tsx`
  - Verify detail-page feedback status copy and links remain permission-safe.
- Modify: `front/tests/e2e/host-session-record-preview.spec.ts`
  - Extend existing public-safe fixture flow through commit result and member recent-record entry. Prefer extending this existing spec over adding a new broad E2E file.
- Modify: `CHANGELOG.md`
  - Add one Unreleased changed entry for host-to-member session record loop.

Do not modify server production code in the first pass. The current frontend state contains enough data for this plan: host commit response has publication, highlights, one-line reviews, and feedback document title; member home has note feed items; archive has feedback document readability status.

---

### Task 1: Host Import Commit Result Model

**Files:**
- Modify: `front/features/host/model/session-import-model.ts`
- Modify: `front/features/host/model/session-import-model.test.ts`

- [ ] **Step 1: Write failing model tests for commit outcome and failure states**

Append these tests inside the existing `describe("session import model", () => { ... })` block in `front/features/host/model/session-import-model.test.ts`.

```ts
it("builds a commit result summary from committed import data", () => {
  const result = buildSessionImportCommitResult(
    {
      sessionId: "session-7",
      publication: { summary: "새 공개 요약입니다." },
      highlights: [record({ authorName: "독자A", authorMatched: true })],
      oneLineReviews: [
        record({ authorName: "독자B", authorMatched: true }),
        record({ authorName: "독자C", authorMatched: true }),
      ],
      feedbackDocument: {
        uploaded: true,
        fileName: "session-7-feedback.md",
        title: "독서모임 7차 피드백",
        uploadedAt: "2026-05-16T12:00:00Z",
      },
    },
    "MEMBER",
  );

  expect(result).toEqual({
    tone: "success",
    title: "저장 완료",
    message: "가져온 세션 기록을 저장했습니다.",
    visibilityLabel: "멤버 공개",
    items: [
      "공개 요약 교체",
      "하이라이트 1개 저장",
      "한줄평 2개 저장",
      "피드백 문서 저장: 독서모임 7차 피드백",
    ],
    nextAction: "멤버는 아카이브와 피드백 문서에서 이 기록을 이어 읽을 수 있습니다.",
  });
});

it("keeps commit result summary public safe", () => {
  const result = buildSessionImportCommitResult(
    {
      sessionId: "session-7",
      publication: { summary: "{\"raw\":\"PRIVATE_MEMBER_EMAIL\"}" },
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: {
        uploaded: true,
        fileName: "PRIVATE_MEMBER_EMAIL-session.md",
        title: "독서모임 7차 피드백",
        uploadedAt: null,
      },
    },
    "PUBLIC",
  );

  expect(result.items.join(" ")).not.toContain("PRIVATE_MEMBER_EMAIL");
  expect(result.items.join(" ")).not.toContain("{\"raw\"");
  expect(result.visibilityLabel).toBe("외부 공개");
});

it("classifies session import failure copy by stage", () => {
  expect(sessionImportFailureMessage("preview")).toBe("가져온 JSON에서 수정할 항목이 있습니다.");
  expect(sessionImportFailureMessage("commit-revalidation")).toBe(
    "저장 전 검증 상태가 바뀌었습니다. 미리보기를 다시 실행한 뒤 저장해 주세요.",
  );
  expect(sessionImportFailureMessage("commit-permission")).toBe(
    "가져온 세션 기록 저장에 실패했습니다. 현재 클럽과 호스트 권한을 확인해 주세요.",
  );
  expect(sessionImportFailureMessage("commit-network")).toBe(
    "가져온 세션 기록 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
  );
  expect(sessionImportFailureMessage("refresh")).toBe(
    "저장은 완료되었을 수 있습니다. 세션 문서를 새로 불러와 저장 결과를 확인해 주세요.",
  );
});
```

Also update the import list at the top of the test file:

```ts
import {
  buildSessionImportCommitResult,
  buildSessionImportReview,
  buildSessionImportRequest,
  sessionImportCanCommit,
  sessionImportFailureMessage,
  sessionImportReplacementSummary,
  sessionImportReplacementWarning,
  summarizeAuthorMatches,
} from "./session-import-model";
```

- [ ] **Step 2: Run the targeted model test and verify it fails**

Run:

```bash
pnpm --dir front test -- session-import-model
```

Expected: fail with missing exports `buildSessionImportCommitResult` and `sessionImportFailureMessage`.

- [ ] **Step 3: Implement the minimal model helpers**

Add these imports and types near the top of `front/features/host/model/session-import-model.ts`.

```ts
import type {
  SessionImportCommitResponse,
  SessionImportPreviewResponse,
  SessionImportRequest,
  SessionImportRecordPreview,
  SessionRecordVisibility,
} from "./host-view-types";
```

Replace the existing import block with the block above so `SessionImportCommitResponse` is included once.

Add these types after `SessionImportReview`.

```ts
export type SessionImportCommitResult = {
  tone: "success";
  title: "저장 완료";
  message: string;
  visibilityLabel: string;
  items: string[];
  nextAction: string;
};

export type SessionImportFailureStage =
  | "preview"
  | "commit-revalidation"
  | "commit-permission"
  | "commit-network"
  | "refresh";
```

Add these exported helpers after `sessionImportReplacementSummary`.

```ts
export function buildSessionImportCommitResult(
  committed: SessionImportCommitResponse,
  recordVisibility: SessionRecordVisibility,
): SessionImportCommitResult {
  const feedbackDocumentLabel = committed.feedbackDocument.title || committed.feedbackDocument.fileName;

  return {
    tone: "success",
    title: "저장 완료",
    message: "가져온 세션 기록을 저장했습니다.",
    visibilityLabel: recordVisibilityLabel(recordVisibility),
    items: [
      "공개 요약 교체",
      `하이라이트 ${committed.highlights.length}개 저장`,
      `한줄평 ${committed.oneLineReviews.length}개 저장`,
      `피드백 문서 저장: ${feedbackDocumentLabel}`,
    ],
    nextAction:
      recordVisibility === "PUBLIC"
        ? "멤버와 공개 기록 화면에서 이 기록을 이어 읽을 수 있습니다."
        : "멤버는 아카이브와 피드백 문서에서 이 기록을 이어 읽을 수 있습니다.",
  };
}

export function sessionImportFailureMessage(stage: SessionImportFailureStage): string {
  if (stage === "preview") {
    return "가져온 JSON에서 수정할 항목이 있습니다.";
  }

  if (stage === "commit-revalidation") {
    return "저장 전 검증 상태가 바뀌었습니다. 미리보기를 다시 실행한 뒤 저장해 주세요.";
  }

  if (stage === "commit-permission") {
    return "가져온 세션 기록 저장에 실패했습니다. 현재 클럽과 호스트 권한을 확인해 주세요.";
  }

  if (stage === "refresh") {
    return "저장은 완료되었을 수 있습니다. 세션 문서를 새로 불러와 저장 결과를 확인해 주세요.";
  }

  return "가져온 세션 기록 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
}
```

Add this private helper near `isSaveableVisibility`.

```ts
function recordVisibilityLabel(recordVisibility: SessionRecordVisibility): string {
  if (recordVisibility === "PUBLIC") {
    return "외부 공개";
  }

  if (recordVisibility === "MEMBER") {
    return "멤버 공개";
  }

  return "호스트 전용";
}
```

- [ ] **Step 4: Run the targeted model test and verify it passes**

Run:

```bash
pnpm --dir front test -- session-import-model
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add front/features/host/model/session-import-model.ts front/features/host/model/session-import-model.test.ts
git commit -m "feat(front): model session import commit results"
```

---

### Task 2: Host Import Panel and Editor Wiring

**Files:**
- Modify: `front/features/host/ui/session-editor/session-import-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-import-panel.test.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Write failing panel tests for commit result rendering**

Update imports in `front/features/host/ui/session-editor/session-import-panel.test.tsx`.

```ts
import type {
  SessionImportPreviewResponse,
  SessionImportRecordPreview,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import type { SessionImportCommitResult } from "@/features/host/model/session-import-model";
```

Append these tests.

```ts
it("renders a commit result after import save", () => {
  renderPanel({
    preview: preview({ valid: true }),
    commitResult: {
      tone: "success",
      title: "저장 완료",
      message: "가져온 세션 기록을 저장했습니다.",
      visibilityLabel: "멤버 공개",
      items: ["공개 요약 교체", "하이라이트 1개 저장", "한줄평 1개 저장", "피드백 문서 저장: 독서모임 7차 피드백"],
      nextAction: "멤버는 아카이브와 피드백 문서에서 이 기록을 이어 읽을 수 있습니다.",
    },
  });

  const result = screen.getByRole("region", { name: "세션 기록 저장 결과" });
  expect(within(result).getByText("저장 완료")).toBeInTheDocument();
  expect(within(result).getByText("멤버 공개")).toBeInTheDocument();
  expect(within(result).getByText("하이라이트 1개 저장")).toBeInTheDocument();
  expect(within(result).getByText("피드백 문서 저장: 독서모임 7차 피드백")).toBeInTheDocument();
  expect(within(result).getByText("멤버는 아카이브와 피드백 문서에서 이 기록을 이어 읽을 수 있습니다.")).toBeInTheDocument();
});

it("renders refresh failure as a distinct alert", () => {
  renderPanel({
    preview: preview({ valid: true }),
    status: "error",
    error: "저장은 완료되었을 수 있습니다. 세션 문서를 새로 불러와 저장 결과를 확인해 주세요.",
  });

  expect(screen.getByRole("alert")).toHaveTextContent("저장은 완료되었을 수 있습니다.");
});
```

Update the local `renderPanel` helper signature:

```ts
function renderPanel({
  preview,
  recordVisibility = "MEMBER",
  status,
  error,
  commitResult = null,
  onCommit = vi.fn(),
}: {
  preview: SessionImportPreviewResponse;
  recordVisibility?: SessionRecordVisibility;
  status?: "idle" | "previewing" | "ready" | "committing" | "error";
  error?: string | null;
  commitResult?: SessionImportCommitResult | null;
  onCommit?: () => void;
}) {
  render(
    <SessionImportPanelBody
      sessionId="session-1"
      recordVisibility={recordVisibility}
      preview={preview}
      commitResult={commitResult}
      status={status ?? (preview.valid ? "ready" : "error")}
      error={error ?? (preview.valid ? null : "가져온 JSON에서 수정할 항목이 있습니다.")}
      onFileSelected={() => {}}
      onCommit={onCommit}
    />,
  );
}
```

- [ ] **Step 2: Run the targeted panel test and verify it fails**

Run:

```bash
pnpm --dir front test -- session-import-panel
```

Expected: fail because `SessionImportPanelBody` does not accept `commitResult`.

- [ ] **Step 3: Implement panel props and result card**

Modify `front/features/host/ui/session-editor/session-import-panel.tsx`.

Add `SessionImportCommitResult` to the model import:

```ts
import {
  buildSessionImportReview,
  sessionImportReplacementWarning,
  type SessionImportCommitResult,
  type SessionImportReview,
} from "@/features/host/model/session-import-model";
```

Add the prop:

```ts
type SessionImportPanelBodyProps = {
  sessionId: string | undefined;
  recordVisibility: SessionRecordVisibility;
  preview: SessionImportPreviewResponse | null;
  commitResult: SessionImportCommitResult | null;
  status: "idle" | "previewing" | "ready" | "committing" | "error";
  error: string | null;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
};
```

Destructure `commitResult` and render it after the preview card:

```tsx
{review && preview ? <SessionImportReviewCard review={review} summary={preview.publication.summary} /> : null}
{commitResult ? <SessionImportCommitResultCard result={commitResult} /> : null}
```

Add this component below `SessionImportReviewCard`.

```tsx
function SessionImportCommitResultCard({ result }: { result: SessionImportCommitResult }) {
  return (
    <section
      className="surface-quiet"
      role="region"
      aria-label="세션 기록 저장 결과"
      style={{ padding: 16, overflowWrap: "anywhere" }}
    >
      <div className="row-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="stack" style={{ "--stack": "6px", minWidth: 0 } as CSSProperties}>
          <div className="eyebrow">저장 결과</div>
          <div className="small">{result.message}</div>
        </div>
        <span className="rm-state rm-state--success">{result.title}</span>
      </div>
      <div className="tiny" style={{ marginTop: 10, color: "var(--text-2)" }}>
        {result.visibilityLabel}
      </div>
      <ul className="tiny" style={{ display: "grid", gap: 8, margin: "12px 0 0", paddingLeft: 18 }}>
        {result.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="small" style={{ color: "var(--text-2)", margin: "12px 0 0" }}>
        {result.nextAction}
      </p>
    </section>
  );
}
```

Pass `commitResult` through `SessionImportPanel`.

```tsx
<SessionImportPanelBody
  sessionId={sessionId}
  recordVisibility={recordVisibility}
  preview={preview}
  commitResult={commitResult}
  status={status}
  error={error}
  onFileSelected={onFileSelected}
  onCommit={onCommit}
/>
```

- [ ] **Step 4: Wire commit result state in the editor**

Modify `front/features/host/ui/host-session-editor.tsx`.

Update imports from the session import model:

```ts
import {
  buildSessionImportCommitResult,
  buildSessionImportRequest,
  sessionImportFailureMessage,
} from "@/features/host/model/session-import-model";
import type { SessionImportCommitResult } from "@/features/host/model/session-import-model";
```

Add state next to existing import state:

```ts
const [sessionImportCommitResult, setSessionImportCommitResult] = useState<SessionImportCommitResult | null>(null);
```

In `previewSessionImport`, clear any previous result before previewing:

```ts
setSessionImportCommitResult(null);
```

When preview returns invalid, use the model copy:

```ts
if (!preview.valid) {
  setSessionImportError(sessionImportFailureMessage("preview"));
}
```

In `commitSessionImport`, after `const committed = await actions.commitSessionImport(...)`, build the result before clearing request state:

```ts
setSessionImportCommitResult(buildSessionImportCommitResult(committed, sessionImportRequest.recordVisibility));
setSessionImportStatus("idle");
setSessionImportPreview(null);
setSessionImportRequest(null);
flash("가져온 세션 기록을 저장했습니다");
```

Replace the catch block with:

```ts
} catch {
  setSessionImportStatus("error");
  setSessionImportError(sessionImportFailureMessage("commit-network"));
}
```

Pass the result into the panel:

```tsx
<SessionImportPanel
  activeMobileSection={activeMobileSection}
  sessionId={session?.sessionId}
  recordVisibility={recordVisibility}
  preview={sessionImportPreview}
  commitResult={sessionImportCommitResult}
  status={sessionImportStatus}
  error={sessionImportError}
  onFileSelected={previewSessionImport}
  onCommit={commitSessionImport}
 />
```

- [ ] **Step 5: Add editor-level tests for successful commit result**

In `front/tests/unit/host-session-editor.test.tsx`, find the existing import JSON tests. Add this test near them:

```ts
it("shows the session import commit result after saving imported records", async () => {
  const user = userEvent.setup();
  render(<HostSessionEditorForTest session={session} />);

  await user.click(screen.getByRole("tab", { name: "외부 JSON 가져오기" }));
  const file = new File([sessionImportJson()], "session-import.json", { type: "application/json" });
  await user.upload(screen.getByLabelText("AI 결과 JSON 가져오기"), file);

  await screen.findByRole("region", { name: "세션 기록 미리보기" });
  await user.click(screen.getByRole("button", { name: "가져온 기록 저장" }));

  const result = await screen.findByRole("region", { name: "세션 기록 저장 결과" });
  expect(within(result).getByText("저장 완료")).toBeInTheDocument();
  expect(within(result).getByText("멤버 공개")).toBeInTheDocument();
  expect(within(result).getByText("피드백 문서 저장: 독서모임 7차 피드백")).toBeInTheDocument();
  expect(screen.queryByText("PRIVATE_MEMBER_EMAIL")).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run targeted host tests**

Run:

```bash
pnpm --dir front test -- session-import-panel host-session-editor
```

Expected: pass.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add front/features/host/ui/session-editor/session-import-panel.tsx front/features/host/ui/session-editor/session-import-panel.test.tsx front/features/host/ui/host-session-editor.tsx front/tests/unit/host-session-editor.test.tsx
git commit -m "feat(front): show session import commit results"
```

---

### Task 3: Member Recent Record Entry and Archive Feedback Status Copy

**Files:**
- Modify: `front/features/member-home/model/member-home-view-model.ts`
- Modify: `front/features/member-home/model/member-home-view-model.test.ts`
- Modify: `front/features/member-home/ui/member-home-records.tsx`
- Modify: `front/features/member-home/ui/member-home.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`
- Modify: `front/features/archive/model/archive-model.ts`
- Modify: `front/tests/unit/archive-page.test.tsx`
- Modify: `front/tests/unit/member-session-detail-page.test.tsx`

- [ ] **Step 1: Write failing member-home model tests**

Append to `front/features/member-home/model/member-home-view-model.test.ts`.

```ts
it("derives the latest preserved record entry from note feed items", () => {
  expect(getMemberHomeRecentRecordEntry(noteFeedItems)).toEqual({
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "지난 책",
    date: "2026-04-15",
    kindLabels: ["한줄평"],
    href: "/app/sessions/session-6",
    feedbackHref: "/app/feedback/session-6",
    summary: "지난 책의 보존된 기록을 이어 읽을 수 있어요.",
  });
});

it("returns null when there is no preserved record entry", () => {
  expect(getMemberHomeRecentRecordEntry([])).toBeNull();
});
```

Update imports:

```ts
import {
  getMemberHomeNextReadingAction,
  getMemberHomeRecentRecordEntry,
  type MemberHomeCurrentSessionView,
  type MemberHomeNoteFeedItemView,
} from "./member-home-view-model";
```

- [ ] **Step 2: Run member-home model test and verify it fails**

Run:

```bash
pnpm --dir front test -- member-home-view-model
```

Expected: fail with missing `getMemberHomeRecentRecordEntry`.

- [ ] **Step 3: Implement the member-home recent record model**

Add these types and helper to `front/features/member-home/model/member-home-view-model.ts` after `MemberHomeNextReadingActionInput`.

```ts
export type MemberHomeRecentRecordEntry = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  kindLabels: string[];
  href: string;
  feedbackHref: string;
  summary: string;
};

const NOTE_KIND_LABELS: Record<MemberHomeNoteFeedItemView["kind"], string> = {
  QUESTION: "질문",
  ONE_LINE_REVIEW: "한줄평",
  HIGHLIGHT: "하이라이트",
};

export function getMemberHomeRecentRecordEntry(
  noteFeedItems: MemberHomeNoteFeedItemView[],
): MemberHomeRecentRecordEntry | null {
  const first = noteFeedItems[0];
  if (!first) {
    return null;
  }

  const sameSessionItems = noteFeedItems.filter((item) => item.sessionId === first.sessionId);
  const kindLabels = Array.from(new Set(sameSessionItems.map((item) => NOTE_KIND_LABELS[item.kind])));

  return {
    sessionId: first.sessionId,
    sessionNumber: first.sessionNumber,
    bookTitle: first.bookTitle,
    date: first.date,
    kindLabels,
    href: `/app/sessions/${encodeURIComponent(first.sessionId)}`,
    feedbackHref: `/app/feedback/${encodeURIComponent(first.sessionId)}`,
    summary: `${first.bookTitle}의 보존된 기록을 이어 읽을 수 있어요.`,
  };
}
```

- [ ] **Step 4: Add member-home recent record UI**

In `front/features/member-home/ui/member-home-records.tsx`, import the type:

```ts
import type {
  MemberHomeCurrentSessionView as CurrentSessionResponse,
  MemberHomeNoteFeedItemView as NoteFeedItem,
  MemberHomeRecentRecordEntry,
} from "@/features/member-home/model/member-home-view-model";
```

Add these components before `ClubPulse`.

```tsx
export function RecentRecordEntry({
  entry,
  LinkComponent = PlainMemberHomeLink,
}: {
  entry: MemberHomeRecentRecordEntry | null;
  LinkComponent?: MemberHomeLinkComponent;
}) {
  if (!entry) {
    return null;
  }

  return (
    <section className="surface-quiet" aria-label="최근 발행 기록" style={{ padding: 20, overflowWrap: "anywhere" }}>
      <div className="row-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">최근 발행 기록</div>
          <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>
            No.{String(entry.sessionNumber).padStart(2, "0")} · {entry.bookTitle}
          </h2>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
            {entry.summary}
          </p>
          <div className="tiny" style={{ color: "var(--text-3)", marginTop: 8 }}>
            {entry.kindLabels.join(" · ")}
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Link to={entry.href} className="btn btn-primary btn-sm" LinkComponent={LinkComponent}>
            기록 보기
          </Link>
          <Link to={entry.feedbackHref} className="btn btn-quiet btn-sm" LinkComponent={LinkComponent}>
            피드백 보기
          </Link>
        </div>
      </div>
    </section>
  );
}

export function MobileRecentRecordEntry({
  entry,
  LinkComponent = PlainMemberHomeLink,
}: {
  entry: MemberHomeRecentRecordEntry | null;
  LinkComponent?: MemberHomeLinkComponent;
}) {
  if (!entry) {
    return null;
  }

  return (
    <section className="m-sec" aria-label="최근 발행 기록">
      <div className="m-card-quiet" style={{ overflowWrap: "anywhere" }}>
        <div className="eyebrow">최근 발행 기록</div>
        <div className="body editorial" style={{ fontSize: 15, marginTop: 6 }}>
          No.{String(entry.sessionNumber).padStart(2, "0")} · {entry.bookTitle}
        </div>
        <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
          {entry.summary}
        </p>
        <div className="m-row" style={{ gap: 8, marginTop: 12 }}>
          <Link to={entry.href} className="btn btn-primary btn-sm" LinkComponent={LinkComponent}>
            기록 보기
          </Link>
          <Link to={entry.feedbackHref} className="btn btn-quiet btn-sm" LinkComponent={LinkComponent}>
            피드백 보기
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire member-home UI**

In `front/features/member-home/ui/member-home.tsx`, update imports:

```ts
import {
  ClubPulse,
  MobileMemberActivity,
  MobileRecentRecordEntry,
  RecentRecordEntry,
  RosterSummary,
} from "@/features/member-home/ui/member-home-records";
import {
  getMemberHomeNextReadingAction,
  getMemberHomeRecentRecordEntry,
  type MemberHomeAuth as AuthMeResponse,
  type MemberHomeCurrentSessionView as CurrentSessionResponse,
  type MemberHomeNoteFeedItemView as NoteFeedItem,
  type MemberHomeUpcomingSessionView as MemberHomeUpcomingSession,
} from "@/features/member-home/model/member-home-view-model";
```

Inside `MemberHome`, compute:

```ts
const recentRecordEntry = getMemberHomeRecentRecordEntry(noteFeedItems);
```

Render it above `ClubPulse` in the desktop left stack:

```tsx
<RecentRecordEntry entry={recentRecordEntry} LinkComponent={LinkComponent} />
<ClubPulse items={noteFeedItems.slice(0, 3)} LinkComponent={LinkComponent} />
```

Inside `MobileMemberHome`, compute:

```ts
const recentRecordEntry = getMemberHomeRecentRecordEntry(noteFeedItems);
```

Render it before `MobileMemberActivity`:

```tsx
<MobileRecentRecordEntry entry={recentRecordEntry} LinkComponent={LinkComponent} />
<MobileMemberActivity items={noteFeedItems.slice(0, 4)} LinkComponent={LinkComponent} />
```

- [ ] **Step 6: Add member-home UI tests**

In `front/tests/unit/member-home.test.tsx`, add this test inside the existing `describe("MemberHome", ...)` block. Reuse the existing `auth` fixture from the top of the file.

```ts
it("shows a recent preserved record entry on desktop and mobile", () => {
  const { container } = render(
    <MemberHome
      auth={auth}
      current={{ currentSession: null }}
      noteFeedItems={[
        {
          sessionId: "session-6",
          sessionNumber: 6,
          bookTitle: "지난 책",
          date: "2026-04-15",
          authorName: "E2E 멤버",
          authorShortName: "멤",
          kind: "ONE_LINE_REVIEW",
          text: "지난 세션 기록입니다.",
        },
      ]}
      upcomingSessions={[]}
    />,
  );

  const desktop = within(container.querySelector(".rm-member-home-desktop") as HTMLElement);
  const mobile = within(container.querySelector(".rm-member-home-mobile") as HTMLElement);

  expect(desktop.getByRole("region", { name: "최근 발행 기록" })).toBeInTheDocument();
  expect(desktop.getByRole("link", { name: "기록 보기" })).toHaveAttribute("href", "/app/sessions/session-6");
  expect(desktop.getByRole("link", { name: "피드백 보기" })).toHaveAttribute("href", "/app/feedback/session-6");
  expect(mobile.getByRole("region", { name: "최근 발행 기록" })).toBeInTheDocument();
  expect(screen.queryByText("PRIVATE_MEMBER_EMAIL")).not.toBeInTheDocument();
});
```

- [ ] **Step 7: Add archive feedback status copy helper**

Append to `front/features/archive/model/archive-model.ts` near `feedbackDocumentStatusFromList`.

```ts
export type ArchiveFeedbackDocumentCopy = {
  badge: "피드백 O" | "피드백 잠김" | "피드백 없음";
  ariaLabel: string;
  helper: string;
};

export function feedbackDocumentCopy(status: ArchiveFeedbackDocumentStatus): ArchiveFeedbackDocumentCopy {
  if (status.readable) {
    return {
      badge: "피드백 O",
      ariaLabel: "열람 가능한 피드백 문서가 있습니다.",
      helper: status.title ? `${status.title}을 열람할 수 있습니다.` : "피드백 문서를 열람할 수 있습니다.",
    };
  }

  if (status.available && status.lockedReason === "ACTIVE_MEMBERSHIP_REQUIRED") {
    return {
      badge: "피드백 잠김",
      ariaLabel: "등록된 피드백 문서가 있지만 이 계정에는 열람 권한이 없습니다.",
      helper: "피드백 문서는 active 정식 멤버에게만 열립니다.",
    };
  }

  return {
    badge: "피드백 없음",
    ariaLabel: "아직 열람 가능한 피드백 문서가 없습니다.",
    helper: "호스트가 피드백 문서를 등록하면 이 회차에서 확인할 수 있습니다.",
  };
}
```

Then use this helper in `front/features/archive/ui/archive-desktop.tsx`, `front/features/archive/ui/archive-mobile.tsx`, and `front/features/archive/ui/member-session-detail-page.tsx` wherever the same status copy is currently built inline. Keep links hidden unless `status.readable === true`.

- [ ] **Step 8: Run targeted member/archive tests**

Run:

```bash
pnpm --dir front test -- member-home archive-page member-session-detail-page
```

Expected: pass.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add front/features/member-home/model/member-home-view-model.ts front/features/member-home/model/member-home-view-model.test.ts front/features/member-home/ui/member-home-records.tsx front/features/member-home/ui/member-home.tsx front/tests/unit/member-home.test.tsx front/features/archive/model/archive-model.ts front/features/archive/ui/archive-desktop.tsx front/features/archive/ui/archive-mobile.tsx front/features/archive/ui/member-session-detail-page.tsx front/tests/unit/archive-page.test.tsx front/tests/unit/member-session-detail-page.test.tsx
git commit -m "feat(front): connect members to preserved records"
```

---

### Task 4: E2E Evidence, CHANGELOG, and Release Checks

**Files:**
- Modify: `front/tests/e2e/host-session-record-preview.spec.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Extend E2E fixture routes for commit and member home**

In `front/tests/e2e/host-session-record-preview.spec.ts`, update `routeHostSessionEditor(page)` to handle commit:

```ts
await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/session-import/commit**`, async (route) => {
  await json(route, 200, {
    sessionId: SESSION_ID,
    publication: { summary: "공개 가능한 세션 요약입니다." },
    highlights: previewResponse().highlights,
    oneLineReviews: previewResponse().oneLineReviews,
    feedbackDocument: {
      uploaded: true,
      fileName: "session-7-feedback.md",
      title: "독서모임 7차 피드백",
      uploadedAt: "2026-05-16T12:00:00Z",
    },
  });
});
```

Add member auth and member home routes:

```ts
async function routeMemberHome(page: Page): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, {
      authenticated: true,
      userId: "user-member-e2e",
      membershipId: "member-a",
      clubId: "club-a-id",
      email: "member@example.com",
      displayName: "E2E 멤버",
      accountName: "E2E 멤버",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      currentMembership: {
        membershipId: "member-a",
        clubId: "club-a-id",
        clubSlug: CLUB_SLUG,
        displayName: "E2E 멤버",
        role: "MEMBER",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
      },
      joinedClubs: [],
      recommendedAppEntryUrl: `/clubs/${CLUB_SLUG}/app`,
    });
  });

  await page.route("**/api/bff/api/sessions/current**", async (route) => {
    await json(route, 200, { currentSession: null });
  });

  await page.route("**/api/bff/api/notes/feed**", async (route) => {
    await json(route, 200, {
      items: [
        {
          sessionId: SESSION_ID,
          sessionNumber: 7,
          bookTitle: "E2E 책",
          date: "2026-05-16",
          authorName: "독자B",
          authorShortName: "B",
          kind: "ONE_LINE_REVIEW",
          text: "한줄평입니다.",
        },
      ],
      nextCursor: null,
    });
  });

  await page.route("**/api/bff/api/sessions/upcoming**", async (route) => {
    await json(route, 200, []);
  });
}
```

- [ ] **Step 2: Extend the E2E assertion through commit and member entry**

In the existing test, after `await expectSessionRecordPreviewPublicSafe(page);`, add:

```ts
const commitPost = page.waitForResponse(
  (response) =>
    response.request().method() === "POST" &&
    response.url().includes(`/api/bff/api/host/sessions/${SESSION_ID}/session-import/commit`),
);
await page.getByRole("button", { name: "가져온 기록 저장" }).click();
expect((await commitPost).ok()).toBe(true);
const commitResult = page.getByRole("region", { name: "세션 기록 저장 결과" });
await expect(commitResult).toBeVisible();
await expect(commitResult.getByText("저장 완료")).toBeVisible();
await expect(commitResult.getByText("피드백 문서 저장: 독서모임 7차 피드백")).toBeVisible();
await expect(page.getByText("member1@example.com")).toHaveCount(0);
await expect(page.getByText("private.example.com")).toHaveCount(0);
```

After the mobile screenshot section, add a fresh member-home navigation:

```ts
await page.unrouteAll({ behavior: "ignoreErrors" });
await routeMemberHome(page);
await page.goto(`/clubs/${CLUB_SLUG}/app`);
const recentRecord = page.getByRole("region", { name: "최근 발행 기록" });
await expect(recentRecord).toBeVisible();
await expect(recentRecord.getByText("No.07 · E2E 책")).toBeVisible();
await expect(recentRecord.getByRole("link", { name: "기록 보기" })).toHaveAttribute(
  "href",
  `/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}`,
);
await expect(recentRecord.getByRole("link", { name: "피드백 보기" })).toHaveAttribute(
  "href",
  `/clubs/${CLUB_SLUG}/app/feedback/${SESSION_ID}`,
);
await expect(page.getByText("PRIVATE_MEMBER_EMAIL")).toHaveCount(0);
await expect(page.getByText("{\"")).toHaveCount(0);
```

- [ ] **Step 3: Run the targeted E2E**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
```

Expected: pass; screenshots are written under Playwright output, not committed.

- [ ] **Step 4: Update CHANGELOG**

Add this bullet under `## Unreleased` -> `### Changed` in `CHANGELOG.md`:

```md
- **host-to-member record loop:** 호스트 세션 기록 가져오기 저장 후 교체된 항목을 결과 장부로 보여주고, 멤버 홈에서 최근 발행 기록과 피드백 문서로 이어지는 진입을 강화했습니다. 서버/API contract, DB migration, auth/BFF token 변경은 없습니다.
```

- [ ] **Step 5: Run full frontend and public release checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: all pass.

- [ ] **Step 6: Inspect diff for public-safety and scope**

Run:

```bash
git diff --check
git diff --stat
rg -n "PRIVATE_MEMBER_EMAIL|private\\.example\\.com|member1@example\\.com|sk-[A-Za-z0-9]|/Users/" front CHANGELOG.md
```

Expected:
- `git diff --check` prints no output.
- `git diff --stat` only lists files in this plan.
- `rg` may find sentinel strings only inside tests that assert non-rendering; it must not find token-shaped examples or local absolute paths.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add front/tests/e2e/host-session-record-preview.spec.ts CHANGELOG.md
git commit -m "test(front): prove host-to-member record loop"
```

---

## Final Verification

Run this after all tasks are committed:

```bash
git status --short
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git log --oneline -4
```

Expected:
- Working tree is clean except intentional untracked local tool outputs, if any.
- All frontend and release-candidate checks pass.
- Last four commits correspond to Tasks 1-4.

No server verification is required if server production code and API contracts remain unchanged. If server code changes, also run:

```bash
./server/gradlew -p server clean test
```

Expected: pass.
