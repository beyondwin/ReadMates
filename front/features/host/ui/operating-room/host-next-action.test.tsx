import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostNextActionView } from "@/features/host/model/host-operating-room-model";
import { HostNextAction } from "./host-next-action";

const actionable: HostNextActionView = {
  kind: "schedule-seen",
  state: "actionable",
  workItemKey: "server/opaque:key:with exact bytes",
  label: "일정 미확인 멤버 검토",
  reason: "미열람 3 · 변경 전 확인 1",
  href: "/clubs/reading-sai/app/host/sessions/session-27?section=responses&scheduleSeen=unseen",
};

describe("HostNextAction", () => {
  it("renders one primary destination, a visible reason, and color-independent state text", () => {
    render(<HostNextAction action={actionable} />);

    const region = screen.getByRole("region", { name: "다음에 할 일" });
    expect(screen.getByText("지금 처리")).toBeVisible();
    expect(screen.getByText("미열람 3 · 변경 전 확인 1")).toBeVisible();
    const primary = screen.getByRole("link", { name: "일정 미확인 멤버 검토" });
    expect(primary).toHaveAttribute("href", actionable.href);
    expect(region.querySelectorAll(".rm-operating-room-next-action__primary")).toHaveLength(1);
  });

  it("passes the authoritative opaque work item key unchanged when deferring", async () => {
    const onDefer = vi.fn<(workItemKey: string) => void>();
    const user = userEvent.setup();
    render(<HostNextAction action={actionable} onDefer={onDefer} />);

    await user.click(screen.getByRole("button", { name: "내일 09:00까지 보류" }));

    expect(onDefer).toHaveBeenCalledOnce();
    expect(onDefer).toHaveBeenCalledWith("server/opaque:key:with exact bytes");
  });

  it("disables the exact defer action while its authoritative key is pending", () => {
    render(<HostNextAction action={actionable} onDefer={vi.fn()} pending />);

    expect(screen.getByRole("button", { name: "보류 중" })).toBeDisabled();
  });

  it("does not offer deferral without both server authority and a callback", () => {
    const { rerender } = render(
      <HostNextAction action={{ ...actionable, workItemKey: null }} onDefer={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /보류/ })).not.toBeInTheDocument();

    rerender(<HostNextAction action={actionable} />);
    expect(screen.queryByRole("button", { name: /보류/ })).not.toBeInTheDocument();
  });

  it.each([
    ["conflict", "최신 상태와 비교 필요"],
    ["unknown", "처리 결과 확인 필요"],
  ] as const)("keeps a %s action visible and recoverable", (state, stateLabel) => {
    render(<HostNextAction action={{ ...actionable, state, workItemKey: null }} />);

    expect(screen.getByText(stateLabel)).toBeVisible();
    expect(screen.getByRole("link", { name: actionable.label })).toHaveAttribute("href", actionable.href);
    expect(screen.getByText(actionable.reason)).toBeVisible();
  });

  it("shows a deferred action as one resumable primary without another defer control", () => {
    render(<HostNextAction action={{ ...actionable, state: "deferred" }} onDefer={vi.fn()} />);

    expect(screen.getByText("보류됨 · 이어서 처리 가능")).toBeVisible();
    expect(screen.getByRole("link", { name: `이어서 ${actionable.label}` })).toHaveAttribute(
      "href",
      actionable.href,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /보류/ })).not.toBeInTheDocument();
  });

  it("uses ctaLabel for the primary control and keeps label as the status sentence", () => {
    render(
      <HostNextAction
        action={{
          ...actionable,
          label: "최신 일정을 아직 보지 않은 4명이 있어요",
          ctaLabel: "대상과 문구 검토",
        }}
      />,
    );
    expect(screen.getByText("최신 일정을 아직 보지 않은 4명이 있어요")).toBeVisible();
    expect(screen.getByRole("link", { name: "대상과 문구 검토" })).toBeVisible();
  });

  it("does not invent an action destination for none or a missing href", () => {
    const { rerender } = render(
      <HostNextAction
        action={{
          kind: "none",
          state: "none",
          workItemKey: null,
          label: "지금 필요한 조치 없음",
          reason: "현재 모임의 필수 준비가 확인되었습니다.",
          href: "/must-not-become-a-false-action",
        }}
      />,
    );

    expect(screen.getByText("준비 확인 완료")).toBeVisible();
    expect(screen.getByText("현재 모임의 필수 준비가 확인되었습니다.")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    rerender(<HostNextAction action={{ ...actionable, href: null }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
