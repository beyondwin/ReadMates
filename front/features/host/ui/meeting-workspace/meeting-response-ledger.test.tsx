import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspacePendingUndo } from "@/features/host/ui/session-workspace/workspace-undo-bar";
import { MeetingResponseLedger, type MeetingResponseLedgerRow } from "./meeting-response-ledger";

const rows: MeetingResponseLedgerRow[] = [
  { membershipId: "a", displayName: "같은 이름", secondaryLabel: "A 독자", response: "GOING", attendance: "UNKNOWN", attendanceRevision: 1, questionCount: 2, recentResponseLabel: "오늘" },
  { membershipId: "b", displayName: "같은 이름", secondaryLabel: "B 독자", response: "NO_RESPONSE", attendance: "ABSENT", attendanceRevision: 1, questionCount: 0, recentResponseLabel: null, writeState: "conflict" },
];

const meetingDayRows: MeetingResponseLedgerRow[] = [
  { membershipId: "pending-1", displayName: "지후", secondaryLabel: "참여자 1", response: "GOING", attendance: "UNKNOWN", attendanceRevision: 1, questionCount: null, recentResponseLabel: null },
  { membershipId: "pending-2", displayName: "수민", secondaryLabel: "참여자 2", response: "UNSURE", attendance: "UNKNOWN", attendanceRevision: 1, questionCount: null, recentResponseLabel: null },
  { membershipId: "absent-1", displayName: "하준", secondaryLabel: "참여자 4", response: "NOT_GOING", attendance: "ABSENT", attendanceRevision: 1, questionCount: null, recentResponseLabel: null },
  { membershipId: "arrived-1", displayName: "서연", secondaryLabel: "참여자 3", response: "GOING", attendance: "ATTENDED", attendanceRevision: 2, questionCount: null, recentResponseLabel: null },
];

