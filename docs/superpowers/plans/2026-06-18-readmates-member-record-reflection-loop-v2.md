# ReadMates Member Record Reflection Loop v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the member home's recent preserved-record entry read as a coherent "지난 모임 회고" loop that links to records and feedback without weakening existing permission boundaries.

**Architecture:** This is a frontend-first slice. `member-home/model` computes a pure reflection entry, `member-home/ui` renders desktop/mobile cards from props, and archive/feedback routes continue to own access and unavailable states. No server production code, DB migration, BFF/auth, or public API contract changes are planned.

**Tech Stack:** React 19, Vite, React Router 7, TanStack Query 5, Vitest, Testing Library, Playwright, TypeScript.

## Global Constraints

- Keep route-first dependency direction: `src/app -> src/pages -> features -> shared`.
- Do not import archive or feedback UI from `front/features/member-home`.
- Keep member home UI components props/callback driven; no fetch, QueryClient, or route param ownership in UI.
- Do not add server endpoints, DB migrations, BFF/auth changes, or public API contract changes.
- Do not expose private member email, raw JSON, admin-only route, provider error, internal code, token-shaped value, local absolute paths, private domains, OCIDs, or deployment state.
- Preserve Korean-first copy and the ReadMates design tone: calm reading desk, not generic SaaS.
- Update `CHANGELOG.md` because the member-visible UX changes.
- Run frontend checks before completion: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, and targeted Playwright for `front/tests/e2e/host-session-record-preview.spec.ts`.

---

## File Structure

- Modify `front/features/member-home/model/member-home-view-model.ts`
  - Owns `MemberHomeFeedbackState`, `MemberHomeRecentRecordEntry`, and `getMemberHomeRecentRecordEntry()`.
- Modify `front/features/member-home/model/member-home-view-model.test.ts`
  - Pins grouping, label dedupe, href generation, and conservative feedback state.
- Create `front/features/member-home/ui/member-home-records.test.tsx`
  - Tests desktop and mobile rendering of the reflection card.
- Modify `front/features/member-home/ui/member-home-records.tsx`
  - Renders `지난 모임 회고` cards and feedback action/status copy.
- Modify `front/features/archive/ui/member-session-detail-page.tsx`
  - Teaches back-link label helpers about member-home reflection return targets.
- Modify `front/features/feedback/ui/feedback-document-page.tsx`
  - Teaches back-link label helpers about member-home reflection return targets.
- Modify `front/tests/e2e/host-session-record-preview.spec.ts`
  - Updates the existing host import to member home assertion from `최근 발행 기록` to `지난 모임 회고`.
- Modify `CHANGELOG.md`
  - Records the member-visible UX improvement under `## Unreleased`.

---

### Task 1: Member Home Reflection Entry Model

**Files:**
- Modify: `front/features/member-home/model/member-home-view-model.ts`
- Modify: `front/features/member-home/model/member-home-view-model.test.ts`

**Interfaces:**
- Consumes: `MemberHomeNoteFeedItemView[]`
- Produces:
  - `export type MemberHomeFeedbackState = "AVAILABLE" | "LOCKED" | "MISSING" | "UNKNOWN";`
  - `MemberHomeRecentRecordEntry.feedbackState: MemberHomeFeedbackState`
  - `MemberHomeRecentRecordEntry.feedbackStatusLabel: string`
  - `MemberHomeRecentRecordEntry.returnStateLabel: string`
  - `getMemberHomeRecentRecordEntry(noteFeedItems: MemberHomeNoteFeedItemView[]): MemberHomeRecentRecordEntry | null`

- [ ] **Step 1: Write failing model tests**

Add tests to the bottom of `front/features/member-home/model/member-home-view-model.test.ts`.

