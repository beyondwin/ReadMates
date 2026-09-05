import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HostPersonDetailView } from "@/features/host/model/host-person-detail-model";
import { HostPersonDetail } from "./host-person-detail";

const person: HostPersonDetailView = {
  membershipId: "membership-park",
  displayName: "박서윤",
  avatarKey: "apple-green-book",
  status: "ACTIVE",
  role: "MEMBER",
  lastClubAccessAt: "2026-09-01T10:00:00+09:00",
  currentSchedule: {
    state: "OPEN",
    scheduleRevision: 4,
    scheduledAt: "2026-09-01T19:30:00",
  },
  currentRsvp: "NO_RESPONSE",
  attendanceHistory: {
    items: [{ sessionNumber: 27, scheduledAt: "2026-08-18T19:30:00", attendanceStatus: "ATTENDED" }],
    nextCursor: null,
  },
};

const defaultProps = {
  person,
  attendanceItems: person.attendanceHistory.items,
  nextCursor: null as string | null,
  loadingMore: false,
  loadMoreError: null as string | null,
  onLoadMore: () => undefined,
  peopleHref: "/clubs/reading-sai/app/host/people",
  now: new Date("2026-09-02T14:20:00+09:00"),
};

describe("HostPersonDetail", () => {
  it("renders back row, folio, section icons, attendance state icons, and a more menu without leaked ops text", () => {
    render(
      <HostPersonDetail
        {...defaultProps}
        identity={{
          folioLabel: "FOLIO · 017",
          tenureLabel: "11개월",
          joinedLabel: "2025년 10월 가입 · 초대 링크로 참여",
        }}
      />,
    );

    expect(document.querySelector('.rm-person-detail__back [data-icon="arrow-left"]')).toBeTruthy();
    expect(document.querySelector(".rm-person-detail__folio")).toHaveTextContent(/FOLIO/);
    expect(document.querySelectorAll(".rm-person-detail__section [data-icon]").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("button", { name: "더 보기" }).querySelector('[data-icon="more"]')).toBeTruthy();
    expect(screen.queryByText("세부 조작")).toBeNull();
    expect(screen.queryByText("사람 관리 원장으로")).toBeNull();
  });

  it("renders FOLIO/tenure and 01-04 blocks instead of a leading 현재 상태 list", () => {
    render(
      <HostPersonDetail
        {...defaultProps}
        identity={{
          folioLabel: "FOLIO · 017",
          tenureLabel: "11개월",
          joinedLabel: "2025년 10월 가입 · 초대 링크로 참여",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "사람" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "내 클럽" })).not.toBeInTheDocument();
    expect(screen.getByText("FOLIO · 017")).toBeVisible();
    expect(document.querySelector(".rm-person-detail__tenure")).toHaveTextContent("활동 · 11개월");
    expect(screen.getByRole("heading", { name: "현재 일정" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "참석 응답" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "실제 출석" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "멤버십" })).toBeVisible();
    expect(screen.getByRole("link", { name: "멤버 정보 관리" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "현재 상태" })).not.toBeInTheDocument();
    expect(screen.getByText("현재 일정 revision 4")).toBeVisible();
    expect(screen.getByText("미응답")).toBeVisible();
    expect(screen.getByText("8월 18일 · 27회 모임")).toBeVisible();
  });

  it("omits mockup-only identity and session links when the live payload does not include them", () => {
    render(<HostPersonDetail {...defaultProps} />);

    expect(screen.getByText("FOLIO")).toBeVisible();
    expect(screen.queryByText("FOLIO · 017")).not.toBeInTheDocument();
    expect(screen.queryByText("11개월")).not.toBeInTheDocument();
    expect(screen.queryByText("변경 전 확인")).not.toBeInTheDocument();
    expect(screen.queryByText("지구 끝의 온실")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "일정 안내 검토" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "변경 이력 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체 출석 보기" })).not.toBeInTheDocument();
  });

  it("maps load-more onto 전체 출석 보기 and keeps the membership manage link keyboard-reachable", () => {
    render(
      <HostPersonDetail
        {...defaultProps}
        nextCursor="opaque-attendance-cursor"
        peopleHref="/clubs/visual-authority/app/host/people"
      />,
    );

    expect(screen.getByRole("button", { name: "전체 출석 보기" })).toBeVisible();
    expect(screen.getByRole("link", { name: "멤버 정보 관리" })).toHaveAttribute(
      "href",
      "/clubs/visual-authority/app/host/people",
    );
  });
});
