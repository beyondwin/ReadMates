import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArchivePage from "@/features/archive/ui/archive-page";
import type {
  ArchiveSessionItem,
  FeedbackDocumentListItem,
  MyArchiveQuestionItem,
  MyArchiveReviewItem,
} from "@/features/archive/api/archive-contracts";

const ARCHIVE_SCROLL_KEY = "readmates:archive-scroll";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  window.history.pushState({}, "", "/");
});

const seededSessions: ArchiveSessionItem[] = [
  {
    sessionId: "session-6",
    sessionNumber: 6,
    title: "6회차 모임 · 가난한 찰리의 연감",
    bookTitle: "가난한 찰리의 연감",
    bookAuthor: "찰리 멍거",
    bookImageUrl: "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
    date: "2026-04-15",
    attendance: 6,
    total: 6,
    published: true,
    state: "CLOSED",
  },
  {
    sessionId: "session-5",
    sessionNumber: 5,
    title: "5회차 모임 · 지대넓얕 무한",
    bookTitle: "지대넓얕 무한",
    bookAuthor: "채사장",
    bookImageUrl: "https://image.aladin.co.kr/product/35301/70/cover500/k692035972_1.jpg",
    date: "2026-03-18",
    attendance: 6,
    total: 6,
    published: true,
    state: "CLOSED",
  },
  {
    sessionId: "session-4",
    sessionNumber: 4,
    title: "4회차 모임 · 내 안에서 나를 만드는 것들",
    bookTitle: "내 안에서 나를 만드는 것들",
    bookAuthor: "러셀 로버츠",
    bookImageUrl: "https://image.aladin.co.kr/product/6882/97/cover500/8933870644_2.jpg",
    date: "2026-02-25",
    attendance: 6,
    total: 6,
    published: true,
    state: "CLOSED",
  },
  {
    sessionId: "session-3",
    sessionNumber: 3,
    title: "3회차 모임 · 우리가 겨울을 지나온 방식",
    bookTitle: "우리가 겨울을 지나온 방식",
    bookAuthor: "문미순",
    bookImageUrl: "https://image.aladin.co.kr/product/32901/55/cover500/k602936626_2.jpg",
    date: "2026-01-21",
    attendance: 6,
    total: 6,
    published: true,
    state: "CLOSED",
  },
  {
    sessionId: "session-2",
    sessionNumber: 2,
    title: "2회차 모임 · 냉정한 이타주의자",
    bookTitle: "냉정한 이타주의자",
    bookAuthor: "윌리엄 맥어스킬",
    bookImageUrl: "https://image.aladin.co.kr/product/10044/19/cover500/8960515833_3.jpg",
    date: "2025-12-17",
    attendance: 6,
    total: 6,
    published: true,
    state: "CLOSED",
  },
  {
    sessionId: "session-1",
    sessionNumber: 1,
    title: "1회차 모임 · 팩트풀니스",
    bookTitle: "팩트풀니스",
    bookAuthor: "한스 로슬링",
    bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
    date: "2025-11-26",
    attendance: 6,
    total: 6,
    published: true,
    state: "CLOSED",
  },
];

const seededQuestions: MyArchiveQuestionItem[] = [
  {
    sessionId: "session-1",
    sessionNumber: 1,
    bookTitle: "팩트풀니스",
    date: "2025-11-26",
    priority: 1,
    text: "10가지 본능 중에서 본인에게 가장 강하게 작용한다고 느낀 것은 무엇인가요?",
    draftThought: "데이터 기반 사고가 일상 판단과 멀어지는 순간을 묻는다.",
  },
];

const seededReviews: MyArchiveReviewItem[] = [
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    kind: "ONE_LINE_REVIEW",
    text: "내가 모르는 영역을 인정하는 태도가 가장 현실적인 지혜처럼 느껴졌다.",
  },
];

const seededReports: FeedbackDocumentListItem[] = [
  {
    sessionId: "session-1",
    sessionNumber: 1,
    title: "독서모임 1차 피드백",
    bookTitle: "팩트풀니스",
    date: "2025-11-26",
    fileName: "251126 1차.md",
    uploadedAt: "2026-04-20T09:00:00Z",
  },
];
const seededReportReadLabel = "No.01 팩트풀니스 피드백 문서 읽기";
const seededReportPdfLabel = "No.01 팩트풀니스 피드백 문서 PDF로 저장";

function getDesktop(container: HTMLElement) {
  const desktop = container.querySelector(".desktop-only");
  expect(desktop).not.toBeNull();
  return within(desktop as HTMLElement);
}

function setScrollY(scrollY: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
}

