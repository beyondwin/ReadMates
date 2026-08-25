import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostMeetingWorkspaceRouteFrame } from "./host-meeting-workspace-route-frame";

describe("HostMeetingWorkspaceRouteFrame", () => {
  it("keeps base meeting work available when an independent panel fails", () => {
    const retry = vi.fn();
    render(
      <HostMeetingWorkspaceRouteFrame
        title="길어도 줄바꿈되는 모임 제목 📚"
        activeTask="history"
        baseContent={<button type="button">기본 정보 편집</button>}
        panel={{ kind: "unavailable", retry }}
      />,
    );

    expect(screen.getByRole("button", { name: "기본 정보 편집" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("변경 내역을 불러오지 못했습니다");
    expect(screen.queryByText("아직 변경 기록이 없습니다")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "변경 내역 다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows known-empty separately from unavailable", () => {
    render(
      <HostMeetingWorkspaceRouteFrame
        title="모임"
        activeTask="notifications"
        baseContent={<div>기본 작업</div>}
        panel={{ kind: "known-empty", data: null }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("아직 발송한 알림이 없습니다");
  });

  it("shows stale cached content and disables only its freshness-sensitive action", () => {
    const retry = vi.fn();
    render(
      <HostMeetingWorkspaceRouteFrame
        title="모임"
        activeTask="records"
        baseContent={<button type="button">출석 저장</button>}
        panel={{
          kind: "stale-cached",
          data: <button type="button" disabled>기록에 반영</button>,
          observedAt: "2026-08-25T01:02:03.000Z",
          retry,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "출석 저장" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "기록에 반영" })).toBeDisabled();
    expect(screen.getByText(/2026.*08.*25/)).toBeInTheDocument();
  });
});
