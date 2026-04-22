# ReadMates Mobile Archive And My Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/app/archive` and `/app/me` render mobile layouts that match `design/standalone/mobile.html` while keeping the existing desktop layouts intact.

**Architecture:** Keep the current desktop-oriented components available behind `.desktop-only`, and add explicit mobile renderers behind `.mobile-only` in the same feature area. The mobile renderers will reuse the existing mobile design primitives from `front/shared/styles/mobile.css` (`m-body`, `m-sec`, `m-hscroll`, `m-chip`, `m-card`, `m-card-quiet`, `m-list`, `m-list-row`, `m-cover`, `m-avatar`) and will render real API data instead of standalone sample records.

**Tech Stack:** React, Next.js App Router, TypeScript, Testing Library, Vitest, Playwright for browser verification.

---

## Scope Check

This is one bounded UI alignment task. It touches only the authenticated member archive and my-page surfaces plus their tests. It does not change backend API contracts except for the existing `/app/me` route fetching already-available archive question/review endpoints so the mobile profile card can show real `서평` and `질문` counts instead of fake sample numbers.

## File Structure

- Modify `front/features/archive/components/archive-page.tsx`: keep current desktop archive rendering, add a mobile archive renderer that matches `MArchivePage` structure from `design/standalone/mobile.html`.
- Modify `front/features/archive/components/my-page.tsx`: keep current desktop my-page rendering, add a mobile my-page renderer that matches `MMePage` structure from `design/standalone/mobile.html`.
- Modify `front/app/(app)/app/me/page.tsx`: fetch my archive question/review lists and pass their counts to `MyPage`.
- Modify `front/tests/unit/archive-page.test.tsx`: assert the mobile archive shell, Korean tab labels, mobile cards, empty states, and report actions.
- Modify `front/tests/unit/my-page.test.tsx`: assert the mobile my-page shell, compact profile/stat card, club/settings lists, logout action, and real count display.
- Use `front/shared/styles/mobile.css` as-is unless browser verification shows a missing reusable primitive. If a style change is required, add only component-scoped classes under `front/app/globals.css` with an `rm-archive-*` or `rm-my-*` prefix.
- Do not edit `design/standalone/mobile.html`; it is the visual reference for this task.

---

### Task 1: Add Failing Unit Tests For Mobile Archive

**Files:**
- Modify: `front/tests/unit/archive-page.test.tsx`
- Test: `front/tests/unit/archive-page.test.tsx`

- [x] **Step 1: Import `within` for scoped mobile assertions**

Change the first import in `front/tests/unit/archive-page.test.tsx` to:

```ts
import { cleanup, render, screen, within } from "@testing-library/react";
```

- [x] **Step 2: Add a mobile shell regression test**

Add this test inside the existing `describe("ArchivePage", () => {` block after the existing "shows the record storage title" test:

```tsx
  it("renders the standalone-aligned mobile archive shell", () => {
    const { container } = render(
      <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />,
    );

    const mobile = container.querySelector(".rm-archive-mobile");
    expect(mobile).not.toBeNull();
    const scoped = within(mobile as HTMLElement);

    expect(scoped.getByText("Archive")).toBeInTheDocument();
    expect(scoped.getByRole("heading", { name: "읽어 온 자리" })).toBeInTheDocument();
    expect(scoped.getByText("6회 · 6권 · 1개의 질문 · 1개의 서평")).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "세션" })).toHaveClass("m-chip", "is-on");
    expect(scoped.getByRole("button", { name: "내 서평" })).toHaveClass("m-chip");
    expect(scoped.getByRole("button", { name: "내 질문" })).toHaveClass("m-chip");
    expect(scoped.getByRole("button", { name: "피드백 리포트" })).toHaveClass("m-chip");
    expect(scoped.queryByText("By session")).not.toBeInTheDocument();
    expect(scoped.queryByText("Reviews")).not.toBeInTheDocument();
    expect(scoped.queryByText("My questions")).not.toBeInTheDocument();
    expect(mobile?.querySelectorAll(".rm-archive-session-card.m-card")).toHaveLength(6);
    expect(scoped.getByText("No.06 · 2026.04.15")).toBeInTheDocument();
    expect(scoped.getByText("가난한 찰리의 연감")).toBeInTheDocument();
  });
```