function expectNoArchiveScrollSnapshot() {
  expect(window.sessionStorage.getItem(ARCHIVE_SCROLL_KEY)).toBeNull();
}

function setScrollToMock() {
  const scrollTo = vi.fn();
  Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });
  return scrollTo;
}

function archiveViewFromSearchParam(value: string | null) {
  if (value === "reviews" || value === "questions" || value === "report") {
    return value;
  }

  return "sessions";
}

function ArchiveSearchParamHarness() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));

  return (
    <>
      <button type="button" onClick={() => setSearchParams({ view: "report" })}>
        search report
      </button>
      <ArchivePage
        sessions={seededSessions}
        questions={seededQuestions}
        reviews={seededReviews}
        reports={seededReports}
        initialView={initialView}
        onViewChange={(nextView) => setSearchParams({ view: nextView })}
        routePathname={location.pathname}
        routeSearch={location.search}
      />
    </>
  );
}

function LocationStateEcho() {
  const location = useLocation();
  const state = location.state as { readmatesReturnTo?: string; readmatesReturnLabel?: string } | null;

  return (
    <main>
      <div data-testid="return-to">{state?.readmatesReturnTo ?? ""}</div>
      <div data-testid="return-label">{state?.readmatesReturnLabel ?? ""}</div>
    </main>
  );
}

