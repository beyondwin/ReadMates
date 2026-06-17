# Host Session Record Evidence Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the host session editor's external JSON import preview into a safe pre-commit review surface, then pin desktop/mobile public-safe Playwright evidence and local release-candidate checks.

**Architecture:** Keep the existing server preview/commit API contract unchanged. Add pure frontend review helpers in `front/features/host/model/session-import-model.ts`, render them through the existing prop/callback-based `SessionImportPanelBody`, and add a stubbed host-editor E2E spec that captures screenshot evidence without committing screenshot artifacts.

**Tech Stack:** React 19, TypeScript, Vite, React Testing Library, Vitest, Playwright E2E, Cloudflare Pages BFF route stubs, ReadMates public release candidate scripts.

---

## Scope

This plan implements `docs/superpowers/specs/2026-06-18-readmates-host-session-record-evidence-gate-design.md`.

In scope:

- Frontend-only review model for session import preview state.
- Host session editor JSON preview UI upgrade.
- UI and E2E tests for valid, invalid, unmatched-author, and public-safety states.
- CHANGELOG entry under `## Unreleased`.
- Local release evidence commands.

Out of scope:

- Server production code changes.
- DB migration.
- CI visual gate or GitHub Actions workflow changes.
- Production deploy/tag/OAuth/VM/provider smoke.
- Feedback document PDF download activation.

## File Structure

- Modify: `front/features/host/model/session-import-model.ts`
  - Owns JSON file parsing, commit eligibility, author matching summaries, replacement summary, and review model derivation.
- Modify: `front/features/host/model/session-import-model.test.ts`
  - Pins parser errors, valid review state, unmatched author summary, HOST_ONLY blocking, and invalid feedback document blocking.
- Create: `front/features/host/ui/session-editor/session-import-panel.test.tsx`
  - Pins `SessionImportPanelBody` rendering for valid preview, invalid preview, unmatched authors, issue messages, and safe commit button state.
- Modify: `front/features/host/ui/session-editor/session-import-panel.tsx`
  - Renders the review model as a compact pre-commit review surface while keeping props/callback-only boundaries.
- Create: `front/tests/e2e/host-session-record-preview.spec.ts`
  - Stubs host editor/auth/session/import-preview routes, uploads a JSON file, captures desktop/mobile screenshots through `testInfo.outputPath`, and asserts public-safe sentinel non-rendering.
- Modify: `CHANGELOG.md`
  - Records the host-visible session record preview enhancement under `## Unreleased`.

No server file is modified by this plan.

---

### Task 1: Session Import Review Model

**Files:**
- Modify: `front/features/host/model/session-import-model.test.ts`
- Modify: `front/features/host/model/session-import-model.ts`

- [ ] **Step 1: Replace the model test with the expanded contract**

Use this complete file content:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSessionImportRequest,
  buildSessionImportReview,
  sessionImportCanCommit,
  sessionImportReplacementSummary,
  sessionImportReplacementWarning,
  summarizeAuthorMatches,
} from "./session-import-model";
import type { SessionImportPreviewResponse, SessionImportRecordPreview } from "./host-view-types";