- [x] **Step 3: Add a mobile tab switching test**

Add this test after the previous mobile shell test:

```tsx
  it("switches mobile archive tabs using Korean chip labels", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />,
    );

    const mobile = container.querySelector(".rm-archive-mobile") as HTMLElement;
    const scoped = within(mobile);

    await user.click(scoped.getByRole("button", { name: "내 서평" }));
    expect(scoped.getByRole("button", { name: "내 서평" })).toHaveClass("is-on");
    expect(scoped.getByText("2026.04.15 · 가난한 찰리의 연감")).toBeInTheDocument();
    expect(scoped.getByText("내가 모르는 영역을 인정하는 태도가 가장 현실적인 지혜처럼 느껴졌다.")).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "내 질문" }));
    expect(scoped.getByRole("button", { name: "내 질문" })).toHaveClass("is-on");
    expect(scoped.getByText("Q1 · 2025.11.26")).toBeInTheDocument();
    expect(scoped.getByText("데이터 기반 사고가 일상 판단과 멀어지는 순간을 묻는다.")).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "피드백 리포트" }));
    expect(scoped.getByRole("button", { name: "피드백 리포트" })).toHaveClass("is-on");
    expect(scoped.getByText("No.06 · 가난한 찰리의 연감")).toBeInTheDocument();
    expect(scoped.getByText("feedback-6-suhan.html")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: "feedback-6-suhan.html 열기" })).toHaveAttribute(
      "href",
      "/api/bff/api/reports/report-6-suhan/content",
    );
    expect(scoped.getByRole("link", { name: "feedback-6-suhan.html 다운로드" })).toHaveAttribute(
      "href",
      "/api/bff/api/reports/report-6-suhan/content?download=1",
    );
  });
```

- [x] **Step 4: Add a mobile empty-state test**

Add this test after the existing empty-state test:

```tsx
  it("renders mobile empty states with mobile card/list primitives", async () => {
    const user = userEvent.setup();
    const { container } = render(<ArchivePage sessions={[]} questions={[]} reviews={[]} reports={[]} />);

    const mobile = container.querySelector(".rm-archive-mobile") as HTMLElement;
    const scoped = within(mobile);

    expect(scoped.getByText("0회 · 0권 · 0개의 질문 · 0개의 서평")).toBeInTheDocument();
    expect(scoped.getByText("아직 저장된 모임 기록이 없습니다.")).toHaveClass("small");
    expect(mobile.querySelector(".m-card-quiet")).not.toBeNull();

    await user.click(scoped.getByRole("button", { name: "내 서평" }));
    expect(scoped.getByText("아직 작성된 서평이 없습니다.")).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "내 질문" }));
    expect(scoped.getByText("아직 저장된 질문이 없습니다.")).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "피드백 리포트" }));
    expect(scoped.getByText("아직 열람 가능한 피드백 리포트가 없습니다.")).toBeInTheDocument();
  });
```

- [x] **Step 5: Run the archive test and verify failure**

Run:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm exec vitest run tests/unit/archive-page.test.tsx
```

Expected: FAIL because `.rm-archive-mobile`, Korean mobile chip labels, and mobile card classes do not exist yet.

---

### Task 2: Implement Mobile Archive Renderer

**Files:**
- Modify: `front/features/archive/components/archive-page.tsx`
- Test: `front/tests/unit/archive-page.test.tsx`

- [x] **Step 1: Add Korean mobile tab labels and summary helpers**

In `front/features/archive/components/archive-page.tsx`, add these constants and helpers near the existing `archiveTabs` definition:

```tsx
const mobileArchiveTabs: Array<{ key: ArchiveView; label: string }> = [
  { key: "sessions", label: "세션" },
  { key: "reviews", label: "내 서평" },
  { key: "questions", label: "내 질문" },
  { key: "report", label: "피드백 리포트" },
];

function compactDate(date: string) {
  return date.replaceAll("-", ".");
}

