import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MemberSessionDetailPage from "@/features/archive/components/member-session-detail-page";
import type { MemberArchiveSessionDetailResponse } from "@/shared/api/readmates";
import { archiveSessionDetailContractFixture } from "./api-contract-fixtures";

afterEach(cleanup);

const readableSession: MemberArchiveSessionDetailResponse = archiveSessionDetailContractFixture;

function renderDetail(session: MemberArchiveSessionDetailResponse = readableSession) {
  return render(<MemberSessionDetailPage session={session} />);
}

function getDesktop(container: HTMLElement) {
  const desktop = container.querySelector(".desktop-only");
  expect(desktop).not.toBeNull();
  return within(desktop as HTMLElement);
}

function getMobile(container: HTMLElement) {
  const mobile = container.querySelector(".mobile-only");
  expect(mobile).not.toBeNull();
  return within(mobile as HTMLElement);
}

describe("MemberSessionDetailPage", () => {
  it("renders readable feedback actions without the public guest CTA", () => {
    const { container } = renderDetail();
    const desktop = getDesktop(container);
    const mobile = getMobile(container);

    expect(desktop.getByText("팩트풀니스")).toBeInTheDocument();
    expect(desktop.getByText(/한스 로슬링/)).toBeInTheDocument();
    expect(desktop.getByText("아카이브 세션 · No.01 · 2025.11.26")).toBeInTheDocument();
    expect(desktop.getByRole("group", { name: "No.01 · 지난 회차 · 공개됨 · 문서 있음" })).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "요약" })).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "클럽 기록" })).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "내 기록" })).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "피드백 문서" })).toBeInTheDocument();
    expect(desktop.getAllByText("2026.04.20 등록").length).toBeGreaterThan(0);
    expect(mobile.getByText("팩트풀니스")).toBeInTheDocument();
    expect(mobile.getByText(/한스 로슬링/)).toBeInTheDocument();
    expect(mobile.getByText("No.01 · 2025.11.26")).toBeInTheDocument();
    expect(mobile.getByRole("group", { name: "No.01 · 지난 회차 · 공개됨 · 문서 있음" })).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: "클럽 기록" })).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: "피드백 문서" })).toBeInTheDocument();
    expect(mobile.getByText("2026.04.20 등록")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Join the reading");

    for (const scope of [desktop, mobile]) {
      expect(scope.getByRole("link", { name: "피드백 문서 열기" })).toHaveAttribute(
        "href",
        "/app/feedback/00000000-0000-0000-0000-000000000301",
      );
      expect(scope.getByRole("link", { name: "PDF 저장" })).toHaveAttribute(
        "href",
        "/app/feedback/00000000-0000-0000-0000-000000000301/print",
      );
    }
  });

  it("shows locked feedback copy for non-attendees without feedback document links", () => {
    const { container } = renderDetail({
      ...readableSession,
      myAttendanceStatus: "ABSENT",
      feedbackDocument: {
        available: true,
        readable: false,
        lockedReason: "NOT_ATTENDED",
        title: "독서모임 1차 피드백",
        uploadedAt: "2026-04-20T09:00:00Z",
      },
    });

    expect(screen.getAllByText("피드백 문서는 정식 멤버와 참석자에게만 열립니다.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "피드백 문서 열기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "PDF 저장" })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/app/feedback/00000000-0000-0000-0000-000000000301"]')).toBeNull();
    expect(container.querySelector('a[href="/app/feedback/00000000-0000-0000-0000-000000000301/print"]')).toBeNull();
  });

  it("shows missing feedback copy when no feedback document is available", () => {
    renderDetail({
      ...readableSession,
      feedbackDocument: {
        available: false,
        readable: false,
        lockedReason: "NOT_AVAILABLE",
        title: null,
        uploadedAt: null,
      },
    });

    expect(screen.getAllByText("아직 등록된 피드백 문서가 없습니다.").length).toBeGreaterThan(0);
  });

  it("shows an empty my-records state when the member has not written records", () => {
    renderDetail({
      ...readableSession,
      myQuestions: [],
      myCheckin: null,
      myOneLineReview: null,
      myLongReview: null,
    });

    expect(screen.getAllByText("이 회차에 남긴 내 질문이나 서평이 없습니다.").length).toBeGreaterThan(0);
  });

  it("uses surname avatars for checkins and public one-line records", () => {
    renderDetail({
      ...readableSession,
      clubCheckins: [
        {
          authorName: "김호스트",
          authorShortName: "호스트",
          readingProgress: 100,
          note: "완독했습니다.",
        },
      ],
      publicOneLiners: [
        {
          authorName: "김호스트",
          authorShortName: "호스트",
          text: "정확함의 문제였다.",
        },
      ],
    });

    const authorAvatars = screen.getAllByLabelText("김호스트");
    expect(authorAvatars.length).toBeGreaterThan(0);
    expect(authorAvatars.every((avatar) => avatar.textContent === "김")).toBe(true);
  });

  it("shows a host edit link in the desktop rail for hosts", () => {
    const { container } = renderDetail({
      ...readableSession,
      isHost: true,
    });

    const desktop = getDesktop(container);
    expect(desktop.getByRole("link", { name: "세션 편집" })).toHaveAttribute(
      "href",
      "/app/host/sessions/00000000-0000-0000-0000-000000000301/edit",
    );
  });
});