```ts
  it("groups the latest preserved record entry by first session and dedupes labels in display order", () => {
    const items: MemberHomeNoteFeedItemView[] = [
      {
        sessionId: "session-8",
        sessionNumber: 8,
        bookTitle: "긴 제목의 다음 책",
        date: "2026-06-18",
        authorName: "이멤버5",
        authorShortName: "수",
        kind: "QUESTION",
        text: "첫 질문입니다.",
      },
      {
        sessionId: "session-8",
        sessionNumber: 8,
        bookTitle: "긴 제목의 다음 책",
        date: "2026-06-18",
        authorName: "이멤버5",
        authorShortName: "수",
        kind: "QUESTION",
        text: "두 번째 질문입니다.",
      },
      {
        sessionId: "session-8",
        sessionNumber: 8,
        bookTitle: "긴 제목의 다음 책",
        date: "2026-06-18",
        authorName: null,
        authorShortName: null,
        kind: "HIGHLIGHT",
        text: "함께 남긴 하이라이트입니다.",
      },
      {
        sessionId: "session-7",
        sessionNumber: 7,
        bookTitle: "이전 책",
        date: "2026-05-16",
        authorName: "이멤버4",
        authorShortName: "사",
        kind: "ONE_LINE_REVIEW",
        text: "이전 세션 한줄평입니다.",
      },
    ];

    expect(getMemberHomeRecentRecordEntry(items)).toEqual({
      sessionId: "session-8",
      sessionNumber: 8,
      bookTitle: "긴 제목의 다음 책",
      date: "2026-06-18",
      kindLabels: ["질문", "하이라이트"],
      href: "/app/sessions/session-8",
      feedbackHref: "/app/feedback/session-8",
      feedbackState: "UNKNOWN",
      feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
      returnStateLabel: "지난 모임 회고",
      summary: "긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.",
    });
  });

  it("keeps existing preserved record hrefs stable while adding conservative feedback state", () => {
    expect(getMemberHomeRecentRecordEntry(noteFeedItems)).toEqual({
      sessionId: "session-6",
      sessionNumber: 6,
      bookTitle: "지난 책",
      date: "2026-04-15",
      kindLabels: ["한줄평"],
      href: "/app/sessions/session-6",
      feedbackHref: "/app/feedback/session-6",
      feedbackState: "UNKNOWN",
      feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
      returnStateLabel: "지난 모임 회고",
      summary: "지난 책의 기록과 피드백을 이어 읽을 수 있어요.",
    });
  });
```

- [ ] **Step 2: Run focused model test to verify it fails**

Run:

```bash
pnpm --dir front test -- member-home-view-model
```

Expected: FAIL because `feedbackState`, `feedbackStatusLabel`, `returnStateLabel`, and the updated summary are not produced by `getMemberHomeRecentRecordEntry()`.

- [ ] **Step 3: Implement model contract**

Modify `front/features/member-home/model/member-home-view-model.ts`.

```ts
export type MemberHomeFeedbackState = "AVAILABLE" | "LOCKED" | "MISSING" | "UNKNOWN";

export type MemberHomeRecentRecordEntry = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  kindLabels: string[];
  href: string;
  feedbackHref: string;
  feedbackState: MemberHomeFeedbackState;
  feedbackStatusLabel: string;
  returnStateLabel: string;
  summary: string;
};
```

Replace the existing return object in `getMemberHomeRecentRecordEntry()` with:

```ts
  return {
    sessionId: first.sessionId,
    sessionNumber: first.sessionNumber,
    bookTitle: first.bookTitle,
    date: first.date,
    kindLabels,
    href: `/app/sessions/${encodeURIComponent(first.sessionId)}`,
    feedbackHref: `/app/feedback/${encodeURIComponent(first.sessionId)}`,
    feedbackState: "UNKNOWN",
    feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
    returnStateLabel: "지난 모임 회고",
    summary: `${first.bookTitle}의 기록과 피드백을 이어 읽을 수 있어요.`,
  };
```

- [ ] **Step 4: Run focused model test to verify it passes**

Run:

```bash
pnpm --dir front test -- member-home-view-model
```

Expected: PASS for `member-home-view-model.test.ts`.

- [ ] **Step 5: Commit Task 1**

