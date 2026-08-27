import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HostTodayView } from "@/features/host/model/host-today-model";
import { HostTodayPage } from "./host-today-page";

const viewWithTwoQueueItems: HostTodayView = {
  headline: "다음 모임까지 9일 · 처리할 일 2건",
  nextMeeting: {
    sessionId: "session-open-1",
    statusLabel: "준비 중",
    isMeetingDay: false,
    detailHref: "/app/host/sessions/session-open-1",
  },
  queue: {
    items: [
      {
        id: "record:session-closed-1",
        kind: "record",
        title: "닫힌 책",
        detail: "초안이 남아 있습니다",
        agedLabel: "12일 경과",
        resolveHref: "/app/host/sessions/session-closed-1?section=records",
        resolveLabel: "기록 마저 쓰기",
      },
      {
        id: "notification:failures",
        kind: "notification",
        title: "알림 발송",
        detail: "실패 2건",
        agedLabel: "확인 필요",
        resolveHref: "/app/host/notifications",
        resolveLabel: "재시도 확인",
      },
    ],
    totalCount: 2,
    emptyCheckedAtLabel: null,
    allHref: "/app/host/operations",
  },
  upcoming: [
    {
      sessionId: "session-draft-2",
      ordinalLabel: "",
      date: "2026-09-12",
      href: "/app/host/sessions/session-draft-2",
    },
  ],
};

const emptyQueueView: HostTodayView = {
  headline: "다음 모임 없음 · 처리할 일 0건",
  nextMeeting: null,
  queue: {
    items: [],
    totalCount: 0,
    emptyCheckedAtLabel: "09:00",
    allHref: "/app/host/operations",
  },
  upcoming: [],
};

describe("HostTodayPage", () => {
  it("renders headline, queue rows with resolve CTAs, and the zero-as-data line", () => {
    render(<HostTodayPage view={viewWithTwoQueueItems} />);
    expect(screen.getByRole("heading", { name: /오늘/ })).toBeInTheDocument();
    // Assumption: assert Task 1 resolve labels (기록 마저 쓰기 / 재시도 확인 / 확인하기)
    // rather than inventing new CTA copy. Brief regex /기록 마저 쓰기|확인/ covers those.
    expect(screen.getAllByRole("link", { name: /기록 마저 쓰기|확인/ }).length).toBeGreaterThan(0);

    render(<HostTodayPage view={emptyQueueView} />);
    expect(screen.getByText(/오늘 처리할 일이 없습니다 · 마지막 확인/)).toBeInTheDocument();
  });
});
