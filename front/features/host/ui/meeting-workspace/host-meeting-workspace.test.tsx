import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HOST_MEETING_PERFORMANCE_METRICS,
  beginHostMeetingRouteCommit,
  resetHostMeetingPerformanceStateForTests,
} from "@/shared/observability/host-meeting-performance";
import {
  buildHostMeetingWorkspace,
  type HostMeetingWorkspaceView,
} from "@/features/host/model/host-session-workspace-model";
import { HostMeetingWorkspace, type HostMeetingWorkspaceProps } from "./host-meeting-workspace";
import { buildMeetingAudienceProjections } from "./meeting-audience-projections";
import { MeetingRelatedWork } from "./meeting-related-work";

const view: HostMeetingWorkspaceView = buildHostMeetingWorkspace({
  currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/11111111-1111-1111-1111-111111111111",
  state: "OPEN",
  meetingDate: "2026-08-26",
  today: "2026-08-26",
  unansweredResponseCount: 0,
  unknownAttendanceCount: 1,
  recordReadiness: { status: "not-required" },
});

const props: HostMeetingWorkspaceProps = {
  view,
  header: {
    sessionNumber: 12,
    title: "길어도 온전히 읽히는 모임 제목 A deliberately long English meeting title",
    date: "2026.08.26",
    time: "20:00",
    location: "온라인과 오프라인을 함께 설명하는 긴 장소",
  },
  facts: view.facts,
  relatedWork: <MeetingRelatedWork tasks={view.relatedTasks} />,
  projections: buildMeetingAudienceProjections({ visibility: "MEMBER", lifecycle: "OPEN" }),
  recovery: <p data-testid="focus-deck-recovery">최근 변경을 되돌릴 수 있습니다.</p>,
  panel: <div data-testid="focus-deck-panel">현재 작업 내용</div>,
  onPrimaryAction: vi.fn(),
};