describe("ArchivePage", () => {
  it("shows the record storage title and session archive controls", () => {
    const { container } = render(
      <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />,
    );
    const desktop = getDesktop(container);
    const mobile = container.querySelector(".rm-archive-mobile");

    expect(mobile).not.toBeNull();

    expect(desktop.getByText("기록 저장소")).toBeInTheDocument();
    expect(desktop.getByText("지난 모임과 내가 쓴 문장들을 회고합니다. 속도감보다 축적감.")).toBeInTheDocument();
    expect(desktop.getByText("지난 회차의 책과 기록을 한곳에 모아둔 독서모임 기록입니다.")).toBeInTheDocument();
    expect(within(mobile as HTMLElement).getByText("지난 회차의 책과 기록을 한곳에 모아둔 독서모임 기록입니다.")).toBeInTheDocument();
    expect(screen.queryByText("지난 회차를 연도별로 정리한 독서모임 보존 기록입니다.")).not.toBeInTheDocument();
    expect(desktop.getByRole("button", { name: "세션" })).toBeInTheDocument();
    expect(desktop.getByRole("button", { name: "내 서평" })).toBeInTheDocument();
    expect(desktop.getByRole("button", { name: "내 질문" })).toBeInTheDocument();
    expect(desktop.getByRole("button", { name: "피드백 문서" })).toBeInTheDocument();
    expect(desktop.getByText("2026")).toBeInTheDocument();
    expect(desktop.getByText("가난한 찰리의 연감")).toBeInTheDocument();
    expect(desktop.getByText("팩트풀니스")).toBeInTheDocument();
    expect(desktop.getByLabelText("No.06 · 04.15")).toBeInTheDocument();
    expect(desktop.queryByText("지난 회차")).not.toBeInTheDocument();
    expect(desktop.queryByText("공개됨")).not.toBeInTheDocument();
    expect(desktop.queryByText("문서 있음")).not.toBeInTheDocument();
    expect(desktop.getAllByText("공개 기록")).toHaveLength(seededSessions.length);
    expect(desktop.getByText("피드백 있음")).toBeInTheDocument();
    expect(desktop.getAllByText("피드백 없음").length).toBe(seededSessions.length - 1);
  });

  it("shows locked feedback status from archive session metadata without readable reports", () => {
    const lockedSession: ArchiveSessionItem = {
      ...seededSessions[0],
      feedbackDocument: {
        available: true,
        readable: false,
        lockedReason: "NOT_ATTENDED",
        title: "독서모임 6차 피드백",
        uploadedAt: "2026-04-20T09:00:00Z",
      },
    };

    const { container } = render(
      <ArchivePage sessions={[lockedSession]} questions={[]} reviews={[]} reports={[]} />,
    );
    const desktop = getDesktop(container);
    const mobile = within(container.querySelector(".rm-archive-mobile") as HTMLElement);

    for (const scope of [desktop, mobile]) {
      expect(scope.getByText("피드백 잠김")).toBeInTheDocument();
      expect(scope.queryByText("피드백 없음")).not.toBeInTheDocument();
      expect(scope.getByLabelText("등록된 피드백 문서가 있지만 이 계정에는 열람 권한이 없습니다.")).toBeInTheDocument();
    }
  });

  it("keeps fallback dates visible in the desktop session month/day column", () => {
    const sessionWithMissingDate: ArchiveSessionItem = {
      sessionId: "session-missing-date",
      sessionNumber: 9,
      title: "9회차 모임 · 날짜 미정 책",
      bookTitle: "날짜 미정 책",
      bookAuthor: "미정 작가",
      bookImageUrl: null,
      date: "",
      attendance: 0,
      total: 6,
      published: true,
      state: "CLOSED",
    };
    const validRender = render(
      <ArchivePage sessions={[seededSessions[0]]} questions={[]} reviews={[]} reports={[]} />,
    );

    expect(getDesktop(validRender.container).getByText("04.15")).toBeInTheDocument();

    validRender.unmount();

    const fallbackRender = render(
      <ArchivePage
        sessions={[sessionWithMissingDate]}
        questions={[]}
        reviews={[]}
        reports={[]}
      />,
    );

    expect(getDesktop(fallbackRender.container).getAllByText("미정").length).toBeGreaterThan(0);
  });

  it("groups missing-date sessions without duplicating valid sessions under a blank year", () => {
    const sessionWithMissingDate: ArchiveSessionItem = {
      sessionId: "session-missing-date",
      sessionNumber: 9,
      title: "9회차 모임 · 날짜 미정 책",
      bookTitle: "날짜 미정 책",
      bookAuthor: "미정 작가",
      bookImageUrl: null,
      date: "",
      attendance: 0,
      total: 6,
      published: true,
      state: "CLOSED",
    };

    const { container } = render(
      <ArchivePage
        sessions={[seededSessions[0], sessionWithMissingDate]}
        questions={[]}
        reviews={[]}
        reports={[]}
      />,
    );
    const desktopElement = container.querySelector(".desktop-only") as HTMLElement;
    const desktop = within(desktopElement);
    const yearHeadings = Array.from(desktopElement.querySelectorAll("h2.display")).map((heading) => heading.textContent);

    expect(yearHeadings).toEqual(["2026", "미정"]);
    expect(yearHeadings).not.toContain("");
    expect(desktopElement.querySelectorAll("article")).toHaveLength(2);
    expect(desktop.getAllByText("가난한 찰리의 연감")).toHaveLength(1);
    expect(desktop.getAllByText("날짜 미정 책").length).toBeGreaterThan(0);
  });

  it("renders the standalone-aligned mobile archive shell", () => {
    const { container } = render(
      <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />,
    );

    const mobile = container.querySelector(".rm-archive-mobile");
    expect(mobile).not.toBeNull();
    const scoped = within(mobile as HTMLElement);

    expect(scoped.getByText("아카이브")).toBeInTheDocument();
    expect(scoped.getByRole("heading", { name: "읽어 온 자리" })).toBeInTheDocument();
    expect(scoped.getByText("6권 · 1개의 질문 · 1개의 서평")).toBeInTheDocument();
    const sessionChip = scoped.getByRole("button", { name: "세션" });
    expect(sessionChip).toHaveClass("m-chip", "is-on");
    expect(sessionChip).toHaveAttribute("aria-pressed", "true");
    expect(sessionChip).toHaveStyle({
      minHeight: "32px",
      height: "32px",
      padding: "0 14px",
      fontSize: "13px",
      borderColor: "var(--text)",
      background: "var(--text)",
      color: "var(--bg)",
    });
    expect(scoped.getByRole("button", { name: "내 서평" })).toHaveClass("m-chip");
    expect(scoped.getByRole("button", { name: "내 질문" })).toHaveClass("m-chip");
    const feedbackChip = scoped.getByRole("button", { name: "피드백 문서" });
    expect(feedbackChip).toHaveClass("m-chip");
    expect(feedbackChip).toHaveStyle({
      minHeight: "32px",
      height: "32px",
      padding: "0 14px",
      fontSize: "13px",
      borderColor: "var(--line)",
      background: "transparent",
      color: "var(--text-2)",
    });
    expect(scoped.queryByText("By session")).not.toBeInTheDocument();
    expect(scoped.queryByText("Reviews")).not.toBeInTheDocument();
    expect(scoped.queryByText("My questions")).not.toBeInTheDocument();
    expect(mobile?.querySelectorAll(".rm-archive-session-card.m-card")).toHaveLength(6);
    expect(scoped.getByText("No.06 · 2026.04.15")).toBeInTheDocument();
    const latestSessionCard = scoped.getByRole("link", { name: "No.6 가난한 찰리의 연감 열기" });
    expect(within(latestSessionCard).getAllByText(/^No\.06/)).toHaveLength(1);
    expect(scoped.queryByText("지난 회차")).not.toBeInTheDocument();
    expect(scoped.queryByText("공개됨")).not.toBeInTheDocument();
    expect(scoped.queryByText("문서 있음")).not.toBeInTheDocument();
    expect(scoped.getByText("가난한 찰리의 연감")).toBeInTheDocument();
    expect(scoped.getAllByText("공개")).toHaveLength(seededSessions.length);
    expect(scoped.getByText("피드백 있음")).toBeInTheDocument();
    expect(scoped.getAllByText("피드백 없음").length).toBe(seededSessions.length - 1);
    expect(latestSessionCard).toHaveAttribute(
      "href",
      "/app/sessions/session-6",
    );
    expect(scoped.getByRole("img", { name: "가난한 찰리의 연감 표지" })).toHaveAttribute(
      "src",
      "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
    );
  });

  it("switches mobile archive tabs using Korean chip labels", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />,
    );

    const mobile = container.querySelector(".rm-archive-mobile") as HTMLElement;
    expect(mobile).not.toBeNull();
    const scoped = within(mobile);

    await user.click(scoped.getByRole("button", { name: "내 서평" }));
    expect(scoped.getByRole("button", { name: "내 서평" })).toHaveClass("is-on");
    expect(scoped.getByRole("button", { name: "내 서평" })).toHaveAttribute("aria-pressed", "true");
    expect(scoped.getByText("2026.04.15 · 가난한 찰리의 연감")).toBeInTheDocument();
    expect(scoped.getByText("내가 모르는 영역을 인정하는 태도가 가장 현실적인 지혜처럼 느껴졌다.")).toBeInTheDocument();
    const mobileReviewLink = scoped.getByRole("link", { name: "No.6 가난한 찰리의 연감 세션으로" });
    expect(mobileReviewLink).toHaveAttribute("href", "/app/sessions/session-6#mobile-my-records");
    expect(mobileReviewLink).toHaveStyle({
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "center",
      columnGap: "12px",
    });
    expect(within(mobileReviewLink).getByText("›")).toHaveAttribute("aria-hidden", "true");
    expect(within(mobileReviewLink).queryByText("한줄평")).not.toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "내 질문" }));
    expect(scoped.getByRole("button", { name: "내 질문" })).toHaveClass("is-on");
    expect(scoped.getByRole("button", { name: "내 질문" })).toHaveAttribute("aria-pressed", "true");
    expect(scoped.getByText("Q1 · 2025.11.26")).toHaveStyle({ color: "var(--text-3)" });
    expect(scoped.getByText("데이터 기반 사고가 일상 판단과 멀어지는 순간을 묻는다.")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: "Q1 팩트풀니스 세션으로" })).toHaveAttribute(
      "href",
      "/app/sessions/session-1#mobile-my-records",
    );

    await user.click(scoped.getByRole("button", { name: "피드백 문서" }));
    expect(scoped.getByRole("button", { name: "피드백 문서" })).toHaveClass("is-on");
    expect(scoped.getByRole("button", { name: "피드백 문서" })).toHaveAttribute("aria-pressed", "true");
    expect(scoped.getByText("팩트풀니스")).toBeInTheDocument();
    expect(scoped.getByText("No.01 · 2025.11.26")).toBeInTheDocument();
    expect(scoped.getByText("2026.04.20 등록")).toBeInTheDocument();
    expect(scoped.queryByText("독서모임 1차 피드백")).not.toBeInTheDocument();
    expect(scoped.getByText("팩트풀니스").closest(".m-list-row")?.querySelector("img")).toHaveAttribute(
      "src",
      "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
    );
    const readAction = scoped.getByRole("link", { name: seededReportReadLabel });
    const pdfAction = scoped.getByRole("link", { name: seededReportPdfLabel });
    expect(readAction).toHaveAttribute("href", "/app/feedback/session-1");
    expect(readAction).toHaveAttribute("aria-label", seededReportReadLabel);
    expect(readAction).toHaveAttribute("title", seededReportReadLabel);
    expect(readAction).not.toHaveTextContent("읽기");
    expect(pdfAction).toHaveAttribute("href", "/app/feedback/session-1/print");
    expect(pdfAction).toHaveAttribute("aria-label", seededReportPdfLabel);
    expect(pdfAction).toHaveAttribute("title", seededReportPdfLabel);
    expect(pdfAction).not.toHaveTextContent("PDF로 저장");
    expect(scoped.queryByText("feedback-6-suhan.html")).not.toBeInTheDocument();
  });

  it("moves archive tab selection with keyboard arrow keys", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />,
    );
    const desktop = getDesktop(container);

    const sessionTab = desktop.getByRole("button", { name: "세션" });
    sessionTab.focus();
    expect(sessionTab).toHaveFocus();

    await user.keyboard("{ArrowRight}");

    expect(desktop.getByRole("button", { name: "내 서평" })).toHaveAttribute("aria-pressed", "true");
    expect(desktop.getByRole("button", { name: "내 서평" })).toHaveFocus();

    await user.keyboard("{End}");

    expect(desktop.getByRole("button", { name: "피드백 문서" })).toHaveAttribute("aria-pressed", "true");
    expect(desktop.getByText("팩트풀니스")).toBeInTheDocument();
    expect(desktop.getByText("No.01 · 2025.11.26 · 2026.04.20 등록")).toBeInTheDocument();
  });

  it("uses contextual session actions only for available app session routes", () => {
    const { container } = render(
      <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />,
    );
    const desktop = getDesktop(container);

    const latestSessionLink = desktop.getByRole("link", { name: "No.6 가난한 찰리의 연감 열기" });
    expect(latestSessionLink).toHaveAttribute(
      "href",
      "/app/sessions/session-6",
    );
    expect(latestSessionLink).not.toHaveClass("btn");
    expect(latestSessionLink).toHaveClass("rm-archive-session-action");
    expect(desktop.getByRole("link", { name: "No.1 팩트풀니스 열기" })).toHaveAttribute(
      "href",
      "/app/sessions/session-1",
    );
    expect(desktop.queryByText("열기 →")).not.toBeInTheDocument();
  });

  it("uses router navigation without preserving archive scroll before session and feedback links", async () => {
    const user = userEvent.setup();

    setScrollY(720);
    window.sessionStorage.setItem(ARCHIVE_SCROLL_KEY, "stale");
    const desktopRender = render(
      <MemoryRouter initialEntries={["/app/archive?view=sessions"]}>
        <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />
      </MemoryRouter>,
    );

    await user.click(getDesktop(desktopRender.container).getByRole("link", { name: "No.6 가난한 찰리의 연감 열기" }));

    expectNoArchiveScrollSnapshot();

    desktopRender.unmount();
    window.sessionStorage.clear();
    setScrollY(360);
    window.sessionStorage.setItem(ARCHIVE_SCROLL_KEY, "stale");

    const mobileRender = render(
      <MemoryRouter initialEntries={["/app/archive?view=sessions"]}>
        <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />
      </MemoryRouter>,
    );
    const mobile = within(mobileRender.container.querySelector(".rm-archive-mobile") as HTMLElement);

    await user.click(mobile.getByRole("link", { name: "No.6 가난한 찰리의 연감 열기" }));

    expectNoArchiveScrollSnapshot();

    mobileRender.unmount();
    window.sessionStorage.clear();
    setScrollY(540);
    window.sessionStorage.setItem(ARCHIVE_SCROLL_KEY, "stale");

    const feedbackRender = render(
      <MemoryRouter initialEntries={["/app/archive?view=report"]}>
        <ArchivePage
          sessions={seededSessions}
          questions={seededQuestions}
          reviews={seededReviews}
          reports={seededReports}
          initialView="report"
        />
      </MemoryRouter>,
    );

    await user.click(getDesktop(feedbackRender.container).getByRole("link", { name: seededReportReadLabel }));

    expectNoArchiveScrollSnapshot();

    feedbackRender.unmount();
    window.sessionStorage.clear();
    setScrollY(420);
    window.sessionStorage.setItem(ARCHIVE_SCROLL_KEY, "stale");

    const printRender = render(
      <MemoryRouter initialEntries={["/app/archive?view=report"]}>
        <ArchivePage
          sessions={seededSessions}
          questions={seededQuestions}
          reviews={seededReviews}
          reports={seededReports}
          initialView="report"
        />
      </MemoryRouter>,
    );

    await user.click(getDesktop(printRender.container).getByRole("link", { name: seededReportPdfLabel }));

    expectNoArchiveScrollSnapshot();
  });

  it("links unpublished showcase sessions to member archive detail on desktop and mobile", () => {
    const unpublishedArchiveSession: ArchiveSessionItem = {
      sessionId: "session-unpublished-showcase",
      sessionNumber: 8,
      title: "8회차 모임 · 비공개 쇼케이스 책",
      bookTitle: "비공개 쇼케이스 책",
      bookAuthor: "아카이브 작가",
      bookImageUrl: null,
      date: "2026-06-17",
      attendance: 5,
      total: 6,
      published: false,
      state: "CLOSED",
    };

    const { container } = render(
      <ArchivePage sessions={[unpublishedArchiveSession]} questions={[]} reviews={[]} reports={[]} />,
    );
    const desktop = getDesktop(container);
    const mobile = within(container.querySelector(".rm-archive-mobile") as HTMLElement);

    expect(desktop.getByRole("link", { name: "No.8 비공개 쇼케이스 책 열기" })).toHaveAttribute(
      "href",
      "/app/sessions/session-unpublished-showcase",
    );
    expect(mobile.getByRole("link", { name: "No.8 비공개 쇼케이스 책 열기" })).toHaveAttribute(
      "href",
      "/app/sessions/session-unpublished-showcase",
    );
    expect(desktop.queryByText("준비 중")).not.toBeInTheDocument();
    expect(mobile.queryByText("준비 중")).not.toBeInTheDocument();
    expect(desktop.queryByText("공개 기록")).not.toBeInTheDocument();
    expect(mobile.queryByText("공개 기록")).not.toBeInTheDocument();
    expect(desktop.getByText("비공개 기록")).toBeInTheDocument();
    expect(mobile.getByText("비공개")).toBeInTheDocument();
  });

  it("switches archive tabs to reviews, questions, and feedback document listings", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <ArchivePage sessions={seededSessions} questions={seededQuestions} reviews={seededReviews} reports={seededReports} />,
    );
    const desktop = getDesktop(container);

    await user.click(desktop.getByRole("button", { name: "내 서평" }));
    expect(desktop.getByText("서평 · 2026-04-15")).toBeInTheDocument();
    expect(desktop.getByText("가난한 찰리의 연감")).toBeInTheDocument();
    expect(desktop.getByText("나")).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "No.6 가난한 찰리의 연감 세션으로" })).toHaveAttribute(
      "href",
      "/app/sessions/session-6#my-records",
    );
    expect(desktop.queryByText("맡겨진 소녀")).not.toBeInTheDocument();

    await user.click(desktop.getByRole("button", { name: "내 질문" }));
    expect(desktop.getByText("Q1 · 2025.11.26")).toHaveStyle({ color: "var(--text-3)" });
    expect(desktop.queryByText("저장된 질문 Q1 · 2025.11.26")).not.toBeInTheDocument();
    expect(desktop.getByText("10가지 본능 중에서 본인에게 가장 강하게 작용한다고 느낀 것은 무엇인가요?")).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "Q1 팩트풀니스 세션으로" })).toHaveAttribute(
      "href",
      "/app/sessions/session-1#my-records",
    );

    await user.click(desktop.getByRole("button", { name: "피드백 문서" }));
    expect(desktop.getByText("팩트풀니스")).toBeInTheDocument();
    expect(desktop.getByText("No.01 · 2025.11.26 · 2026.04.20 등록")).toBeInTheDocument();
    expect(desktop.queryByText("독서모임 1차 피드백")).not.toBeInTheDocument();
    expect(desktop.getByText("팩트풀니스").closest("article")?.querySelector("img")).toHaveAttribute(
      "src",
      "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
    );
    expect(desktop.queryByText("DOC")).not.toBeInTheDocument();
    const readAction = desktop.getByRole("link", { name: seededReportReadLabel });
    const pdfAction = desktop.getByRole("link", { name: seededReportPdfLabel });
    expect(readAction).toHaveAttribute("href", "/app/feedback/session-1");
    expect(readAction).toHaveAttribute("aria-label", seededReportReadLabel);
    expect(readAction).toHaveAttribute("title", seededReportReadLabel);
    expect(readAction).toHaveClass("btn-quiet");
    expect(readAction).not.toHaveClass("btn-ghost");
    expect(readAction).not.toHaveTextContent("읽기");
    expect(pdfAction).toHaveAttribute("href", "/app/feedback/session-1/print");
    expect(pdfAction).toHaveAttribute("aria-label", seededReportPdfLabel);
    expect(pdfAction).toHaveAttribute("title", seededReportPdfLabel);
    expect(pdfAction).not.toHaveTextContent("PDF로 저장");
    expect(desktop.queryByText("feedback-13.html")).not.toBeInTheDocument();
  });

  it("uses contextual icon-only labels when multiple feedback reports are listed", () => {
    const { container } = render(
      <ArchivePage
        sessions={[]}
        questions={[]}
        reviews={[]}
        reports={[
          ...seededReports,
          {
            sessionId: "session-2",
            sessionNumber: 2,
            title: "독서모임 2차 피드백",
            bookTitle: "냉정한 이타주의자",
            date: "2025-12-17",
            fileName: "251217 2차.md",
            uploadedAt: "2026-04-21T09:00:00Z",
          },
        ]}
        initialView="report"
      />,
    );
    const desktop = getDesktop(container);

    expect(desktop.queryByRole("link", { name: "읽기" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "PDF로 저장" })).not.toBeInTheDocument();
    expect(desktop.getByRole("link", { name: seededReportReadLabel })).toHaveAttribute("href", "/app/feedback/session-1");
    expect(desktop.getByRole("link", { name: seededReportPdfLabel })).toHaveAttribute("href", "/app/feedback/session-1/print");
    expect(desktop.getByRole("link", { name: "No.02 냉정한 이타주의자 피드백 문서 읽기" })).toHaveAttribute(
      "href",
      "/app/feedback/session-2",
    );
    expect(desktop.getByRole("link", { name: "No.02 냉정한 이타주의자 피드백 문서 PDF로 저장" })).toHaveAttribute(
      "href",
      "/app/feedback/session-2/print",
    );
  });

  it("passes source archive tab state to session detail links", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app/archive?view=reviews"]}>
        <Routes>
          <Route
            path="/app/archive"
            element={
              <ArchivePage
                sessions={seededSessions}
                questions={seededQuestions}
                reviews={seededReviews}
                reports={seededReports}
                initialView="reviews"
              />
            }
          />
          <Route path="/app/sessions/:sessionId" element={<LocationStateEcho />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getAllByRole("link", { name: "No.6 가난한 찰리의 연감 세션으로" })[0]);

    expect(screen.getByTestId("return-to")).toHaveTextContent("/app/archive?view=reviews");
    expect(screen.getByTestId("return-label")).toHaveTextContent("아카이브로");
  });

  it("can open directly with the feedback document tab selected", () => {
    const { container } = render(
      <ArchivePage
        sessions={seededSessions}
        questions={seededQuestions}
        reviews={seededReviews}
        reports={seededReports}
        initialView="report"
      />,
    );
    const desktop = getDesktop(container);

    expect(desktop.getByRole("button", { name: "피드백 문서" })).toHaveAttribute("aria-pressed", "true");
    expect(desktop.getByText("팩트풀니스")).toBeInTheDocument();
    expect(desktop.getByText("No.01 · 2025.11.26 · 2026.04.20 등록")).toBeInTheDocument();
  });

  it("syncs the visible archive tab when search params change after initial render", async () => {
    const user = userEvent.setup();
    const { container, getByRole } = render(
      <MemoryRouter initialEntries={["/app/archive?view=sessions"]}>
        <ArchiveSearchParamHarness />
      </MemoryRouter>,
    );

    expect(getDesktop(container).getByRole("button", { name: "세션" })).toHaveAttribute("aria-pressed", "true");

    await user.click(getByRole("button", { name: "search report" }));

    await waitFor(() => {
      expect(getDesktop(container).getByRole("button", { name: "피드백 문서" })).toHaveAttribute("aria-pressed", "true");
    });
    expect(getDesktop(container).getByText("팩트풀니스")).toBeInTheDocument();
    expect(getDesktop(container).getByText("No.01 · 2025.11.26 · 2026.04.20 등록")).toBeInTheDocument();
  });

  it("clears stale archive scroll snapshots after archive content renders", () => {
    const scrollTo = setScrollToMock();
    window.sessionStorage.setItem(
      ARCHIVE_SCROLL_KEY,
      JSON.stringify({
        pathname: "/app/archive",
        search: "?view=sessions",
        scrollY: 640,
      }),
    );
    window.history.pushState({}, "", "/app/archive?view=sessions");

    render(
      <ArchivePage
        sessions={seededSessions}
        questions={seededQuestions}
        reviews={seededReviews}
        reports={seededReports}
        routePathname="/app/archive"
        routeSearch="?view=sessions"
      />,
    );

    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(ARCHIVE_SCROLL_KEY)).toBeNull();
  });

  it("encodes app session ids without encoding the my-records hash", async () => {
    const user = userEvent.setup();
    const encodedSessionId = "session 7/slash";
    const encodedSessionHref = "/app/sessions/session%207%2Fslash";
    const encodedRecordsHref = `${encodedSessionHref}#my-records`;
    const sessionsWithEncodedId: ArchiveSessionItem[] = [
      {
        sessionId: encodedSessionId,
        sessionNumber: 7,
        title: "7회차 모임 · URL 책",
        bookTitle: "URL 책",
        bookAuthor: "링크 작가",
        bookImageUrl: null,
        date: "2026-05-20",
        attendance: 5,
        total: 6,
        published: true,
        state: "CLOSED",
      },
    ];
    const questionsWithEncodedId: MyArchiveQuestionItem[] = [
      {
        sessionId: encodedSessionId,
        sessionNumber: 7,
        bookTitle: "URL 책",
        date: "2026-05-20",
        priority: 2,
        text: "특수 문자가 있는 세션도 열리나요?",
        draftThought: null,
      },
    ];
    const reviewsWithEncodedId: MyArchiveReviewItem[] = [
      {
        sessionId: encodedSessionId,
        sessionNumber: 7,
        bookTitle: "URL 책",
        date: "2026-05-20",
        kind: "ONE_LINE_REVIEW",
        text: "링크 인코딩을 확인한다.",
      },
    ];
    const reportsWithEncodedId: FeedbackDocumentListItem[] = [
      {
        sessionId: encodedSessionId,
        sessionNumber: 7,
        title: "독서모임 7차 피드백",
        bookTitle: "URL 책",
        date: "2026-05-20",
        fileName: "260520 7차.md",
        uploadedAt: "2026-05-21T09:00:00Z",
      },
    ];

    const { container } = render(
      <ArchivePage
        sessions={sessionsWithEncodedId}
        questions={questionsWithEncodedId}
        reviews={reviewsWithEncodedId}
        reports={reportsWithEncodedId}
      />,
    );
    const desktop = getDesktop(container);

    expect(desktop.getByRole("link", { name: "No.7 URL 책 열기" })).toHaveAttribute("href", encodedSessionHref);

    await user.click(desktop.getByRole("button", { name: "내 서평" }));
    expect(desktop.getByRole("link", { name: "No.7 URL 책 세션으로" })).toHaveAttribute("href", encodedRecordsHref);

    await user.click(desktop.getByRole("button", { name: "내 질문" }));
    expect(desktop.getByRole("link", { name: "Q2 URL 책 세션으로" })).toHaveAttribute("href", encodedRecordsHref);

    await user.click(desktop.getByRole("button", { name: "피드백 문서" }));
    expect(desktop.getByRole("link", { name: "No.07 URL 책 피드백 문서 읽기" })).toHaveAttribute(
      "href",
      "/app/feedback/session%207%2Fslash",
    );
    expect(desktop.getByRole("link", { name: "No.07 URL 책 피드백 문서 PDF로 저장" })).toHaveAttribute(
      "href",
      "/app/feedback/session%207%2Fslash/print",
    );
  });

  it("renders empty states instead of fallback samples", async () => {
    const user = userEvent.setup();

    const { container } = render(<ArchivePage sessions={[]} questions={[]} reviews={[]} reports={[]} />);
    const desktop = getDesktop(container);

    expect(desktop.getByText("아직 저장된 모임 기록이 없습니다.")).toBeInTheDocument();

    await user.click(desktop.getByRole("button", { name: "내 서평" }));
    expect(desktop.getByText("아직 작성된 서평이 없습니다.")).toBeInTheDocument();
    expect(desktop.queryByText("맡겨진 소녀")).not.toBeInTheDocument();

    await user.click(desktop.getByRole("button", { name: "내 질문" }));
    expect(desktop.getByText("아직 저장된 질문이 없습니다.")).toBeInTheDocument();

    await user.click(desktop.getByRole("button", { name: "피드백 문서" }));
    expect(desktop.getByText("아직 열람 가능한 피드백 문서가 없습니다.")).toBeInTheDocument();
  });

  it("renders mobile empty states with mobile card/list primitives", async () => {
    const user = userEvent.setup();
    const { container } = render(<ArchivePage sessions={[]} questions={[]} reviews={[]} reports={[]} />);

    const mobile = container.querySelector(".rm-archive-mobile") as HTMLElement;
    expect(mobile).not.toBeNull();
    const scoped = within(mobile);

    expect(scoped.getByText("0권 · 0개의 질문 · 0개의 서평")).toBeInTheDocument();
    expect(scoped.getByText("아직 저장된 모임 기록이 없습니다.")).toHaveClass("small");
    expect(mobile.querySelector(".m-card-quiet")).not.toBeNull();

    await user.click(scoped.getByRole("button", { name: "내 서평" }));
    expect(scoped.getByText("아직 작성된 서평이 없습니다.")).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "내 질문" }));
    expect(scoped.getByText("아직 저장된 질문이 없습니다.")).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "피드백 문서" }));
    expect(scoped.getByText("아직 열람 가능한 피드백 문서가 없습니다.")).toBeInTheDocument();
  });
});