```bash
git add front/features/member-home/model/member-home-view-model.ts front/features/member-home/model/member-home-view-model.test.ts
git commit -m "feat(front): model member record reflection entry"
```

---

### Task 2: Member Home Desktop and Mobile Reflection Cards

**Files:**
- Create: `front/features/member-home/ui/member-home-records.test.tsx`
- Modify: `front/features/member-home/ui/member-home-records.tsx`

**Interfaces:**
- Consumes: `MemberHomeRecentRecordEntry.feedbackState`, `feedbackStatusLabel`, and `returnStateLabel` from Task 1.
- Produces:
  - `RecentRecordEntry` desktop region labelled `지난 모임 회고`
  - `MobileRecentRecordEntry` mobile section labelled `지난 모임 회고`
  - Stable `기록 보기` and `피드백 보기` links for `UNKNOWN` and `AVAILABLE` feedback states

- [ ] **Step 1: Write failing UI tests**

Create `front/features/member-home/ui/member-home-records.test.tsx`.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MemberHomeRecentRecordEntry } from "@/features/member-home/model/member-home-view-model";
import { MobileRecentRecordEntry, RecentRecordEntry } from "@/features/member-home/ui/member-home-records";

const entry: MemberHomeRecentRecordEntry = {
  sessionId: "session-8",
  sessionNumber: 8,
  bookTitle: "긴 제목의 다음 책",
  date: "2026-06-18",
  kindLabels: ["질문", "하이라이트"],
  href: "/app/sessions/session-8",
  feedbackHref: "/app/feedback/session-8",
  feedbackState: "UNKNOWN",
  feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
  returnStateLabel: "지난 모임 회고",
  summary: "긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.",
};

