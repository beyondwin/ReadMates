import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyPage from "@/features/archive/components/my-page";
import type { FeedbackDocumentListItem, MyPageResponse } from "@/shared/api/readmates";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type MyPageProps = Parameters<typeof MyPage>[0];

const data: MyPageResponse = {
  displayName: "김호스트",
  shortName: "우",
  email: "host@example.com",
  joinedAt: "2025-11",
  sessionCount: 6,
  totalSessionCount: 13,
  recentAttendances: [
    { sessionNumber: 8, attended: true },
    { sessionNumber: 9, attended: true },
    { sessionNumber: 10, attended: false },
    { sessionNumber: 11, attended: true },
    { sessionNumber: 12, attended: true },
    { sessionNumber: 13, attended: true },
  ],
};

const reports: FeedbackDocumentListItem[] = [
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

function renderMyPage(overrides: Partial<MyPageProps> = {}) {
  const props: MyPageProps = {
    data,
    reports,
    reviewCount: 3,
    questionCount: 7,
    ...overrides,
  };

  return render(<MyPage {...props} />);
}

function desktopScope(container: HTMLElement) {
  const desktop = container.querySelector(".desktop-only");
  return desktop ? within(desktop as HTMLElement) : screen;
}

describe("MyPage", () => {
  it("shows account, rhythm, and feedback document sections", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByRole("heading", { level: 1, name: "내 공간" })).toBeInTheDocument();
    expect(scoped.queryByText("My")).not.toBeInTheDocument();
    expect(scoped.queryByText("내 서가 · 계정")).not.toBeInTheDocument();
    expect(scoped.getByText("계정")).toBeInTheDocument();
    expect(scoped.getByText("김호스트")).toBeInTheDocument();
    expect(scoped.getByText("host@example.com")).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(scoped.getByText("나의 리듬")).toBeInTheDocument();
    expect(scoped.getByText("피드백 문서")).toBeInTheDocument();
    expect(scoped.getByText("팩트풀니스")).toBeInTheDocument();
    expect(scoped.getByText("2025.11")).toBeInTheDocument();
    expect(scoped.getByText("2025.11.26 · PDF")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: "읽기" })).toHaveAttribute("href", "/app/feedback/session-1");
    expect(scoped.getByRole("link", { name: "PDF로 저장" })).toHaveAttribute(
      "href",
      "/app/feedback/session-1/print",
    );
    expect(scoped.queryByText("읽기")).not.toBeInTheDocument();
    expect(scoped.queryByText("PDF로 저장")).not.toBeInTheDocument();
    expect(scoped.queryByText("물고기는 존재하지 않는다")).not.toBeInTheDocument();
    expect(scoped.queryByText("feedback-13.html")).not.toBeInTheDocument();
  });

  it("renders the standalone-aligned mobile my page shell", () => {
    const { container } = renderMyPage();

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
    expect(scoped.getByText("멤버 · 2025.11 합류")).toBeInTheDocument();
    expect(scoped.getByText("설정")).toBeInTheDocument();
    expect(scoped.getByText("알림")).toBeInTheDocument();
    expect(scoped.getByText("캘린더 연동")).toBeInTheDocument();
    expect(scoped.getByText("테마 · 표시")).toBeInTheDocument();
    expect(scoped.getByText("연결 안 됨")).toBeInTheDocument();
    expect(scoped.getByText("라이트")).toBeInTheDocument();
    expect(scoped.getAllByText("준비 중")).toHaveLength(4);
    expect(scoped.getByText("클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.")).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "탈퇴" })).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(mobile?.querySelector(".m-card")).not.toBeNull();
    expect(mobile?.querySelectorAll(".m-list")).toHaveLength(2);
  });

  it("logs out from the mobile my page through the BFF", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const { container } = renderMyPage();

    const mobile = container.querySelector(".rm-my-mobile");
    expect(mobile).not.toBeNull();

    await user.click(within(mobile as HTMLElement).getByRole("button", { name: "로그아웃" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/logout", { method: "POST" }),
    );
    expect(location.href).toBe("/login");
  });

  it("logs out from the desktop my page through the BFF", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    await user.click(scoped.getByRole("button", { name: "로그아웃" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/logout", { method: "POST" }),
    );
    expect(location.href).toBe("/login");
  });

  it("shows key notification and preference settings", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByText("알림")).toBeInTheDocument();
    expect(scoped.getByText("다음 모임 7일 전 리마인더")).toBeInTheDocument();
    expect(scoped.getByText("책·일정·미팅 URL")).toBeInTheDocument();
    expect(scoped.getByText("질문 마감 전날 알림")).toBeInTheDocument();
    expect(scoped.getByText("개인 설정")).toBeInTheDocument();
    expect(scoped.getByText("표시 이름")).toBeInTheDocument();
    expect(scoped.getByText("기록 공개 범위")).toBeInTheDocument();
    expect(scoped.getByText("클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.")).toBeInTheDocument();
  });

  it("renders notifications as read-only pending status rows", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);
    const reminderRow = scoped.getByText("다음 모임 7일 전 리마인더").closest(".row-between") as HTMLElement;
    const reviewRow = scoped.getByText("다른 멤버의 서평 공개").closest(".row-between") as HTMLElement;

    expect(scoped.queryAllByRole("switch")).toHaveLength(0);
    expect(within(reminderRow).getByText("준비 중")).toBeInTheDocument();
    expect(within(reviewRow).getByText("준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("다음 모임 7일 전 리마인더 알림 설정 준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("다른 멤버의 서평 공개 알림 설정 준비 중")).toBeInTheDocument();
  });

  it("uses contextual names for read-only account preference states", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByText("김호스트 · @host")).toBeInTheDocument();
    expect(scoped.queryByText("김호스트 · host@example.com · @host")).not.toBeInTheDocument();
    expect(scoped.getByText("프로필 수정 준비 중")).toBeInTheDocument();
    expect(scoped.getAllByText("변경 준비 중")).toHaveLength(3);
    expect(scoped.getByLabelText("표시 이름 변경 준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("기록 공개 범위 변경 준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("언어 변경 준비 중")).toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "표시 이름 변경" })).not.toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "기록 공개 범위 변경" })).not.toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "언어 변경" })).not.toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "탈퇴" })).toBeInTheDocument();
  });

  it("confirms and submits self leave", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    await user.click(scoped.getByRole("button", { name: "탈퇴" }));

    expect(
      scoped.getByText('탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.'),
    ).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "탈퇴 확인" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/me/membership/leave",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
      }),
    );
    expect(await scoped.findByRole("status")).toHaveTextContent("탈퇴 처리되었습니다.");
    expect(location.href).toBe("/about");
  });

  it("confirms self leave from the mobile my page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const { container } = renderMyPage();
    const mobile = container.querySelector(".rm-my-mobile");
    expect(mobile).not.toBeNull();
    const scoped = within(mobile as HTMLElement);

    await user.click(scoped.getByRole("button", { name: "탈퇴" }));

    expect(
      scoped.getByText('탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.'),
    ).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "탈퇴 확인" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/me/membership/leave",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
      }),
    );
    expect(await scoped.findByRole("status")).toHaveTextContent("탈퇴 처리되었습니다.");
    expect(location.href).toBe("/about");
  });

  it("matches standalone account metadata spacing", () => {
    const { container } = renderMyPage();
    const desktop = container.querySelector(".desktop-only") as HTMLElement;
    const metadata = desktop.querySelector(".rm-account-keyval") as HTMLElement;
    const firstLabel = metadata.querySelector("dt") as HTMLElement;

    expect(metadata).not.toBeNull();
    expect(metadata).toHaveStyle({
      columnGap: "16px",
      rowGap: "8px",
      fontSize: "13px",
    });
    expect(firstLabel).toHaveStyle({ alignSelf: "center" });
  });

  it("uses the standalone feedback document title style", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByText("팩트풀니스")).toHaveClass("body");
    expect(scoped.getByText("2025.11.26 · PDF")).toHaveClass("tiny");
    expect(scoped.queryByText("독서모임 1차 피드백")).not.toBeInTheDocument();
  });

  it("renders real rhythm stats and an empty feedback document state when there are no reports", () => {
    const { container } = renderMyPage({ reports: [] });
    const scoped = desktopScope(container);

    expect(scoped.getByText("참석")).toBeInTheDocument();
    expect(scoped.getByText("6")).toBeInTheDocument();
    expect(scoped.getByText("/13")).toBeInTheDocument();
    expect(scoped.getByText("완독률")).toBeInTheDocument();
    expect(scoped.getByText("46")).toBeInTheDocument();
    expect(scoped.getByText("%")).toBeInTheDocument();
    expect(scoped.getByText("질문")).toBeInTheDocument();
    expect(scoped.getByText("7")).toBeInTheDocument();
    expect(scoped.getByText("개")).toBeInTheDocument();
    expect(scoped.getByText("서평")).toBeInTheDocument();
    expect(scoped.getByText("3")).toBeInTheDocument();
    expect(scoped.getByText("편")).toBeInTheDocument();
    expect(scoped.getByText("최근 6회 참석")).toBeInTheDocument();
    expect(scoped.getByText("No.8")).toBeInTheDocument();
    expect(scoped.getByText("No.13")).toBeInTheDocument();
    expect(scoped.getByText("아직 열람 가능한 피드백 문서가 없습니다.")).toBeInTheDocument();
  });

  it("does not infer recent attendance bars when the API has no recent attendance list", () => {
    const { container } = renderMyPage({
      data: {
        ...data,
        recentAttendances: [],
      },
    });
    const desktop = container.querySelector(".desktop-only") as HTMLElement;
    const scoped = within(desktop);

    expect(scoped.getByText("아직 최근 참석 데이터가 없습니다.")).toBeInTheDocument();
    expect(scoped.queryByText("최근 6회 참석")).not.toBeInTheDocument();
    expect(scoped.queryByText("No.8")).not.toBeInTheDocument();
    expect(scoped.queryByText("No.13")).not.toBeInTheDocument();
    expect(desktop.querySelectorAll(".rm-rhythm-attendance-bar")).toHaveLength(0);
  });

  it("uses larger standalone section titles", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    for (const title of ["계정", "알림", "나의 리듬", "개인 설정", "피드백 문서"]) {
      expect(scoped.getByRole("heading", { level: 2, name: title })).toHaveClass("h2");
    }
  });
});