describe("session import model", () => {
  it("wraps generated import json with the selected editor visibility", () => {
    const request = buildSessionImportRequest(
      JSON.stringify({
        format: "readmates-session-import:v1",
        session: { number: 7, bookTitle: "Example Book", meetingDate: "2026-05-14" },
        publication: { summary: "Summary" },
        highlights: [{ authorName: "Host", text: "Highlight" }],
        oneLineReviews: [{ authorName: "Host", text: "One line" }],
        feedbackDocument: { fileName: "session-7.md", markdown: "<!-- readmates-feedback:v1 -->" },
      }),
      "MEMBER",
    );

    expect(request.recordVisibility).toBe("MEMBER");
    expect(request.format).toBe("readmates-session-import:v1");
    expect(request.highlights).toHaveLength(1);
  });

  it("rejects malformed json and missing format before preview", () => {
    expect(() => buildSessionImportRequest("{", "PUBLIC")).toThrow("JSON");
    expect(() => buildSessionImportRequest("{}", "PUBLIC")).toThrow("readmates-session-import:v1");
  });

  it("allows commit only for valid previews with saveable visibility", () => {
    expect(sessionImportCanCommit(preview({ valid: true, issueCount: 0 }), "MEMBER")).toBe(true);
    expect(sessionImportCanCommit(preview({ valid: true, issueCount: 0 }), "PUBLIC")).toBe(true);
    expect(sessionImportCanCommit(preview({ valid: true, issueCount: 0 }), "HOST_ONLY")).toBe(false);
    expect(sessionImportCanCommit(preview({ valid: false, issueCount: 1 }), "MEMBER")).toBe(false);
  });

  it("describes the replacement scope in one warning", () => {
    expect(sessionImportReplacementWarning()).toContain("요약");
    expect(sessionImportReplacementWarning()).toContain("피드백 문서");
  });

  it("summarizes author matching across highlights and one-line reviews", () => {
    const summary = summarizeAuthorMatches([
      record({ authorName: "독자A", authorMatched: true }),
      record({ authorName: "독자B", authorMatched: false }),
      record({ authorName: "독자B", authorMatched: false }),
      record({ authorName: "독자C", authorMatched: true }),
    ]);

    expect(summary.totalCount).toBe(4);
    expect(summary.matchedCount).toBe(2);
    expect(summary.unmatchedCount).toBe(2);
    expect(summary.unmatchedAuthors).toEqual(["독자B"]);
  });

  it("builds a saveable review model from a valid preview", () => {
    const review = buildSessionImportReview(preview({ valid: true, issueCount: 0 }), "MEMBER");

    expect(review.canCommit).toBe(true);
    expect(review.statusLabel).toBe("저장 가능");
    expect(review.statusTone).toBe("success");
    expect(review.sessionLabel).toBe("7회차 · Example Book · 2026-05-14");
    expect(review.replacementItems).toEqual([
      "공개 요약 교체",
      "하이라이트 1개",
      "한줄평 1개",
      "독서모임 7차 피드백",
    ]);
    expect(review.authorSummary.unmatchedAuthors).toEqual([]);
    expect(review.authorStatusLabel).toBe("작성자 매칭 완료");
    expect(review.feedbackDocumentStatusLabel).toBe("피드백 문서 구조 확인 완료");
    expect(review.blockingMessages).toEqual([]);
  });

  it("blocks review commit for HOST_ONLY visibility", () => {
    const review = buildSessionImportReview(preview({ valid: true, issueCount: 0 }), "HOST_ONLY");

    expect(review.canCommit).toBe(false);
    expect(review.statusLabel).toBe("확인 필요");
    expect(review.blockingMessages).toContain("기록 공개 범위를 MEMBER 또는 PUBLIC으로 바꾼 뒤 저장할 수 있습니다.");
  });

  it("surfaces invalid feedback document and server issues as blocking messages", () => {
    const review = buildSessionImportReview(
      preview({
        valid: false,
        issueCount: 1,
        feedbackDocumentValid: false,
        issues: [{ code: "ADMIN_ROUTE", message: "피드백 문서 heading을 확인해 주세요." }],
      }),
      "MEMBER",
    );

    expect(review.canCommit).toBe(false);
    expect(review.statusLabel).toBe("확인 필요");
    expect(review.statusTone).toBe("danger");
    expect(review.feedbackDocumentStatusLabel).toBe("피드백 문서 구조 확인 필요");
    expect(review.blockingMessages).toEqual([
      "피드백 문서 구조를 확인해 주세요.",
      "피드백 문서 heading을 확인해 주세요.",
    ]);
  });

  it("describes replacement items without exposing raw json", () => {
    expect(sessionImportReplacementSummary(preview({ valid: true, issueCount: 0 }))).toEqual([
      "공개 요약 교체",
      "하이라이트 1개",
      "한줄평 1개",
      "독서모임 7차 피드백",
    ]);
  });
});

function preview({
  valid,
  issueCount,
  feedbackDocumentValid = valid,
  issues,
}: {
  valid: boolean;
  issueCount: number;
  feedbackDocumentValid?: boolean;
  issues?: SessionImportPreviewResponse["issues"];
}): SessionImportPreviewResponse {
  return {
    valid,
    session: { sessionNumber: 7, bookTitle: "Example Book", meetingDate: "2026-05-14" },
    publication: { summary: "Summary" },
    highlights: [record({ authorName: "독자A", authorMatched: true })],
    oneLineReviews: [record({ authorName: "독자B", authorMatched: true })],
    feedbackDocument: {
      fileName: "session-7.md",
      title: "독서모임 7차 피드백",
      valid: feedbackDocumentValid,
    },
    issues: issues ?? Array.from({ length: issueCount }, (_, index) => ({
      code: `ISSUE_${index}`,
      message: "Issue",
    })),
  };
}