function archiveSummary({
  sessions,
  questions,
  reviews,
}: {
  sessions: SessionRecord[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
}) {
  const bookCount = new Set(sessions.map((session) => session.book)).size;
  return `${sessions.length}회 · ${bookCount}권 · ${questions.length}개의 질문 · ${reviews.length}개의 서평`;
}
```

- [x] **Step 2: Split the top-level component into desktop and mobile wrappers**

Replace the `return` statement in `ArchivePage` with this structure:

```tsx
  return (
    <main className="rm-archive-page">
      <div className="desktop-only">
        <ArchiveDesktop
          view={view}
          setView={setView}
          sessions={archiveSessions}
          questions={questions}
          reviews={reviews}
          reports={reports}
        />
      </div>
      <div className="mobile-only">
        <ArchiveMobile
          view={view}
          setView={setView}
          sessions={archiveSessions}
          questions={questions}
          reviews={reviews}
          reports={reports}
        />
      </div>
    </main>
  );
```

Move the current `ArchivePage` header/body JSX into a new `ArchiveDesktop` function. Use this signature and return the current desktop fragment from `front/features/archive/components/archive-page.tsx` lines 59-105, replacing `archiveSessions` with the `sessions` prop inside the moved JSX:

```tsx
function ArchiveDesktop({
  view,
  setView,
  sessions,
  questions,
  reviews,
  reports,
}: {
  view: ArchiveView;
  setView: (view: ArchiveView) => void;
  sessions: SessionRecord[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: ReportListItem[];
}) {
  return (
    <>
      <section className="page-header-compact">
        <div className="container">
          <div className="row-between" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>
                Archive
              </p>
              <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
                기록 저장소
              </h1>
              <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                지난 모임과 내가 쓴 문장들을 회고합니다. 속도감보다 축적감.
              </p>
            </div>
            <div className="row" style={{ gap: "6px", flexWrap: "wrap" }} aria-label="Archive tabs">
              {archiveTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={view === tab.key}
                  onClick={() => setView(tab.key)}
                  style={{
                    height: "32px",
                    padding: "0 14px",
                    fontSize: "13px",
                    borderRadius: "999px",
                    background: view === tab.key ? "var(--accent-soft)" : "transparent",
                    color: view === tab.key ? "var(--accent)" : "var(--text-2)",
                    border: `1px solid ${view === tab.key ? "var(--accent-line)" : "var(--line)"}`,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "40px 0 80px" }}>
        <div className="container">
          {view === "sessions" ? <ArchiveSessions sessions={sessions} /> : null}
          {view === "reviews" ? <ArchiveReviews reviews={reviews} /> : null}
          {view === "questions" ? <ArchiveQuestions questions={questions} /> : null}
          {view === "report" ? <ArchiveReports reports={reports} sessions={sessions} /> : null}
        </div>
      </section>
    </>
  );
}
```

When moving the existing JSX, keep `archiveTabs` for desktop so existing desktop tests still pass.

- [x] **Step 3: Add the mobile archive shell**

Add this function below `ArchiveDesktop`:

```tsx
function ArchiveMobile({
  view,
  setView,
  sessions,
  questions,
  reviews,
  reports,
}: {
  view: ArchiveView;
  setView: (view: ArchiveView) => void;
  sessions: SessionRecord[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: ReportListItem[];
}) {
  return (
    <div className="rm-archive-mobile m-body">
      <section style={{ padding: "12px 18px 16px" }}>
        <div className="eyebrow">Archive</div>
        <h1 className="h2 editorial" style={{ margin: "6px 0 6px" }}>
          읽어 온 자리
        </h1>
        <div className="small" style={{ color: "var(--text-2)" }}>
          {archiveSummary({ sessions, questions, reviews })}
        </div>
      </section>

      <div className="m-hscroll" style={{ padding: "0 18px 6px" }} aria-label="Archive mobile tabs">
        {mobileArchiveTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            className={`m-chip${view === tab.key ? " is-on" : ""}`}
            style={{ height: 32, padding: "0 14px" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "sessions" ? <ArchiveMobileSessions sessions={sessions} /> : null}
      {view === "reviews" ? <ArchiveMobileReviews reviews={reviews} /> : null}
      {view === "questions" ? <ArchiveMobileQuestions questions={questions} /> : null}
      {view === "report" ? <ArchiveMobileReports reports={reports} sessions={sessions} /> : null}
    </div>
  );
}
```

- [x] **Step 4: Add mobile session cards**

Add this function below `ArchiveMobile`:

```tsx
function ArchiveMobileSessions({ sessions }: { sessions: SessionRecord[] }) {
  if (sessions.length === 0) {
    return <MobileEmptyState message="아직 저장된 모임 기록이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {sessions.map((session) => {
          const body = (
            <>
              <div className="m-cover" style={{ width: 52 }} />
              <div style={{ minWidth: 0 }}>
                <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                  No.{String(session.number).padStart(2, "0")} · {session.date}
                </div>
                <div className="editorial" style={{ fontSize: 16, margin: "4px 0 2px", lineHeight: 1.3 }}>
                  {session.book}
                </div>
                <div className="tiny" style={{ color: "var(--text-3)" }}>
                  {session.author}
                </div>
                <div className="m-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <span className="badge">
                    참석 {session.attendance}/{session.total}
                  </span>
                  {session.published ? <span className="badge badge-ok badge-dot">공개</span> : null}
                  <span className="badge">리포트</span>
                </div>
              </div>
            </>
          );

          if (session.published) {
            return (
              <a
                key={session.id}
                href={`/sessions/${session.id}`}
                className="rm-archive-session-card m-card"
                style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 14, width: "100%" }}
                aria-label={`No.${session.number} ${session.book} 열기`}
              >
                {body}
              </a>
            );
          }

          return (
            <article
              key={session.id}
              className="rm-archive-session-card m-card"
              style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 14, width: "100%" }}
              aria-label={`No.${session.number} ${session.book} 준비 중`}
            >
              {body}
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [x] **Step 5: Add mobile reviews, questions, reports, and empty state**

Add these functions below `ArchiveMobileSessions`:

```tsx
function ArchiveMobileReviews({ reviews }: { reviews: MyArchiveReviewItem[] }) {
  if (reviews.length === 0) {
    return <MobileEmptyState message="아직 작성된 서평이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        {reviews.map((review) => (
          <article key={`${review.sessionId}-${review.kind}`} className="m-card">
            <div className="tiny mono" style={{ color: "var(--text-3)" }}>
              {compactDate(review.date)} · {review.bookTitle}
            </div>
            <div className="body editorial" style={{ fontSize: 15, marginTop: 8, lineHeight: 1.6 }}>
              {review.text}
            </div>
            <div className="m-row-between" style={{ marginTop: 12 }}>
              <span className="tiny" style={{ color: "var(--text-3)" }}>
                {review.kind === "ONE_LINE_REVIEW" ? "한줄평" : "장문 서평"}
              </span>
              <span aria-hidden style={{ color: "var(--text-3)" }}>
                ›
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ArchiveMobileQuestions({ questions }: { questions: MyArchiveQuestionItem[] }) {
  if (questions.length === 0) {
    return <MobileEmptyState message="아직 저장된 질문이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {questions.map((question) => (
          <article key={`${question.sessionId}-${question.priority}-${question.text}`} className="m-card-quiet">
            <div className="tiny mono" style={{ color: "var(--accent)" }}>
              Q{question.priority} · {compactDate(question.date)}
            </div>
            <div className="body editorial" style={{ fontSize: 15, marginTop: 6, lineHeight: 1.55 }}>
              {question.text}
            </div>
            {question.draftThought ? (
              <div className="tiny" style={{ color: "var(--text-3)", marginTop: 8 }}>
                {question.draftThought}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ArchiveMobileReports({ reports, sessions }: { reports: ReportListItem[]; sessions: SessionRecord[] }) {
  if (reports.length === 0) {
    return <MobileEmptyState message="아직 열람 가능한 피드백 리포트가 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="m-list">
        {reports.map((report) => {
          const session = sessions.find((item) => item.number === report.sessionNumber);
          const label = `No.${String(report.sessionNumber).padStart(2, "0")} · ${session?.book ?? "피드백 리포트"}`;

          return (
            <div key={report.reportId} className="m-list-row" style={{ gridTemplateColumns: "40px minmax(0, 1fr) auto" }}>
              <span aria-hidden style={{ color: "var(--accent)", fontSize: 20 }}>
                ▤
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="body" style={{ fontSize: 14 }}>
                  {label}
                </div>
                <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                  {report.fileName}
                </div>
              </div>
              <div className="m-row" style={{ gap: 4 }}>
                <a className="btn btn-quiet btn-sm" href={`/api/bff/api/reports/${report.reportId}/content`} aria-label={`${report.fileName} 열기`}>
                  ↗
                </a>
                <a
                  className="btn btn-quiet btn-sm"
                  href={`/api/bff/api/reports/${report.reportId}/content?download=1`}
                  aria-label={`${report.fileName} 다운로드`}
                  download={report.fileName}
                >
                  ↓
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MobileEmptyState({ message }: { message: string }) {
  return (
    <section className="m-sec">
      <div className="m-card-quiet">
        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
          {message}
        </p>
      </div>
    </section>
  );
}
```

- [x] **Step 6: Run the archive test and verify pass**

Run:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm exec vitest run tests/unit/archive-page.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
cd /Users/kws/source/persnal/ReadMates
git add front/features/archive/components/archive-page.tsx front/tests/unit/archive-page.test.tsx
git commit -m "fix: align archive mobile view with standalone design"
```

---

### Task 3: Add Failing Unit Tests For Mobile My Page

**Files:**
- Modify: `front/tests/unit/my-page.test.tsx`
- Test: `front/tests/unit/my-page.test.tsx`

- [x] **Step 1: Import `within` for scoped mobile assertions**

Change the first import in `front/tests/unit/my-page.test.tsx` to:

```ts
import { cleanup, render, screen, within } from "@testing-library/react";
```

- [x] **Step 2: Add question and review counts to existing test renders**

Where the test renders `MyPage`, pass `reviewCount` and `questionCount` so the mobile card can use real counts:

```tsx
render(<MyPage data={data} reports={reports} reviewCount={3} questionCount={7} />);
```

For the no-report test, use:

```tsx
render(<MyPage data={data} reports={[]} reviewCount={3} questionCount={7} />);
```

- [x] **Step 3: Add a mobile my-page shell regression test**

Add this test inside the existing `describe("MyPage", () => {` block after the first test:

```tsx
  it("renders the standalone-aligned mobile my page shell", () => {
    const { container } = render(<MyPage data={data} reports={reports} reviewCount={3} questionCount={7} />);

    const mobile = container.querySelector(".rm-my-mobile");
    expect(mobile).not.toBeNull();
    const scoped = within(mobile as HTMLElement);

    expect(scoped.queryByText("내 서가 · 계정")).not.toBeInTheDocument();
    expect(scoped.getByText("김호스트")).toBeInTheDocument();
    expect(scoped.getByText("host@example.com")).toBeInTheDocument();
    expect(scoped.getByText("6")).toBeInTheDocument();
    expect(scoped.getByText("참석")).toBeInTheDocument();
    expect(scoped.getByText("3")).toBeInTheDocument();
    expect(scoped.getByText("서평")).toBeInTheDocument();
    expect(scoped.getByText("7")).toBeInTheDocument();
    expect(scoped.getByText("질문")).toBeInTheDocument();
    expect(scoped.getByText("클럽")).toBeInTheDocument();
    expect(scoped.getByText("읽는사이")).toBeInTheDocument();
    expect(scoped.getByText("설정")).toBeInTheDocument();
    expect(scoped.getByText("알림")).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(mobile?.querySelector(".m-card")).not.toBeNull();
    expect(mobile?.querySelectorAll(".m-list")).toHaveLength(2);
  });
```

- [x] **Step 4: Add route-level count fetch test coverage if needed**

No unit test currently imports `front/app/(app)/app/me/page.tsx` directly. Do not create a brittle server-component test. Count fetching is covered by TypeScript and browser verification in Task 6.

- [x] **Step 5: Run the my-page test and verify failure**

Run:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm exec vitest run tests/unit/my-page.test.tsx
```

Expected: FAIL because `reviewCount`, `questionCount`, and `.rm-my-mobile` do not exist yet.

---

### Task 4: Implement Mobile My Page Renderer And Real Counts

**Files:**
- Modify: `front/app/(app)/app/me/page.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Test: `front/tests/unit/my-page.test.tsx`

- [x] **Step 1: Fetch archive counts in the route**

Replace `front/app/(app)/app/me/page.tsx` with this structure:

```tsx
import MyPage from "@/features/archive/components/my-page";
import type { MyArchiveQuestionItem, MyArchiveReviewItem, MyPageResponse, ReportListItem } from "@/shared/api/readmates";
import { fetchBff } from "../bff";

export default async function MyRoutePage() {
  const [data, reports, questions, reviews] = await Promise.all([
    fetchBff<MyPageResponse>("/api/app/me"),
    fetchBff<ReportListItem[]>("/api/reports/me"),
    fetchBff<MyArchiveQuestionItem[]>("/api/archive/me/questions"),
    fetchBff<MyArchiveReviewItem[]>("/api/archive/me/reviews"),
  ]);

  return <MyPage data={data} reports={reports} questionCount={questions.length} reviewCount={reviews.length} />;
}
```

- [x] **Step 2: Extend `MyPage` props**

In `front/features/archive/components/my-page.tsx`, add a prop type:

```tsx
type MyPageProps = {
  data: MyPageResponse;
  reports: ReportListItem[];
  reviewCount: number;
  questionCount: number;
};
```

Then change the exported function signature to:

```tsx
export default function MyPage({ data, reports, reviewCount, questionCount }: MyPageProps) {
```

- [x] **Step 3: Split desktop and mobile wrappers**

Replace the top-level `return` in `MyPage` with:

```tsx
  return (
    <main className="rm-my-page">
      <div className="desktop-only">
        <MyDesktop data={data} reports={reports} />
      </div>
      <div className="mobile-only">
        <MyMobile data={data} reviewCount={reviewCount} questionCount={questionCount} />
      </div>
    </main>
  );
```

Move the current `MyPage` header/body JSX into `MyDesktop`. Use this signature and return the current desktop fragment from `front/features/archive/components/my-page.tsx` lines 20-48:

```tsx
function MyDesktop({ data, reports }: { data: MyPageResponse; reports: ReportListItem[] }) {
  return (
    <>
      <section className="page-header-compact">
        <div className="container">
          <p className="eyebrow" style={{ margin: 0 }}>
            My
          </p>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            내 서가 · 계정
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            피드백 리포트와 계정 설정을 한곳에서.
          </p>
        </div>
      </section>

      <section style={{ padding: "40px 0 80px" }}>
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 1fr)", gap: "56px" }}>
          <div className="stack" style={{ "--stack": "44px" } as CSSProperties}>
            <AccountSection data={data} />
            <RhythmSection sessionCount={data.sessionCount} />
            <FeedbackReports reports={reports} />
          </div>

          <div className="stack" style={{ "--stack": "36px" } as CSSProperties}>
            <NotificationsSection />
            <PreferencesSection />
            <DangerZone />
          </div>
        </div>
      </section>
    </>
  );
}
```

- [x] **Step 4: Add the mobile my-page shell**

Add this function below `MyDesktop`:

```tsx
function MyMobile({
  data,
  reviewCount,
  questionCount,
}: {
  data: MyPageResponse;
  reviewCount: number;
  questionCount: number;
}) {
  return (
    <div className="rm-my-mobile m-body">
      <section style={{ padding: "18px 18px 8px" }}>
        <div className="m-card">
          <div className="m-row" style={{ gap: 14 }}>
            <AvatarChip initial={data.shortName} label={data.displayName} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h3 editorial">{data.displayName}</div>
              <div className="small">{data.email}</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="프로필 수정">
              ↗
            </button>
          </div>
          <hr className="divider-soft" style={{ margin: "18px 0 14px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, textAlign: "center" }}>
            {[
              { label: "참석", value: String(data.sessionCount) },
              { label: "서평", value: String(reviewCount) },
              { label: "질문", value: String(questionCount) },
            ].map((item) => (
              <div key={item.label}>
                <div className="editorial" style={{ fontSize: 22, letterSpacing: "-0.02em" }}>
                  {item.value}
                </div>
                <div className="tiny mono" style={{ color: "var(--text-3)", marginTop: 2 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          클럽
        </div>
        <div className="m-list">
          <div className="m-list-row">
            <span aria-hidden style={{ color: "var(--text-2)", fontSize: 18 }}>
              □
            </span>
            <div>
              <div className="body" style={{ fontSize: 14, fontWeight: 500 }}>
                읽는사이
              </div>
              <div className="tiny">멤버 · {data.joinedAt.replaceAll("-", ".").slice(0, 7)} 합류</div>
            </div>
            <span aria-hidden style={{ color: "var(--text-3)" }}>
              ›
            </span>
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          설정
        </div>
        <div className="m-list">
          {[
            { icon: "♢", label: "알림", value: "기본" },
            { icon: "□", label: "캘린더 연동", value: "연결 안 됨" },
            { icon: "◇", label: "테마 · 표시", value: "라이트" },
          ].map((item) => (
            <div key={item.label} className="m-list-row">
              <span aria-hidden style={{ color: "var(--text-2)", fontSize: 18 }}>
                {item.icon}
              </span>
              <span className="body" style={{ fontSize: 14 }}>
                {item.label}
              </span>
              <div className="m-row" style={{ gap: 6 }}>
                <span className="tiny" style={{ color: "var(--text-3)" }}>
                  {item.value}
                </span>
                <span aria-hidden style={{ color: "var(--text-3)" }}>
                  ›
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="m-sec">
        <button type="button" className="btn btn-ghost" style={{ width: "100%", height: 46, borderRadius: 10, color: "var(--text-3)" }}>
          로그아웃
        </button>
      </section>
    </div>
  );
}
```

- [x] **Step 5: Run the my-page test and verify pass**

Run:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm exec vitest run tests/unit/my-page.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
cd /Users/kws/source/persnal/ReadMates
git add 'front/app/(app)/app/me/page.tsx' front/features/archive/components/my-page.tsx front/tests/unit/my-page.test.tsx
git commit -m "fix: align my page mobile view with standalone design"
```

---

### Task 5: Run Focused Test Suite And Lint

**Files:**
- Test: `front/tests/unit/archive-page.test.tsx`
- Test: `front/tests/unit/my-page.test.tsx`
- Verify: `front`

- [x] **Step 1: Run focused unit tests**

Run:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm exec vitest run tests/unit/archive-page.test.tsx tests/unit/my-page.test.tsx
```

Expected: PASS for both files.

- [x] **Step 2: Run the full unit test suite**

Run:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm test
```

Expected: all Vitest tests pass.

- [x] **Step 3: Run lint**

Run:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm lint
```

Expected: ESLint completes without errors.

- [x] **Step 4: Commit only if Task 5 required fixes**

If tests or lint required edits, commit the scoped fixes:

```bash
cd /Users/kws/source/persnal/ReadMates
git add front
git commit -m "fix: stabilize mobile archive my tests"
```

If no files changed during Task 5, do not create an empty commit.

---

### Task 6: Browser Verification Against `mobile.html`

**Files:**
- Verify: `design/standalone/mobile.html`
- Verify: `http://localhost:3000/app/archive`
- Verify: `http://localhost:3000/app/me`

- [x] **Step 1: Confirm local services are reachable**

Run:

```bash
curl --max-time 3 -sS http://127.0.0.1:8080/internal/health
curl --max-time 3 -I http://localhost:3000/login
```

Expected:

```text
{"service":"readmates-server","status":"UP"}
HTTP/1.1 200 OK
```

- [x] **Step 2: Capture mobile comparison screenshots**

Use Playwright at `390x844` after dev-login as `이멤버5`.

Required captures:

- `actual-archive-sessions.png`
- `actual-archive-reviews.png`
- `actual-archive-questions.png`
- `actual-archive-report.png`
- `actual-me.png`
- `design-archive-sessions.png`
- `design-archive-reviews.png`
- `design-archive-questions.png`
- `design-archive-report.png`
- `design-me.png`

Save them under:

```text
/Users/kws/source/persnal/ReadMates/output/playwright/mobile-archive-me-audit
```

Expected visual result:

- `/app/archive` mobile header body says `읽어 온 자리`, not `기록 저장소`.
- `/app/archive` mobile tabs say `세션`, `내 서평`, `내 질문`, `피드백 리포트`.
- `/app/archive` session cards are `m-card` rows with a book-cover block and do not show vertical one-character book titles.
- `/app/archive` question cards are compact `m-card-quiet` cards.
- `/app/archive` report tab uses a rounded `m-list` when reports exist and a compact `m-card-quiet` empty state when no report exists.
- `/app/me` shows the mobile profile/stat card, club list, settings list, and logout button.
- `/app/me` does not show the desktop two-column layout squeezed into mobile width.

- [x] **Step 3: Check layout metrics**

Use browser evaluation to assert these values:

```js
({
  width: window.innerWidth,
  documentScrollWidth: document.documentElement.scrollWidth,
  bodyScrollWidth: document.body.scrollWidth,
  mobileArchiveCards: document.querySelectorAll(".rm-archive-mobile .m-card, .rm-archive-mobile .m-card-quiet, .rm-archive-mobile .m-list").length,
  mobileMyCards: document.querySelectorAll(".rm-my-mobile .m-card, .rm-my-mobile .m-list").length,
});
```

Expected on each route:

```text
documentScrollWidth <= width
bodyScrollWidth <= width
mobileArchiveCards > 0 on /app/archive
mobileMyCards >= 3 on /app/me
```

- [x] **Step 4: Fix any browser-only mobile collision**

If a browser-only issue appears, prefer component-scoped class fixes in `front/app/globals.css`:

```css
@media (max-width: 768px) {
  .rm-archive-mobile .m-card,
  .rm-archive-mobile .m-card-quiet,
  .rm-my-mobile .m-card,
  .rm-my-mobile .m-list {
    min-width: 0;
  }
}
```

Run Task 5 again after any CSS fix.

- [x] **Step 5: Commit browser-only fixes if any**

```bash
cd /Users/kws/source/persnal/ReadMates
git add front/app/globals.css
git commit -m "fix: polish mobile archive my layout"
```

If no browser-only fixes are needed, do not create an empty commit.

---

### Task 7: Final Verification Summary

**Files:**
- Verify: git diff
- Verify: test output
- Verify: screenshot artifacts

- [x] **Step 1: Inspect final diff**

Run:

```bash
cd /Users/kws/source/persnal/ReadMates
git diff --stat HEAD
git status --short
```

Expected: only intended `front` source/test files are modified if commits were not created; otherwise working tree is clean except ignored screenshot artifacts.

- [x] **Step 2: Record verification commands**

Capture the final status of:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm exec vitest run tests/unit/archive-page.test.tsx tests/unit/my-page.test.tsx
pnpm test
pnpm lint
```

Expected: all pass.

- [x] **Step 3: User-facing handoff**

Report:

- which mobile routes were fixed,
- which screenshots were regenerated,
- which commands passed,
- any residual difference from `mobile.html` caused by real API data being smaller than standalone sample data.

Do not claim the implementation is complete until Task 5 tests and Task 6 browser verification have both passed.

---

## Self-Review

- Spec coverage: The plan covers all reported mismatches: archive tab labels, archive sessions, archive reviews, archive questions, archive reports, and my-page mobile structure.
- Red-flag scan: No incomplete sections or unspecified commands remain.
- Type consistency: `reviewCount` and `questionCount` are introduced in the route, passed to `MyPage`, and used only by `MyMobile`.
- Scope control: Backend API changes are not required. Desktop rendering is preserved by wrapping existing implementations in `.desktop-only`.
