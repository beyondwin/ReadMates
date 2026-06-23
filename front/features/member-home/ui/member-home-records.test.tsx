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

  it("renders missing feedback state without a feedback action", () => {
    render(
      <RecentRecordEntry
        entry={{
          ...entry,
          feedbackState: "MISSING",
          feedbackStatusLabel: "아직 열람 가능한 피드백 문서가 없습니다.",
        }}
      />,
    );

    expect(screen.getByText("아직 열람 가능한 피드백 문서가 없습니다.")).toBeInTheDocument();
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