function record({
  authorName,
  authorMatched,
}: {
  authorName: string;
  authorMatched: boolean;
}): SessionImportRecordPreview {
  return {
    authorName,
    text: `${authorName} 기록`,
    authorMatched,
    membershipId: authorMatched ? `membership-${authorName}` : null,
  };
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --dir front test -- session-import-model
```

Expected: FAIL with TypeScript or runtime errors for missing `buildSessionImportReview`, `sessionImportReplacementSummary`, and `summarizeAuthorMatches`, plus the old `sessionImportCanCommit` signature not enforcing `HOST_ONLY`.

- [ ] **Step 3: Replace the model implementation**

Use this complete file content:

```ts
import type {
  SessionImportPreviewResponse,
  SessionImportRecordPreview,
  SessionImportRequest,
  SessionRecordVisibility,
} from "./host-view-types";

type SessionImportFileRequest = Omit<SessionImportRequest, "recordVisibility">;

export type SessionImportAuthorSummary = {
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  unmatchedAuthors: string[];
};

export type SessionImportReview = {
  canCommit: boolean;
  statusLabel: "저장 가능" | "확인 필요";
  statusTone: "success" | "danger";
  sessionLabel: string;
  replacementItems: string[];
  authorSummary: SessionImportAuthorSummary;
  authorStatusLabel: string;
  feedbackDocumentLabel: string;
  feedbackDocumentStatusLabel: string;
  blockingMessages: string[];
};

export function buildSessionImportRequest(sourceJson: string, recordVisibility: SessionRecordVisibility): SessionImportRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceJson);
  } catch {
    throw new Error("JSON 파일을 읽을 수 없습니다.");
  }

  const fileRequest = parseSessionImportFileRequest(parsed);
  return {
    ...fileRequest,
    recordVisibility,
  };
}

export function buildSessionImportReview(
  preview: SessionImportPreviewResponse,
  recordVisibility: SessionRecordVisibility,
): SessionImportReview {
  const authorSummary = summarizeAuthorMatches([...preview.highlights, ...preview.oneLineReviews]);
  const replacementItems = sessionImportReplacementSummary(preview);
  const blockingMessages = sessionImportBlockingMessages(preview, recordVisibility);
  const canCommit = sessionImportCanCommit(preview, recordVisibility);

  return {
    canCommit,
    statusLabel: canCommit ? "저장 가능" : "확인 필요",
    statusTone: canCommit ? "success" : "danger",
    sessionLabel: sessionImportSessionLabel(preview),
    replacementItems,
    authorSummary,
    authorStatusLabel:
      authorSummary.unmatchedCount === 0
        ? "작성자 매칭 완료"
        : `작성자 ${authorSummary.unmatchedCount}개 확인 필요`,
    feedbackDocumentLabel: preview.feedbackDocument.title ?? preview.feedbackDocument.fileName,
    feedbackDocumentStatusLabel: preview.feedbackDocument.valid
      ? "피드백 문서 구조 확인 완료"
      : "피드백 문서 구조 확인 필요",
    blockingMessages,
  };
}

export function summarizeAuthorMatches(records: ReadonlyArray<SessionImportRecordPreview>): SessionImportAuthorSummary {
  const unmatchedAuthors = uniqueStrings(records.filter((record) => !record.authorMatched).map((record) => record.authorName));
  return {
    totalCount: records.length,
    matchedCount: records.filter((record) => record.authorMatched).length,
    unmatchedCount: records.filter((record) => !record.authorMatched).length,
    unmatchedAuthors,
  };
}

export function sessionImportCanCommit(
  preview: SessionImportPreviewResponse | null,
  recordVisibility?: SessionRecordVisibility,
): boolean {
  return (
    preview?.valid === true &&
    preview.issues.length === 0 &&
    preview.feedbackDocument.valid &&
    recordVisibility !== "HOST_ONLY"
  );
}

export function sessionImportReplacementWarning(): string {
  return "저장하면 이 회차의 요약, 하이라이트, 한줄평, 피드백 문서를 가져온 JSON 내용으로 교체합니다.";
}