describe("member home record reflection cards", () => {
  it("renders the desktop reflection card with record and feedback actions", () => {
    render(<RecentRecordEntry entry={entry} />);

    const region = screen.getByRole("region", { name: "지난 모임 회고" });
    expect(region).toBeInTheDocument();
    expect(screen.getByText("지난 모임 회고")).toBeInTheDocument();
    expect(screen.getByText("No.08 · 긴 제목의 다음 책")).toBeInTheDocument();
    expect(screen.getByText("긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.")).toBeInTheDocument();
    expect(screen.getByText("질문 · 하이라이트")).toBeInTheDocument();
    expect(screen.getByText("피드백 문서는 열람 화면에서 확인합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기록 보기" })).toHaveAttribute("href", "/app/sessions/session-8");
    expect(screen.getByRole("link", { name: "피드백 보기" })).toHaveAttribute("href", "/app/feedback/session-8");
  });

  it("renders locked feedback state without a feedback action", () => {
    render(
      <RecentRecordEntry
        entry={{
          ...entry,
          feedbackState: "LOCKED",
          feedbackStatusLabel: "참석 멤버에게만 피드백 문서가 열립니다.",
        }}
      />,
    );

    expect(screen.getByText("참석 멤버에게만 피드백 문서가 열립니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "피드백 보기" })).not.toBeInTheDocument();
  });

  it("renders the mobile reflection card with the same core labels", () => {
    render(<MobileRecentRecordEntry entry={entry} />);

    expect(screen.getByRole("region", { name: "지난 모임 회고" })).toBeInTheDocument();
    expect(screen.getByText("지난 모임 회고")).toBeInTheDocument();
    expect(screen.getByText("No.08 · 긴 제목의 다음 책")).toBeInTheDocument();
    expect(screen.getByText("질문 · 하이라이트")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기록 보기" })).toHaveAttribute("href", "/app/sessions/session-8");
    expect(screen.getByRole("link", { name: "피드백 보기" })).toHaveAttribute("href", "/app/feedback/session-8");
  });

  it("renders nothing when no reflection entry exists", () => {
    const { container: desktop } = render(<RecentRecordEntry entry={null} />);
    const { container: mobile } = render(<MobileRecentRecordEntry entry={null} />);

    expect(desktop).toBeEmptyDOMElement();
    expect(mobile).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run focused UI test to verify it fails**

Run:

```bash
pnpm --dir front test -- member-home-records
```

Expected: FAIL because the current cards are labelled `최근 발행 기록` and do not render `feedbackStatusLabel` or suppress locked feedback actions.

- [ ] **Step 3: Add a feedback action helper**

In `front/features/member-home/ui/member-home-records.tsx`, add this helper near `SectionHeader`.

```tsx
function FeedbackAction({
  entry,
  LinkComponent,
}: {
  entry: MemberHomeRecentRecordEntry;
  LinkComponent: MemberHomeLinkComponent;
}) {
  const canOpenFeedback = entry.feedbackState === "AVAILABLE" || entry.feedbackState === "UNKNOWN";

  if (!canOpenFeedback) {
    return (
      <span className="small" style={{ color: "var(--text-2)" }}>
        {entry.feedbackStatusLabel}
      </span>
    );
  }

  return (
    <>
      <Link to={entry.feedbackHref} className="btn btn-quiet btn-sm" LinkComponent={LinkComponent}>
        피드백 보기
      </Link>
      <span className="tiny" style={{ color: "var(--text-3)", flexBasis: "100%" }}>
        {entry.feedbackStatusLabel}
      </span>
    </>
  );
}
```

- [ ] **Step 4: Update desktop reflection card markup**

Replace the `RecentRecordEntry` return block with:

```tsx
  return (
    <section className="surface-quiet" aria-label="지난 모임 회고" style={{ padding: 20, overflowWrap: "anywhere" }}>
      <div className="row-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">지난 모임 회고</div>
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
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link to={entry.href} className="btn btn-primary btn-sm" LinkComponent={LinkComponent}>
            기록 보기
          </Link>
          <FeedbackAction entry={entry} LinkComponent={LinkComponent} />
        </div>
      </div>
    </section>
  );
```

- [ ] **Step 5: Update mobile reflection card markup**

Replace the `MobileRecentRecordEntry` return block with:

```tsx
  return (
    <section className="m-sec" aria-label="지난 모임 회고">
      <div className="m-card-quiet" style={{ overflowWrap: "anywhere" }}>
        <div className="eyebrow">지난 모임 회고</div>
        <div className="body editorial" style={{ fontSize: 15, marginTop: 6 }}>
          No.{String(entry.sessionNumber).padStart(2, "0")} · {entry.bookTitle}
        </div>
        <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
          {entry.summary}
        </p>
        <div className="tiny" style={{ color: "var(--text-3)", marginTop: 8 }}>
          {entry.kindLabels.join(" · ")}
        </div>
        <div className="m-row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Link to={entry.href} className="btn btn-primary btn-sm" LinkComponent={LinkComponent}>
            기록 보기
          </Link>
          <FeedbackAction entry={entry} LinkComponent={LinkComponent} />
        </div>
      </div>
    </section>
  );
```

- [ ] **Step 6: Run focused UI test to verify it passes**

Run:

```bash
pnpm --dir front test -- member-home-records
```

Expected: PASS for `member-home-records.test.tsx`.

- [ ] **Step 7: Run member home model and UI tests together**

Run:

```bash
pnpm --dir front test -- member-home
```

Expected: PASS for member-home related tests.

- [ ] **Step 8: Commit Task 2**

```bash
git add front/features/member-home/ui/member-home-records.tsx front/features/member-home/ui/member-home-records.test.tsx
git commit -m "feat(front): render member reflection record card"
```

---

### Task 3: Reflection Return Labels in Archive and Feedback

**Files:**
- Modify: `front/features/archive/ui/member-session-detail-page.tsx`
- Modify: `front/features/feedback/ui/feedback-document-page.tsx`

**Interfaces:**
- Consumes: existing `ReadmatesReturnTarget` with `label: "지난 모임 회고"`.
- Produces:
  - Archive session detail back link label `회고`
  - Feedback document back link label `회고`
  - No authorization changes

- [ ] **Step 1: Write tests for helper behavior by rendering existing pages**

Create `front/features/archive/ui/member-session-detail-page.test.tsx` with this minimal unavailable-state assertion. Use unavailable state because it does not require a full `MemberArchiveSessionDetailResponse`.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberSessionDetailUnavailablePage } from "@/features/archive/ui/member-session-detail-page";

describe("MemberSessionDetailUnavailablePage return context", () => {
  it("keeps unavailable copy generic for reflection return targets", () => {
    render(
      <MemberSessionDetailUnavailablePage
        returnTarget={{
          href: "/app",
          label: "지난 모임 회고",
        }}
      />,
    );

    expect(screen.getAllByText("세션 없음").length).toBeGreaterThan(0);
    expect(screen.getAllByText("지난 세션을 찾을 수 없습니다.").length).toBeGreaterThan(0);
  });
});
```

Create `front/features/feedback/ui/feedback-document-page.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeedbackDocumentUnavailablePage } from "@/features/feedback/ui/feedback-document-page";

describe("FeedbackDocumentUnavailablePage return context", () => {
  it("renders a reflection return link when member home supplied the return target", () => {
    render(
      <FeedbackDocumentUnavailablePage
        reason="missing"
        returnTarget={{
          href: "/app",
          label: "지난 모임 회고",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "지난 모임 회고 돌아가기" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "← 회고" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run route UI tests to see current behavior**

Run:

```bash
pnpm --dir front test -- member-session-detail-page feedback-document-page
```

Expected: Archive unavailable test may PASS without code changes because it only pins existing generic copy. Feedback test should FAIL because `feedbackBackLabel()` currently returns `이전 화면` for `/app`.

- [ ] **Step 3: Update archive helper for reflection label**

In `front/features/archive/ui/member-session-detail-page.tsx`, update `sessionDetailBackLabel()`:

```tsx
function sessionDetailBackLabel(returnTarget: ReadmatesReturnTarget) {
  if (returnTarget.label === "지난 모임 회고") {
    return "회고";
  }

  if (returnTarget.href === "/app/me") {
    return "내 공간";
  }

  if (returnTarget.href.startsWith("/app/archive")) {
    return "아카이브";
  }

  return "이전 화면";
}
```

- [ ] **Step 4: Update feedback helper for reflection label**

In `front/features/feedback/ui/feedback-document-page.tsx`, update `feedbackBackLabel()`:

```tsx
function feedbackBackLabel(returnTarget: ReadmatesReturnTarget) {
  if (returnTarget.label === "지난 모임 회고") {
    return "회고";
  }

  if (returnTarget.href === "/app/me") {
    return "내 공간";
  }

  if (returnTarget.href.startsWith("/app/sessions/")) {
    return "세션";
  }

  if (returnTarget.href.startsWith("/app/archive")) {
    return "아카이브";
  }

  return "이전 화면";
}
```

- [ ] **Step 5: Run route UI tests to verify pass**

Run:

```bash
pnpm --dir front test -- member-session-detail-page feedback-document-page
```

Expected: PASS for both new route UI tests.

- [ ] **Step 6: Commit Task 3**

```bash
git add front/features/archive/ui/member-session-detail-page.tsx front/features/archive/ui/member-session-detail-page.test.tsx front/features/feedback/ui/feedback-document-page.tsx front/features/feedback/ui/feedback-document-page.test.tsx
git commit -m "feat(front): preserve reflection return labels"
```

---

### Task 4: E2E Evidence, CHANGELOG, and Final Verification

**Files:**
- Modify: `front/tests/e2e/host-session-record-preview.spec.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 1 and Task 2 model/UI labels.
- Produces:
  - Playwright assertion that host import to member home lands on `지난 모임 회고`
  - CHANGELOG entry for member-visible UX change
  - Final verification evidence

- [ ] **Step 1: Update the existing E2E member-home assertion**

In `front/tests/e2e/host-session-record-preview.spec.ts`, replace the final member home block:

```ts
  const recentRecord = page.getByRole("region", { name: "최근 발행 기록" });
  await expect(recentRecord).toBeVisible();
  await expect(recentRecord.getByText("No.07 · E2E 책")).toBeVisible();
```

with:

```ts
  const recentRecord = page.getByRole("region", { name: "지난 모임 회고" });
  await expect(recentRecord).toBeVisible();
  await expect(recentRecord.getByText("No.07 · E2E 책")).toBeVisible();
  await expect(recentRecord.getByText("E2E 책의 기록과 피드백을 이어 읽을 수 있어요.")).toBeVisible();
  await expect(recentRecord.getByText("한줄평")).toBeVisible();
  await expect(recentRecord.getByText("피드백 문서는 열람 화면에서 확인합니다.")).toBeVisible();
```

Keep the existing link href and sentinel assertions.

- [ ] **Step 2: Run targeted E2E to verify it passes**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
```

Expected: PASS. Screenshots should be written only under Playwright output directories, not tracked in git.

- [ ] **Step 3: Add CHANGELOG entry**

In `CHANGELOG.md`, under `## Unreleased` and `### Changed`, add:

```md
- **member record reflection loop:** 멤버 홈의 최근 발행 기록을 `지난 모임 회고` 진입으로 정리하고, 기록 보기와 피드백 문서 상태를 같은 카드에서 이어 볼 수 있게 했습니다. 서버/API contract, DB migration, auth/BFF token 변경은 없습니다.
```

- [ ] **Step 4: Run focused frontend unit tests**

Run:

```bash
pnpm --dir front test -- member-home member-session-detail-page feedback-document-page
```

Expected: PASS for the model/UI/route tests touched by this plan.

- [ ] **Step 5: Run required frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all commands exit 0.

- [ ] **Step 6: Run docs/diff checks and artifact scan**

Run:

```bash
git diff --check
git status --short
git ls-files front/test-results front/playwright-report front/__screenshots__
```

Expected:

- `git diff --check` exits 0.
- `git status --short` shows only intended source, test, and changelog changes.
- `git ls-files front/test-results front/playwright-report front/__screenshots__` does not include new E2E output artifacts. Existing component screenshot baselines under `front/__screenshots__/shared/ui` may appear if already tracked before this branch; do not add E2E screenshots.

- [ ] **Step 7: Commit Task 4**

```bash
git add front/tests/e2e/host-session-record-preview.spec.ts CHANGELOG.md
git commit -m "test(front): prove member reflection record loop"
```

- [ ] **Step 8: Record final verification note if implementation continues to merge readiness**

If the next user request asks to close release risk or merge, update `docs/development/release-readiness-review.md` with:

```md
## 2026-06-18 Member record reflection loop closeout

- Scope reviewed: local `main..HEAD` for the member record reflection loop branch.
- Release classification: frontend member-home/archive/feedback UX and test evidence only. No server production code, DB migration, public API contract, auth/BFF token, CI/deploy script, or release-candidate scanner behavior changed.
- Product/readiness evidence: member home renders `지난 모임 회고`, preserves record and feedback entry points, and keeps feedback availability final authority in existing archive/feedback routes.
- Local verification before merge: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts`, and `git diff --check` passed.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this frontend-only merge.
- Residual risk: no known local release-readiness residual remains after frontend and targeted E2E evidence. Production deploy/tag smoke remains a release-operation step.
```

Then commit that note separately:

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: record member reflection loop readiness"
```

## Plan Self-Review

- Spec coverage: Task 1 covers model grouping and conservative feedback state. Task 2 covers desktop/mobile `지난 모임 회고` cards. Task 3 covers archive/feedback route continuity labels. Task 4 covers E2E, CHANGELOG, and verification.
- Placeholder scan: no unfinished-marker wording or unspecified edge handling steps remain.
- Type consistency: `MemberHomeFeedbackState`, `feedbackState`, `feedbackStatusLabel`, and `returnStateLabel` are introduced in Task 1 and consumed by Tasks 2 and 4 with the same names.
- Scope check: the plan stays frontend-first and does not require server, DB, BFF, auth, or public API changes.
