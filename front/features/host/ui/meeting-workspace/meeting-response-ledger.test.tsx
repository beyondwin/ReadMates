import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MeetingResponseLedger } from "./meeting-response-ledger";

const rows = [
  { membershipId: "a", displayName: "같은 이름", secondaryLabel: "A 독자", response: "GOING" as const, attendance: "UNKNOWN" as const, attendanceRevision: 1, questionCount: 2, recentResponseLabel: "오늘" },
  { membershipId: "b", displayName: "같은 이름", secondaryLabel: "B 독자", response: "NO_RESPONSE" as const, attendance: "ABSENT" as const, attendanceRevision: 1, questionCount: 0, recentResponseLabel: null, writeState: "conflict" as const },
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
});