export function sessionImportReplacementSummary(preview: SessionImportPreviewResponse): string[] {
  return [
    "공개 요약 교체",
    `하이라이트 ${preview.highlights.length}개`,
    `한줄평 ${preview.oneLineReviews.length}개`,
    preview.feedbackDocument.title ?? preview.feedbackDocument.fileName,
  ];
}

function sessionImportSessionLabel(preview: SessionImportPreviewResponse): string {
  const sessionNumber = preview.session.sessionNumber ? `${preview.session.sessionNumber}회차` : "회차 확인 필요";
  const bookTitle = preview.session.bookTitle ?? "책 제목 확인 필요";
  const meetingDate = preview.session.meetingDate ?? "날짜 확인 필요";
  return `${sessionNumber} · ${bookTitle} · ${meetingDate}`;
}

function sessionImportBlockingMessages(
  preview: SessionImportPreviewResponse,
  recordVisibility: SessionRecordVisibility,
): string[] {
  const messages: string[] = [];
  if (recordVisibility === "HOST_ONLY") {
    messages.push("기록 공개 범위를 MEMBER 또는 PUBLIC으로 바꾼 뒤 저장할 수 있습니다.");
  }
  if (!preview.feedbackDocument.valid) {
    messages.push("피드백 문서 구조를 확인해 주세요.");
  }
  for (const issue of preview.issues) {
    if (!messages.includes(issue.message)) {
      messages.push(issue.message);
    }
  }
  return messages;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function parseSessionImportFileRequest(value: unknown): SessionImportFileRequest {
  if (!isRecord(value) || value.format !== "readmates-session-import:v1") {
    throw new Error("readmates-session-import:v1 형식의 JSON 파일을 선택해 주세요.");
  }
  const session = requiredRecord(value.session, "session");
  const publication = requiredRecord(value.publication, "publication");
  const feedbackDocument = requiredRecord(value.feedbackDocument, "feedbackDocument");

  return {
    format: "readmates-session-import:v1",
    session: {
      number: requiredNumber(session.number, "session.number"),
      bookTitle: requiredString(session.bookTitle, "session.bookTitle"),
      meetingDate: requiredString(session.meetingDate, "session.meetingDate"),
    },
    publication: {
      summary: requiredString(publication.summary, "publication.summary"),
    },
    highlights: requiredRecords(value.highlights, "highlights").map(parseImportRecord),
    oneLineReviews: requiredRecords(value.oneLineReviews, "oneLineReviews").map(parseImportRecord),
    feedbackDocument: {
      fileName: requiredString(feedbackDocument.fileName, "feedbackDocument.fileName"),
      markdown: requiredString(feedbackDocument.markdown, "feedbackDocument.markdown"),
    },
  };
}

function parseImportRecord(value: Record<string, unknown>) {
  return {
    authorName: requiredString(value.authorName, "authorName"),
    text: requiredString(value.text, "text"),
  };
}

function requiredRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} 값을 확인해 주세요.`);
  }
  return value;
}

function requiredRecords(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error(`${fieldName} 목록을 확인해 주세요.`);
  }
  return value as Array<Record<string, unknown>>;
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} 값을 확인해 주세요.`);
  }
  return value;
}

function requiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} 값을 확인해 주세요.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm --dir front test -- session-import-model
```

Expected: PASS. The Vitest output should include `session-import-model.test.ts`.

- [ ] **Step 5: Commit the model change**

Run:

```bash
git add front/features/host/model/session-import-model.ts front/features/host/model/session-import-model.test.ts
git commit -m "feat(front): add session import review model"
```

Expected: commit succeeds.

---

### Task 2: Session Import Preview UI

**Files:**
- Create: `front/features/host/ui/session-editor/session-import-panel.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-import-panel.tsx`

- [ ] **Step 1: Add the UI contract test**

Create `front/features/host/ui/session-editor/session-import-panel.test.tsx` with this complete content:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionImportPreviewResponse, SessionImportRecordPreview, SessionRecordVisibility } from "@/features/host/model/host-view-types";
import { SessionImportPanelBody } from "./session-import-panel";

describe("SessionImportPanelBody", () => {
  it("renders a saveable preview review and calls commit", () => {
    const onCommit = vi.fn();
    renderPanel({ preview: preview({ valid: true }), onCommit });

    const review = screen.getByRole("region", { name: "세션 기록 미리보기" });
    expect(within(review).getByText("저장 가능")).toBeInTheDocument();
    expect(within(review).getByText("7회차 · E2E 책 · 2026-05-16")).toBeInTheDocument();
    expect(within(review).getByText("공개 요약 교체")).toBeInTheDocument();
    expect(within(review).getByText("하이라이트 1개")).toBeInTheDocument();
    expect(within(review).getByText("한줄평 1개")).toBeInTheDocument();
    expect(within(review).getByText("작성자 매칭 완료")).toBeInTheDocument();
    expect(within(review).getByText("피드백 문서 구조 확인 완료")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "가져온 기록 저장" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("shows unmatched authors and blocks HOST_ONLY visibility", () => {
    renderPanel({
      recordVisibility: "HOST_ONLY",
      preview: preview({
        valid: true,
        highlights: [record({ authorName: "긴 이름을 가진 외부 작성자", authorMatched: false })],
      }),
    });

    const review = screen.getByRole("region", { name: "세션 기록 미리보기" });
    expect(within(review).getByText("확인 필요")).toBeInTheDocument();
    expect(within(review).getByText("작성자 1개 확인 필요")).toBeInTheDocument();
    expect(within(review).getByText("긴 이름을 가진 외부 작성자")).toBeInTheDocument();
    expect(within(review).getByText("기록 공개 범위를 MEMBER 또는 PUBLIC으로 바꾼 뒤 저장할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가져온 기록 저장" })).toBeDisabled();
  });

  it("renders server issue messages but not issue codes or raw json", () => {
    renderPanel({
      preview: preview({
        valid: false,
        feedbackDocumentValid: false,
        issues: [{ code: "ADMIN_ROUTE", message: "피드백 문서 heading을 확인해 주세요." }],
      }),
    });

    const review = screen.getByRole("region", { name: "세션 기록 미리보기" });
    expect(within(review).getByText("피드백 문서 구조 확인 필요")).toBeInTheDocument();
    expect(within(review).getByText("피드백 문서 구조를 확인해 주세요.")).toBeInTheDocument();
    expect(within(review).getByText("피드백 문서 heading을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
    expect(screen.queryByText("{\"")).toBeNull();
    expect(screen.getByRole("button", { name: "가져온 기록 저장" })).toBeDisabled();
  });
});

function renderPanel({
  preview,
  recordVisibility = "MEMBER",
  onCommit = vi.fn(),
}: {
  preview: SessionImportPreviewResponse;
  recordVisibility?: SessionRecordVisibility;
  onCommit?: () => void;
}) {
  render(
    <SessionImportPanelBody
      sessionId="session-1"
      recordVisibility={recordVisibility}
      preview={preview}
      status={preview.valid ? "ready" : "error"}
      error={preview.valid ? null : "가져온 JSON에서 수정할 항목이 있습니다."}
      onFileSelected={() => {}}
      onCommit={onCommit}
    />,
  );
}

function preview({
  valid,
  feedbackDocumentValid = valid,
  highlights = [record({ authorName: "독자A", authorMatched: true })],
  oneLineReviews = [record({ authorName: "독자B", authorMatched: true })],
  issues = [],
}: {
  valid: boolean;
  feedbackDocumentValid?: boolean;
  highlights?: SessionImportRecordPreview[];
  oneLineReviews?: SessionImportRecordPreview[];
  issues?: SessionImportPreviewResponse["issues"];
}): SessionImportPreviewResponse {
  return {
    valid,
    session: { sessionNumber: 7, bookTitle: "E2E 책", meetingDate: "2026-05-16" },
    publication: { summary: "공개 가능한 세션 요약입니다." },
    highlights,
    oneLineReviews,
    feedbackDocument: {
      fileName: "session-7-feedback.md",
      title: "독서모임 7차 피드백",
      valid: feedbackDocumentValid,
    },
    issues,
  };
}

function record({
  authorName,
  authorMatched,
}: {
  authorName: string;
  authorMatched: boolean;
}): SessionImportRecordPreview {
  return {
    authorName,
    text: `${authorName} 기록`,
    authorMatched,
    membershipId: authorMatched ? `membership-${authorName}` : null,
  };
}
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run:

```bash
pnpm --dir front test -- session-import-panel
```

Expected: FAIL. The failures should mention missing `세션 기록 미리보기`, missing replacement summary, missing author matching status, or commit button still being enabled for `HOST_ONLY`.

- [ ] **Step 3: Replace the panel implementation**

Use this complete file content:

```tsx
import type { ChangeEvent, CSSProperties } from "react";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import {
  buildSessionImportReview,
  sessionImportReplacementWarning,
} from "@/features/host/model/session-import-model";
import { Panel } from "./session-editor-panel";
import type { MobileEditorSection } from "./mobile-editor-tabs";