function following(left: Node, right: Node) {
  return Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("HostMeetingWorkspace", () => {
  afterEach(() => resetHostMeetingPerformanceStateForTests());

  it("commits first usable after the primary action is laid out", () => {
    beginHostMeetingRouteCommit();
    render(<HostMeetingWorkspace {...props} />);
    expect(performance.getEntriesByName(HOST_MEETING_PERFORMANCE_METRICS.routeDataToUsable)).toHaveLength(1);
  });

  it("renders Focus Deck order without page navigation or a judgment rail", () => {
    render(<HostMeetingWorkspace {...props} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "현재 모임 작업" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "현재 모임 작업" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "실행 전 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "지금 확인할 일" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    const header = screen.getByRole("banner");
    const focus = screen.getByRole("region", { name: "지금 할 일" });
    const facts = screen.getByRole("region", { name: "진행 목록" });
    const related = screen.getByRole("navigation", { name: "관련 작업" });
    const recovery = screen.getByTestId("focus-deck-recovery");
    const panel = screen.getByTestId("focus-deck-panel");

    expect(header).toHaveTextContent("길어도 온전히 읽히는 모임 제목");
    expect(header).toHaveTextContent("멤버와 준비 중");
    expect(following(header, focus)).toBe(true);
    expect(following(focus, facts)).toBe(true);
    expect(following(facts, related)).toBe(true);
    expect(following(related, recovery)).toBe(true);
    expect(following(recovery, panel)).toBe(true);
    expect(panel).toHaveTextContent("현재 작업 내용");
  });

  it("keeps one desktop and one mobile primary CTA on the same callback", async () => {
    const onPrimaryAction = vi.fn();
    const user = userEvent.setup();
    render(<HostMeetingWorkspace {...props} onPrimaryAction={onPrimaryAction} />);

    const buttons = screen.getAllByRole("button", { name: "실제 출석 확인" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveClass("rm-host-session-workspace__cta--desktop");
    expect(buttons[1]).toHaveClass("rm-host-session-workspace__cta--mobile");
    await user.click(buttons[0]!);
    await user.click(buttons[1]!);
    expect(onPrimaryAction).toHaveBeenCalledTimes(2);
  });

  it("fail-closes CLOSED until record readiness is ready", () => {
    const recordReadiness = { status: "pending" as const };
    const closed = buildHostMeetingWorkspace({
      currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/11111111-1111-1111-1111-111111111111",
      state: "CLOSED",
      meetingDate: "2026-08-20",
      today: "2026-08-26",
      unansweredResponseCount: 0,
      unknownAttendanceCount: 0,
      recordReadiness,
    });

    render(
      <HostMeetingWorkspace
        {...props}
        view={closed}
        facts={closed.facts}
        relatedWork={<MeetingRelatedWork tasks={closed.relatedTasks} />}
        recordReadiness={recordReadiness}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "다음 할 일 확인 중" });
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByRole("button", { name: "정리본 올리기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "게스트·멤버 노트에 기록 게시" })).not.toBeInTheDocument();
    expect(screen.getByText("기록 정리 중")).toBeVisible();
  });

  it("rehomes retry onto the Focus Deck instead of a judgment rail", async () => {
    const onRetryReadiness = vi.fn();
    const user = userEvent.setup();
    const recordReadiness = {
      status: "stale" as const,
      observedAt: "2026-08-25T01:02:03.000Z",
      retryable: true as const,
      facts: {
        hasDraft: false,
        draftLiveBaseStale: false,
        validationIssueCount: 0,
        hasAppliedRecord: false,
        publicationReady: false,
      },
    };
    const stale = buildHostMeetingWorkspace({
      currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/11111111-1111-1111-1111-111111111111",
      state: "CLOSED",
      meetingDate: "2026-08-20",
      today: "2026-08-26",
      unansweredResponseCount: 0,
      unknownAttendanceCount: 0,
      recordReadiness,
    });

    render(
      <HostMeetingWorkspace
        {...props}
        view={stale}
        facts={stale.facts}
        relatedWork={<MeetingRelatedWork tasks={stale.relatedTasks} />}
        recordReadiness={recordReadiness}
        onRetryReadiness={onRetryReadiness}
      />,
    );

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "최신 내용 확인" }));
    expect(onRetryReadiness).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "다음 할 일 확인 중" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("keeps PUBLISHED as 공개 완료 without upload or publish CTAs", () => {
    const recordReadiness = { status: "pending" as const };
    const published = buildHostMeetingWorkspace({
      currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/11111111-1111-1111-1111-111111111111",
      state: "PUBLISHED",
      meetingDate: "2026-08-20",
      today: "2026-08-26",
      unansweredResponseCount: 0,
      unknownAttendanceCount: 0,
      recordReadiness,
    });

    render(
      <HostMeetingWorkspace
        {...props}
        view={published}
        facts={published.facts}
        relatedWork={<MeetingRelatedWork tasks={published.relatedTasks} />}
        recordReadiness={recordReadiness}
      />,
    );

    expect(screen.getByText("공개 완료")).toBeVisible();
    expect(screen.queryByText("게스트·멤버 노트 게시 완료")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "공개 기록 보기" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "정리본 올리기" })).not.toBeInTheDocument();
  });

  it("maps former task badges and judgment projections into facts and related work", () => {
    render(<HostMeetingWorkspace {...props} />);

    const facts = screen.getByRole("region", { name: "진행 목록" });
    expect(within(facts).getByText("오늘이 모임일입니다.")).toBeVisible();
    expect(within(facts).getByText("실제 출석이 확인되지 않은 멤버가 1명입니다.")).toBeVisible();
    expect(within(facts).queryByText("확인 필요")).not.toBeInTheDocument();
    expect(within(facts).getByText("호스트")).toBeVisible();
    expect(within(facts).getByText("게스트·멤버")).toBeVisible();
    expect(within(facts).getByText("공개 기록")).toBeVisible();

    const related = screen.getByRole("navigation", { name: "관련 작업" });
    expect(within(related).getByRole("link", { name: "알림" })).toHaveAttribute("href", expect.stringContaining("section=notifications"));
    expect(within(related).getByRole("link", { name: "변경 내역" })).toHaveAttribute("href", expect.stringContaining("section=history"));
    expect(within(related).queryByText("확인 필요")).not.toBeInTheDocument();
  });

  it("does not open empty inert sheets from header secondary actions", async () => {
    const onOpenBasic = vi.fn();
    const onOpenHistory = vi.fn();
    const user = userEvent.setup();
    render(
      <HostMeetingWorkspace
        {...props}
        onOpenBasic={onOpenBasic}
        onOpenHistory={onOpenHistory}
      />,
    );

    const cta = screen.getAllByRole("button", { name: "실제 출석 확인" })[0]!;
    await user.click(screen.getByRole("button", { name: "모임 정보" }));
    expect(onOpenBasic).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cta.closest("[inert]")).toBeNull();

    await user.click(screen.getByRole("button", { name: "변경 내역" }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cta.closest("[inert]")).toBeNull();
  });

  it("does not treat publication readiness as public placement", () => {
    const recordReadiness = {
      status: "ready" as const,
      observedAt: "2026-08-25T01:02:03.000Z",
      facts: {
        hasDraft: true,
        draftLiveBaseStale: false,
        validationIssueCount: 0,
        hasAppliedRecord: true,
        publicationReady: true,
      },
    };
    const closed = buildHostMeetingWorkspace({
      currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/11111111-1111-1111-1111-111111111111",
      state: "CLOSED",
      meetingDate: "2026-08-20",
      today: "2026-08-26",
      unansweredResponseCount: 0,
      unknownAttendanceCount: 0,
      recordReadiness,
    });

    render(
      <HostMeetingWorkspace
        {...props}
        view={closed}
        facts={closed.facts}
        relatedWork={<MeetingRelatedWork tasks={closed.relatedTasks} />}
        projections={buildMeetingAudienceProjections({ visibility: "HOST_ONLY", lifecycle: "CLOSED" })}
        recordReadiness={recordReadiness}
      />,
    );

    const facts = screen.getByRole("region", { name: "진행 목록" });
    expect(within(facts).getByText("호스트만 확인")).toBeVisible();
    expect(within(facts).getByText("공개 기록에 게시 안 됨")).toBeVisible();
    expect(within(facts).queryByText("공개 기록에 게시")).not.toBeInTheDocument();
  });

  it("wires PUBLISHED public-result CTAs to the same href and create-revision callback", async () => {
    const onCreateRevision = vi.fn();
    const user = userEvent.setup();
    const published = buildHostMeetingWorkspace({
      currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/11111111-1111-1111-1111-111111111111",
      state: "PUBLISHED",
      meetingDate: "2026-08-20",
      today: "2026-08-26",
      unansweredResponseCount: 0,
      unknownAttendanceCount: 0,
      recordReadiness: { status: "pending" },
    });

    render(
      <HostMeetingWorkspace
        {...props}
        view={published}
        facts={published.facts}
        relatedWork={<MeetingRelatedWork tasks={published.relatedTasks} />}
        projections={buildMeetingAudienceProjections({ visibility: "PUBLIC", lifecycle: "PUBLISHED" })}
        publicRecordHref="/app/sessions/11111111-1111-1111-1111-111111111111"
        onCreateRevision={onCreateRevision}
      />,
    );

    const links = screen.getAllByRole("link", { name: "공개 기록 보기" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", expect.stringContaining("/app/sessions/11111111-1111-1111-1111-111111111111"));
    expect(links[1]).toHaveAttribute("href", expect.stringContaining("/app/sessions/11111111-1111-1111-1111-111111111111"));
    await user.click(screen.getByRole("button", { name: "수정본 만들기" }));
    expect(onCreateRevision).toHaveBeenCalledTimes(1);
  });

  it("renders pending undo in the recovery slot", () => {
    render(
      <HostMeetingWorkspace
        {...props}
        pendingUndo={{
          description: "출석을 바꿨습니다.",
          onUndo: vi.fn(),
          onOpenHistory: vi.fn(),
          onDismiss: vi.fn(),
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("출석을 바꿨습니다.");
    expect(screen.getByRole("button", { name: "되돌리기" })).toBeVisible();
  });
});
