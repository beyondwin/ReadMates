import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { HostTodayView } from "@/features/host/model/host-today-model";
import { HostTodayPage } from "./host-today-page";

const TODAY_CSS = readFileSync(path.resolve("features/host/ui/today/host-today.css"), "utf8");

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
    allHref: "/app/host/sessions",
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
    allHref: "/app/host/sessions",
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

  it("styles the hero/rail body as an asymmetric grid that collapses with mobile-only", () => {
    expect(TODAY_CSS).toMatch(
      /\.rm-host-today__grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*7fr\)\s+minmax\(0,\s*4fr\)/,
    );
    expect(TODAY_CSS).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.rm-host-today__grid[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it("promotes the hero to attendance entry when it is meeting day", () => {
    const meetingDayView: HostTodayView = {
      ...viewWithTwoQueueItems,
      headline: "오늘 모임 · 처리할 일 2건",
      nextMeeting: {
        sessionId: "session-open-1",
        statusLabel: "준비 중",
        isMeetingDay: true,
        detailHref: "/app/host/sessions/session-open-1",
      },
    };

    render(
      <HostTodayPage
        view={meetingDayView}
        nextMeetingBlock={<section aria-label="다음 모임">override should not win</section>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "오늘" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "오늘 모임" })).toBeInTheDocument();
    const attendanceCta = screen.getByRole("link", { name: /출석 확인/ });
    expect(attendanceCta).toHaveClass("btn-primary");
    expect(attendanceCta).toHaveAttribute(
      "href",
      "/app/host/sessions/session-open-1?section=attendance",
    );
    expect(screen.queryByText("override should not win")).not.toBeInTheDocument();
  });

  it("embeds the meeting-day attendance roster in the mobile home body", () => {
    const meetingDayView: HostTodayView = {
      ...viewWithTwoQueueItems,
      headline: "오늘 모임 · 처리할 일 2건",
      nextMeeting: {
        sessionId: "session-open-1",
        statusLabel: "준비 중",
        isMeetingDay: true,
        detailHref: "/app/host/sessions/session-open-1",
      },
    };

    render(
      <HostTodayPage
        view={meetingDayView}
        meetingDayAttendance={<section aria-label="당일 출석 명단">원탭 명단</section>}
      />,
    );

    const hero = screen.getByRole("region", { name: "오늘 모임" });
    expect(within(hero).getByRole("region", { name: "당일 출석 명단" })).toHaveTextContent("원탭 명단");
    expect(TODAY_CSS).toMatch(/\.rm-host-today__meeting-day-roster/);
  });

  it("points 운영 기록 전체 보기 at sessions and expands the in-page queue past the cap", async () => {
    const user = userEvent.setup();
    const overflowView: HostTodayView = {
      ...viewWithTwoQueueItems,
      headline: "다음 모임까지 9일 · 처리할 일 8건",
      queue: {
        ...viewWithTwoQueueItems.queue,
        totalCount: 8,
        items: Array.from({ length: 8 }, (_, index) => ({
          id: `record:session-${index}`,
          kind: "record" as const,
          title: `대기 책 ${index}`,
          detail: "초안이 남아 있습니다",
          agedLabel: "1일 경과",
          resolveHref: `/app/host/sessions/session-${index}?section=records`,
          resolveLabel: "기록 마저 쓰기",
        })),
      },
    };

    render(<HostTodayPage view={overflowView} />);

    const opsLinks = screen.getAllByRole("link", { name: "운영 기록 전체 보기" });
    expect(opsLinks.length).toBeGreaterThan(0);
    for (const link of opsLinks) {
      expect(link).toHaveAttribute("href", "/app/host/sessions");
    }

    const queue = screen.getByRole("region", { name: "처리할 일" });
    expect(within(queue).getAllByRole("listitem")).toHaveLength(7);
    expect(within(queue).queryByRole("link", { name: "전체 보기" })).not.toBeInTheDocument();
    await user.click(within(queue).getByRole("button", { name: "전체 보기" }));
    expect(within(queue).getAllByRole("listitem")).toHaveLength(8);
    expect(within(queue).queryByRole("button", { name: "전체 보기" })).not.toBeInTheDocument();
  });
});