type SessionImportPanelBodyProps = {
  sessionId: string | undefined;
  recordVisibility: SessionRecordVisibility;
  preview: SessionImportPreviewResponse | null;
  status: "idle" | "previewing" | "ready" | "committing" | "error";
  error: string | null;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
};

export function SessionImportPanelBody({
  sessionId,
  recordVisibility,
  preview,
  status,
  error,
  onFileSelected,
  onCommit,
}: SessionImportPanelBodyProps) {
  const review = preview ? buildSessionImportReview(preview, recordVisibility) : null;
  const canCommit = Boolean(sessionId) && status !== "committing" && review?.canCommit === true;

  return (
    <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
      <div className="small" style={{ color: "var(--text-2)" }}>
        {sessionId ? sessionImportReplacementWarning() : "세션을 만든 뒤 JSON 기록을 가져올 수 있습니다."}
      </div>
      <label className="field-label" htmlFor="session-import-json-file">
        AI 결과 JSON 가져오기
      </label>
      <input
        id="session-import-json-file"
        type="file"
        accept="application/json,.json"
        disabled={!sessionId || status === "previewing" || status === "committing"}
        onChange={onFileSelected}
      />
      {status === "previewing" ? (
        <div className="small" role="status">
          가져온 JSON을 확인하고 있습니다.
        </div>
      ) : null}
      {error ? (
        <div className="small" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}
      {review ? <SessionImportReviewCard review={review} /> : null}
      <button className="btn btn-primary" type="button" disabled={!canCommit} onClick={onCommit}>
        {status === "committing" ? "가져온 기록 저장 중" : "가져온 기록 저장"}
      </button>
      <div className="tiny">현재 선택한 공개 범위: {recordVisibility}</div>
    </div>
  );
}

function SessionImportReviewCard({
  review,
}: {
  review: ReturnType<typeof buildSessionImportReview>;
}) {
  return (
    <section
      className="surface-quiet"
      role="region"
      aria-label="세션 기록 미리보기"
      style={{ padding: 16, overflowWrap: "anywhere" }}
    >
      <div className="row-between" style={{ gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">세션 기록 미리보기</div>
          <div className="small" style={{ marginTop: 6 }}>
            {review.sessionLabel}
          </div>
        </div>
        <span className={`rm-state rm-state--${review.statusTone === "success" ? "success" : "danger"}`}>
          {review.statusLabel}
        </span>
      </div>

      <div className="stack" style={{ "--stack": "12px", marginTop: 14 } as CSSProperties}>
        <section aria-label="교체 항목">
          <div className="tiny" style={{ color: "var(--text-2)", fontWeight: 700 }}>
            교체 항목
          </div>
          <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {review.replacementItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-label="작성자 매칭">
          <div className="tiny" style={{ color: "var(--text-2)", fontWeight: 700 }}>
            작성자 매칭
          </div>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {review.authorStatusLabel} · 매칭 {review.authorSummary.matchedCount}개 / 전체 {review.authorSummary.totalCount}개
          </p>
          {review.authorSummary.unmatchedAuthors.length > 0 ? (
            <ul className="small" aria-label="불일치 작성자" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {review.authorSummary.unmatchedAuthors.map((authorName) => (
                <li key={authorName}>{authorName}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-label="피드백 문서">
          <div className="tiny" style={{ color: "var(--text-2)", fontWeight: 700 }}>
            피드백 문서
          </div>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {review.feedbackDocumentLabel} · {review.feedbackDocumentStatusLabel}
          </p>
        </section>

        {review.blockingMessages.length > 0 ? (
          <section aria-label="저장 차단 사유">
            <div className="tiny" style={{ color: "var(--danger)", fontWeight: 700 }}>
              저장 전 확인
            </div>
            <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--danger)" }}>
              {review.blockingMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

export function SessionImportPanel({
  activeMobileSection,
  sessionId,
  recordVisibility,
  preview,
  status,
  error,
  onFileSelected,
  onCommit,
}: SessionImportPanelBodyProps & {
  activeMobileSection: MobileEditorSection;
}) {
  return (
    <Panel
      eyebrow="AI 결과 JSON"
      title="세션 기록 가져오기"
      mobileSection="report"
      panelId="host-editor-panel-session-import"
      activeMobileSection={activeMobileSection}
    >
      <SessionImportPanelBody
        sessionId={sessionId}
        recordVisibility={recordVisibility}
        preview={preview}
        status={status}
        error={error}
        onFileSelected={onFileSelected}
        onCommit={onCommit}
      />
    </Panel>
  );
}
```

- [ ] **Step 4: Run the UI and model tests and verify they pass**

Run:

```bash
pnpm --dir front test -- session-import
```

Expected: PASS. The output should include `session-import-model.test.ts` and `session-import-panel.test.tsx`.

- [ ] **Step 5: Commit the UI change**

Run:

```bash
git add front/features/host/ui/session-editor/session-import-panel.tsx front/features/host/ui/session-editor/session-import-panel.test.tsx
git commit -m "feat(front): improve session import preview"
```

Expected: commit succeeds.

---

### Task 3: Host Editor E2E Visual Evidence

**Files:**
- Create: `front/tests/e2e/host-session-record-preview.spec.ts`

- [ ] **Step 1: Add the Playwright E2E spec**

Create `front/tests/e2e/host-session-record-preview.spec.ts` with this complete content:

```ts
import { expect, test, type Page, type Route } from "@playwright/test";
import type { HostSessionDetailResponse, SessionImportPreviewResponse } from "@/features/host/model/host-view-types";
import { hostSessionDetailResponse, routeHostEditorShell } from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const CLUB_SLUG = "club-a";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function sessionResponse(): HostSessionDetailResponse {
  return {
    ...hostSessionDetailResponse(SESSION_ID),
    visibility: "MEMBER",
    attendees: [
      {
        membershipId: "member-a",
        displayName: "독자A",
        accountName: "독자A",
        rsvpStatus: "GOING",
        attendanceStatus: "ATTENDED",
        participationStatus: "ACTIVE",
      },
      {
        membershipId: "member-b",
        displayName: "독자B",
        accountName: "독자B",
        rsvpStatus: "GOING",
        attendanceStatus: "ATTENDED",
        participationStatus: "ACTIVE",
      },
    ],
  };
}

function importJson() {
  return {
    format: "readmates-session-import:v1",
    session: { number: 7, bookTitle: "E2E 책", meetingDate: "2026-05-16" },
    publication: { summary: "공개 가능한 세션 요약입니다." },
    highlights: [{ authorName: "독자A", text: "하이라이트입니다." }],
    oneLineReviews: [{ authorName: "독자B", text: "한줄평입니다." }],
    feedbackDocument: {
      fileName: "session-7-feedback.md",
      markdown: "<!-- readmates-feedback:v1 -->\n\n# 독서모임 7차 피드백\n\n## 참여자별 피드백",
    },
    ignoredRawJsonSentinel: "{\"member1@example.com\":\"private.example.com\"}",
  };
}

function previewResponse(): SessionImportPreviewResponse {
  return {
    valid: true,
    session: { sessionNumber: 7, bookTitle: "E2E 책", meetingDate: "2026-05-16" },
    publication: { summary: "공개 가능한 세션 요약입니다." },
    highlights: [
      {
        authorName: "독자A",
        text: "하이라이트입니다.",
        authorMatched: true,
        membershipId: "member-a",
      },
    ],
    oneLineReviews: [
      {
        authorName: "독자B",
        text: "한줄평입니다.",
        authorMatched: true,
        membershipId: "member-b",
      },
    ],
    feedbackDocument: {
      fileName: "session-7-feedback.md",
      title: "독서모임 7차 피드백",
      valid: true,
    },
    issues: [],
  };
}

async function routeHostSessionEditor(page: Page): Promise<void> {
  await routeHostEditorShell(page, CLUB_SLUG);

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    const url = route.request().url();
    if (url.includes("/session-import/") || url.includes("/ai-generate")) {
      await route.fallback();
      return;
    }
    await json(route, 200, sessionResponse());
  });

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/session-import/preview`, async (route) => {
    await json(route, 200, previewResponse());
  });
}

async function uploadSessionImportJson(page: Page): Promise<void> {
  await page.getByLabel("AI 결과 JSON 가져오기").setInputFiles({
    name: "session-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importJson())),
  });
}

async function expectSessionRecordPreviewPublicSafe(page: Page): Promise<void> {
  const review = page.getByRole("region", { name: "세션 기록 미리보기" });
  await expect(review).toBeVisible();
  await expect(review.getByText("저장 가능")).toBeVisible();
  await expect(review.getByText("7회차 · E2E 책 · 2026-05-16")).toBeVisible();
  await expect(review.getByText("공개 요약 교체")).toBeVisible();
  await expect(review.getByText("하이라이트 1개")).toBeVisible();
  await expect(review.getByText("한줄평 1개")).toBeVisible();
  await expect(review.getByText("작성자 매칭 완료")).toBeVisible();
  await expect(review.getByText("피드백 문서 구조 확인 완료")).toBeVisible();
  await expect(page.getByRole("button", { name: "가져온 기록 저장" })).toBeEnabled();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

test("host captures public-safe session record preview evidence on desktop and mobile", async ({ page }, testInfo) => {
  await routeHostSessionEditor(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?records=json`);
  await expect(page.getByLabel("AI 결과 JSON 가져오기")).toBeVisible({ timeout: 15000 });
  await uploadSessionImportJson(page);
  await expectSessionRecordPreviewPublicSafe(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-session-record-preview-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectSessionRecordPreviewPublicSafe(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-session-record-preview-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});
```

- [ ] **Step 2: Run the E2E spec and verify it passes**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
```

Expected: PASS. The Playwright output should show one passing test and screenshot artifacts under the test output directory, not tracked files.

- [ ] **Step 3: Confirm screenshots are not tracked**

Run:

```bash
git status --short
```

Expected: the new E2E spec is shown as untracked or modified before staging, and no `.png`, `screenshot`, `test-results`, or `__screenshots__` files are listed as tracked changes.

- [ ] **Step 4: Commit the E2E evidence spec**

Run:

```bash
git add front/tests/e2e/host-session-record-preview.spec.ts
git commit -m "test(front): pin host session record preview evidence"
```

Expected: commit succeeds and contains only the E2E spec.

---

### Task 4: CHANGELOG Entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the host-visible change entry**

Under `## Unreleased`, insert this `### Changed` section above the existing `### Engineering` section:

```markdown
### Changed

- **host session record preview:** 호스트 세션 편집기의 `외부 JSON 가져오기` 미리보기를 저장 전 검토 화면으로 확장했습니다. 회차·책·날짜, 작성자 매칭, 교체될 기록 항목, 피드백 문서 parser 상태, 저장 차단 사유를 한 화면에서 확인할 수 있고, desktop/mobile public-safe Playwright 증거를 추가했습니다. 서버/API contract, DB migration, auth/BFF token 변경은 없습니다.
```

- [ ] **Step 2: Run docs diff check**

Run:

```bash
git diff --check -- CHANGELOG.md
```

Expected: no output and exit code 0.

- [ ] **Step 3: Commit the CHANGELOG update**

Run:

```bash
git add CHANGELOG.md
git commit -m "docs: record host session record preview"
```

Expected: commit succeeds.

---

### Task 5: Full Local Release Gate

**Files:**
- Verify only: frontend, tests, public release candidate

- [ ] **Step 1: Run frontend lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS with exit code 0.

- [ ] **Step 2: Run frontend unit tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS with exit code 0. The output should include the new `session-import-panel.test.tsx`.

- [ ] **Step 3: Run frontend build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS with exit code 0 and Vite build output.

- [ ] **Step 4: Run targeted host editor E2E**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
```

Expected: PASS with one passing Playwright test.

- [ ] **Step 5: Build the public release candidate**

Run:

```bash
./scripts/build-public-release-candidate.sh
```

Expected: PASS. The candidate should be written to `.tmp/public-release-candidate`.

- [ ] **Step 6: Scan the public release candidate**

Run:

```bash
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: PASS, including gitleaks reporting no leaks.

- [ ] **Step 7: Confirm no generated screenshot artifacts are tracked**

Run:

```bash
git status --short
```

Expected: clean working tree. If ignored Playwright output exists locally, it must not appear as a tracked change.
