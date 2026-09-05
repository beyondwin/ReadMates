import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PreparationLedgerRowView } from "@/features/host/model/host-operating-room-model";
import { PreparationLedger } from "./preparation-ledger";

const rows: readonly PreparationLedgerRowView[] = [
  {
    id: "schedule-seen",
    label: "현재 일정 확인",
    state: "warning",
    value: "0 / 12",
    detail: "미열람 12 · 변경 전 확인 0",
    numerator: 0,
    denominator: 12,
    href: "/session-27?section=responses&scheduleSeen=unseen",
    workItemKey: "opaque/schedule",
    actionLabel: "멤버 보기",
  },
  {
    id: "rsvp",
    label: "참석 응답",
    state: "complete",
    value: "12 / 12",
    detail: "모든 참여자가 응답했습니다.",
    numerator: 12,
    denominator: 12,
    href: "/session-27?section=responses",
    workItemKey: null,
    actionLabel: "응답 보기",
  },
  {
    id: "questions",
    label: "발제 질문",
    state: "unavailable",
    value: "집계 준비 중",
    detail: "질문 집계를 다시 불러오세요.",
    numerator: null,
    denominator: null,
    href: "/session-27?section=responses&focus=questions",
    workItemKey: null,
    actionLabel: "질문 보기",
  },
  {
    id: "place",
    label: "장소 준비",
    state: "complete",
    value: "을지로 북살롱",
    detail: "모임 장소가 준비되었습니다.",
    numerator: null,
    denominator: null,
    href: "/session-27?section=basic&edit=1",
    workItemKey: null,
    actionLabel: "정보 보기",
  },
];

describe("PreparationLedger", () => {
  it("renders a continuous semantic ledger with route-owned drill-down destinations", () => {
    render(<PreparationLedger rows={rows} />);

    const region = screen.getByRole("region", { name: "준비 현황" });
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(4);

    for (const row of rows) {
      const item = within(region).getByRole("listitem", { name: row.label });
      expect(within(item).getByText(row.value)).toBeVisible();
      expect(within(item).getByText(row.detail)).toBeVisible();
      expect(within(item).getByRole("link", { name: `${row.label} ${row.actionLabel}` })).toHaveAttribute(
        "href",
        row.href,
      );
    }

    expect(region.querySelector("svg[data-icon='calendar']")).not.toBeNull();
    expect(region.querySelector("svg[data-icon='people']")).not.toBeNull();
    expect(region.querySelector("svg[data-icon='notes']")).not.toBeNull();
    expect(region.querySelector("svg[data-icon='pin']")).not.toBeNull();
    expect(items.map((item) => item.querySelector("[data-prep-index]")?.textContent)).toEqual([
      "01",
      "02",
      "03",
      "04",
    ]);
  });

  it("preserves zero as data and names row state without relying on color", () => {
    render(<PreparationLedger rows={rows} />);

    const schedule = screen.getByRole("listitem", { name: "현재 일정 확인" });
    expect(within(schedule).getByText("0 / 12")).toBeVisible();
    expect(within(schedule).queryByText("현재 일정 확인 0/12")).not.toBeInTheDocument();
    expect(within(schedule).getByText("확인 필요")).toHaveClass("rm-sr-only");

    const questions = screen.getByRole("listitem", { name: "발제 질문" });
    expect(within(questions).getByText("불러오지 못함")).toHaveClass("rm-sr-only");
  });

  it("preserves the distinct draft unavailable copy without replacing it with counts", () => {
    render(
      <PreparationLedger
        rows={[{
          ...rows[0],
          state: "unavailable",
          value: "아직 멤버에게 공개되지 않음",
          detail: "멤버 공개 뒤 집계가 시작됩니다.",
          numerator: null,
          denominator: null,
        }]}
      />,
    );

    expect(screen.getByText("아직 멤버에게 공개되지 않음")).toBeVisible();
    expect(screen.getByText("멤버 공개 뒤 집계가 시작됩니다.")).toBeVisible();
    expect(screen.queryByText(/0\/0/)).not.toBeInTheDocument();
  });

  it("offers retry only for unavailable rows and reports the exact row id", async () => {
    const onRetry = vi.fn<(rowId: PreparationLedgerRowView["id"]) => void>();
    const user = userEvent.setup();
    render(<PreparationLedger rows={rows} onRetry={onRetry} />);

    const retry = screen.getByRole("button", { name: "발제 질문 다시 불러오기" });
    await user.click(retry);

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith("questions");
    const schedule = screen.getByRole("listitem", { name: "현재 일정 확인" });
    expect(within(schedule).queryByRole("button", { name: "현재 일정 확인 다시 불러오기" })).not.toBeInTheDocument();
  });

  it("does not invent links or retry actions when their owner did not supply them", () => {
    render(<PreparationLedger rows={[{ ...rows[2], href: null }]} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders column head, specific action labels, and hides generic state words", () => {
    render(<PreparationLedger rows={rows} />);
    expect(screen.getByText("세부 내용")).toBeTruthy();
    expect(screen.getByRole("link", { name: "현재 일정 확인 멤버 보기" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /자세히 보기/ })).toBeNull();
    expect(screen.getByText("확인 필요")).toHaveClass("rm-sr-only");
  });
});
