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

describe("HostPersonDetail", () => {
  it("renders FOLIO/tenure and 01-04 blocks instead of a leading 현재 상태 list", () => {
    render(
      <HostPersonDetail
        person={person}
        attendanceItems={person.attendanceHistory.items}
        nextCursor={null}
        loadingMore={false}
        loadMoreError={null}
        onLoadMore={() => undefined}
        peopleHref="/clubs/reading-sai/app/host/people"
        now={new Date("2026-09-02T14:20:00+09:00")}
        identity={{
          folioLabel: "FOLIO · 017",
          tenureLabel: "11개월",
          joinedLabel: "2025년 10월 가입 · 초대 링크로 참여",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "사람 목록으로" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "내 클럽" })).not.toBeInTheDocument();
    expect(screen.getByText("FOLIO · 017")).toBeVisible();
    expect(screen.getByText("활동 · 11개월")).toBeVisible();
    expect(screen.getByRole("heading", { name: "현재 일정" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "참석 응답" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "실제 출석" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "멤버십" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "현재 상태" })).not.toBeInTheDocument();
    expect(screen.getByText("일정 4판 · 준비 중")).toBeVisible();
    expect(screen.getByText("미응답")).toBeVisible();
  });
});
