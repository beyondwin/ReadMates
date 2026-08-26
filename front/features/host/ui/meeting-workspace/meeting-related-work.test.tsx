import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildHostMeetingWorkspace } from "@/features/host/model/host-session-workspace-model";
import { MeetingRelatedWork } from "./meeting-related-work";

const view = buildHostMeetingWorkspace({
  currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/11111111-1111-1111-1111-111111111111?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost",
  state: "OPEN",
  meetingDate: "2026-08-28",
  today: "2026-08-21",
  unansweredResponseCount: 5,
  unknownAttendanceCount: 2,
  recordReadiness: {
    status: "ready",
    observedAt: "2026-08-21T03:00:00.000Z",
    facts: {
      hasDraft: true,
      draftLiveBaseStale: false,
      validationIssueCount: 0,
      hasAppliedRecord: false,
      publicationReady: false,
    },
  },
});

describe("MeetingRelatedWork", () => {
  it("renders secondary panel links instead of page-level 현재 모임 작업 navigation", () => {
    render(<MeetingRelatedWork tasks={view.relatedTasks} />);

    const related = screen.getByRole("navigation", { name: "관련 작업" });
    expect(within(related).getByRole("link", { name: "참석 응답" })).toHaveAttribute("href", expect.stringContaining("section=responses"));
    expect(within(related).getByRole("link", { name: "실제 출석" })).toHaveAttribute("href", expect.stringContaining("section=attendance"));
    expect(within(related).getByRole("link", { name: "모임 기록" })).toHaveAttribute("href", expect.stringContaining("section=records"));
    expect(within(related).getByRole("link", { name: "알림" })).toHaveAttribute("href", expect.stringContaining("section=notifications"));
    expect(within(related).getByRole("link", { name: "변경 내역" })).toHaveAttribute("href", expect.stringContaining("section=history"));
    expect(screen.queryByRole("navigation", { name: "현재 모임 작업" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /미응답 5/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /확인 필요/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /초안 있음/ })).not.toBeInTheDocument();
  });

  it("keeps notifications and history as secondary links, not primary chrome", () => {
    render(<MeetingRelatedWork tasks={view.relatedTasks} />);

    const related = screen.getByRole("navigation", { name: "관련 작업" });
    const links = within(related).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "참석 응답",
      "실제 출석",
      "모임 기록",
      "알림",
      "변경 내역",
    ]);
    expect(screen.queryByRole("link", { name: "개요" })).not.toBeInTheDocument();
  });
});