describe("MeetingResponseLedger", () => {
  it("keeps UNKNOWN first-class and exposes row conflict recovery without private identifiers", async () => {
    const user = userEvent.setup();
    const onAttendanceChange = vi.fn();
    render(<MeetingResponseLedger rows={rows} onAttendanceChange={onAttendanceChange} onBulkAttendanceChange={vi.fn()} />);

    expect(screen.getByRole("status", { name: "참석 응답 합계" })).toHaveTextContent("미응답 1");
    const firstRow = screen.getByRole("listitem", { name: "같은 이름 · A 독자" });
    expect(firstRow).toHaveTextContent("확인 전");
    await user.selectOptions(within(firstRow).getByLabelText("같은 이름 실제 출석"), "ATTENDED");
    expect(onAttendanceChange).toHaveBeenCalledWith("a", "ATTENDED");
    expect(screen.getByRole("alert")).toHaveTextContent("최신 출석 상태와 충돌");
    expect(document.body).not.toHaveTextContent("member@example.com");
  });

  it("searches and filters while preserving a labeled 500-row list", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 500 }, (_, index) => ({
      membershipId: `m-${index}`,
      displayName: `독자 ${index}`,
      secondaryLabel: `참여자 ${index + 1}`,
      response: index % 2 === 0 ? "GOING" as const : "NO_RESPONSE" as const,
      attendance: "UNKNOWN" as const,
      attendanceRevision: 1,
      questionCount: 0,
      recentResponseLabel: null,
    }));
    render(<MeetingResponseLedger rows={many} onAttendanceChange={vi.fn()} onBulkAttendanceChange={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(500);
    await user.type(screen.getByRole("searchbox", { name: "참여자 검색" }), "독자 499");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("독자 499")).toBeVisible();
  });

  it("confirms a bulk attendance target before writing and preserves selection on cancel", async () => {
    const user = userEvent.setup();
    const onBulkAttendanceChange = vi.fn();
    render(<MeetingResponseLedger rows={rows} onAttendanceChange={vi.fn()} onBulkAttendanceChange={onBulkAttendanceChange} />);

    const checkboxes = screen.getAllByRole("checkbox", { name: "같은 이름 선택" });
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    await user.click(screen.getByRole("button", { name: "출석으로 변경" }));

    expect(onBulkAttendanceChange).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "일괄 실제 출석 변경 확인" });
    expect(dialog).toHaveTextContent("2명");
    expect(dialog).toHaveTextContent("출석");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog", { name: "일괄 실제 출석 변경 확인" })).not.toBeInTheDocument();
    expect(screen.getByText("2명 선택")).toBeVisible();
    expect(onBulkAttendanceChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "출석으로 변경" }));
    await user.click(within(screen.getByRole("dialog", { name: "일괄 실제 출석 변경 확인" })).getByRole("button", { name: "2명을 출석으로 변경" }));
    expect(onBulkAttendanceChange).toHaveBeenCalledWith(["a", "b"], "ATTENDED");
  });

  it("meetingDay presentation keeps one-tap arrival while exposing all actual-attendance corrections, bulk, and undo", async () => {
    const user = userEvent.setup();
    const onAttendanceChange = vi.fn();
    const onBulkAttendanceChange = vi.fn();
    const pendingUndo: WorkspacePendingUndo = {
      description: "지후 출석을 기록했습니다.",
      onUndo: vi.fn(),
      onOpenHistory: vi.fn(),
      onDismiss: vi.fn(),
    };

    const { rerender } = render(
      <MeetingResponseLedger
        presentation="meetingDay"
        rows={meetingDayRows}
        onAttendanceChange={onAttendanceChange}
        onBulkAttendanceChange={onBulkAttendanceChange}
      />,
    );

    const segments = screen.getByRole("group", { name: "출석 필터" });
    expect(within(segments).getByRole("button", { name: "아직 안 옴 2" })).toHaveAttribute("aria-pressed", "true");
    expect(within(segments).getByRole("button", { name: "도착 1" })).toHaveAttribute("aria-pressed", "false");
    expect(within(segments).getByRole("button", { name: "전체 4" })).toHaveAttribute("aria-pressed", "false");

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const pendingAttendance = screen.getByLabelText("지후 실제 출석");
    expect(within(pendingAttendance).getByRole("option", { name: "확인 전" })).toBeInTheDocument();
    expect(within(pendingAttendance).getByRole("option", { name: "출석" })).toBeInTheDocument();
    expect(within(pendingAttendance).getByRole("option", { name: "불참" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /저장/ })).not.toBeInTheDocument();

    const pendingRow = screen.getByRole("button", { name: /지후/ });
    expect(pendingRow).toHaveClass("rm-meeting-response-ledger__checkin");
    await user.click(pendingRow);
    expect(onAttendanceChange).toHaveBeenCalledWith("pending-1", "ATTENDED");

    await user.selectOptions(pendingAttendance, "ABSENT");
    expect(onAttendanceChange).toHaveBeenCalledWith("pending-1", "ABSENT");

    await user.click(within(segments).getByRole("button", { name: "전체 4" }));
    await user.selectOptions(screen.getByLabelText("서연 실제 출석"), "UNKNOWN");
    expect(onAttendanceChange).toHaveBeenCalledWith("arrived-1", "UNKNOWN");

    await user.click(screen.getByRole("button", { name: "나머지 2명 모두 참석" }));
    expect(onBulkAttendanceChange).toHaveBeenCalledWith(["pending-1", "pending-2"], "ATTENDED");
    expect(onBulkAttendanceChange.mock.calls[0]?.[0]).not.toContain("absent-1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <MeetingResponseLedger
        presentation="meetingDay"
        rows={meetingDayRows}
        onAttendanceChange={onAttendanceChange}
        onBulkAttendanceChange={onBulkAttendanceChange}
        pendingUndo={pendingUndo}
      />,
    );
    expect(screen.getByRole("button", { name: "되돌리기" })).toBeVisible();
  });

  it("attendanceBoard paints a 3-button actual-attendance group with bulk, save, and undo copy", async () => {
    const user = userEvent.setup();
    const onAttendanceChange = vi.fn();
    const onBulkAttendanceChange = vi.fn();
    const pendingUndo: WorkspacePendingUndo = {
      description: "출석 8명 저장됨",
      onUndo: vi.fn(),
      onOpenHistory: vi.fn(),
      onDismiss: vi.fn(),
    };

    const { rerender } = render(
      <MeetingResponseLedger
        presentation="attendanceBoard"
        agendaHref="/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=agenda"
        rows={meetingDayRows}
        onAttendanceChange={onAttendanceChange}
        onBulkAttendanceChange={onBulkAttendanceChange}
      />,
    );

    expect(screen.getByRole("heading", { name: "출석 확인" })).toBeVisible();
    expect(screen.getByText("참석 응답과 실제 출석은 별개로 기록해요.")).toBeVisible();
    expect(screen.getByText("실제 출석 1 / 4 · 확인 필요 2")).toBeVisible();
    expect(screen.getByRole("link", { name: "진행 순서 보기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=agenda",
    );
    expect(screen.getAllByText("참석 응답").length).toBeGreaterThan(0);
    expect(screen.getByText("미정 응답")).toBeVisible();
    expect(screen.getByText("불참 응답")).toBeVisible();
    expect(screen.queryByRole("group", { name: "출석 필터" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    const pendingGroup = screen.getByRole("group", { name: "지후 실제 출석" });
    expect(within(pendingGroup).getByRole("button", { name: "지후 참석" })).toHaveAttribute("aria-pressed", "false");
    expect(within(pendingGroup).getByRole("button", { name: "지후 불참" })).toHaveAttribute("aria-pressed", "false");
    expect(within(pendingGroup).getByRole("button", { name: "지후 미확인" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(pendingGroup).getByRole("button", { name: "지후 참석" }));
    expect(onAttendanceChange).toHaveBeenCalledWith("pending-1", "ATTENDED");
    await user.click(within(pendingGroup).getByRole("button", { name: "지후 불참" }));
    expect(onAttendanceChange).toHaveBeenCalledWith("pending-1", "ABSENT");

    const arrivedGroup = screen.getByRole("group", { name: "서연 실제 출석" });
    expect(within(arrivedGroup).getByRole("button", { name: "서연 참석" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(arrivedGroup).getByRole("button", { name: "서연 참석" }));
    expect(onAttendanceChange).not.toHaveBeenCalledWith("arrived-1", "ATTENDED");

    await user.click(screen.getByRole("button", { name: "나머지 2명 모두 참석으로 표시" }));
    expect(onBulkAttendanceChange).toHaveBeenCalledWith(["pending-1", "pending-2"], "ATTENDED");
    expect(onBulkAttendanceChange.mock.calls[0]?.[0]).not.toContain("absent-1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("선택하면 바로 저장돼요.")).toBeVisible();

    rerender(
      <MeetingResponseLedger
        presentation="attendanceBoard"
        rows={meetingDayRows}
        onAttendanceChange={onAttendanceChange}
        onBulkAttendanceChange={onBulkAttendanceChange}
        pendingUndo={pendingUndo}
      />,
    );
    expect(screen.getByText("출석 8명 저장됨")).toBeVisible();
    expect(screen.getByRole("button", { name: "실행 취소" })).toBeVisible();
  });
});
