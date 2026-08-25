import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HostMeetingWorkspace, type HostMeetingWorkspaceProps } from "./host-meeting-workspace";

const props: HostMeetingWorkspaceProps = {
  identity: {
    title: "길어도 온전히 읽히는 모임 제목 A deliberately long English meeting title",
    bookTitle: "경계에서 읽는 책",
    number: 12,
    lifecycle: "OPEN",
    statusLabel: "멤버와 준비 중",
    dateLabel: "2026.08.26 · 20:00",
    locationLabel: "온라인과 오프라인을 함께 설명하는 긴 장소",
  },
  tasks: [
    { task: "overview", label: "개요", href: "?section=overview" },
    { task: "attendance", label: "실제 출석", href: "?section=attendance", badge: "확인 필요" },
  ],
  activeTask: "overview",
  primaryAction: { kind: "FINISH_SESSION", label: "모임 마치기", disabled: false },
  panel: { kind: "ready", task: "overview", content: <div>현재 작업 내용</div> },
  judgment: {
    title: "실행 전 확인",
    summary: "멤버 쓰기를 닫고 기록 정리를 시작합니다.",
    checks: ["실제 출석 확인 전 1명", "알림은 자동으로 보내지 않음"],
    projections: [
      { audience: "호스트", result: "계속 편집 가능" },
      { audience: "게스트·멤버", result: "새 입력 중단" },
      { audience: "공개 기록", result: "게시 안 됨" },
    ],
  },
  announcements: [],
  LinkComponent: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  onTaskLinkActivated: vi.fn(),
  onPrimaryAction: vi.fn(),
  onRetryPanel: vi.fn(),
};

describe("HostMeetingWorkspace", () => {
  it("renders one h1, the active work surface, and an independent judgment rail", () => {
    render(<HostMeetingWorkspace {...props} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main", { name: "현재 모임 작업" })).toHaveTextContent("현재 작업 내용");
    const rail = screen.getByRole("complementary", { name: "실행 전 확인" });
    expect(rail).toHaveTextContent("호스트");
    expect(rail).toHaveTextContent("게스트·멤버");
    expect(rail).toHaveTextContent("공개 기록");
    expect(screen.getAllByRole("button", { name: "모임 마치기" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "모임 마치기" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it.each([
    ["loading", "모임 기록을 불러오는 중입니다"],
    ["known-empty", "아직 모임 기록이 없습니다"],
    ["unavailable", "모임 기록을 불러오지 못했습니다"],
  ] as const)("distinguishes the %s panel state", (kind, copy) => {
    const panel = kind === "unavailable"
      ? { kind, task: "records" as const }
      : kind === "known-empty"
        ? { kind, task: "records" as const, content: null }
        : { kind, task: "records" as const };
    render(<HostMeetingWorkspace {...props} activeTask="records" panel={panel} />);
    const region = screen.getByRole(kind === "unavailable" ? "alert" : "status");
    expect(region).toHaveTextContent(copy);
  });

  it("keeps stale content visible and limits only freshness-sensitive work", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<HostMeetingWorkspace {...props} activeTask="records" onRetryPanel={retry} panel={{
      kind: "stale-cached",
      task: "records",
      observedAt: "2026-08-25T01:02:03.000Z",
      content: <button type="button" disabled>기록에 반영</button>,
    }} />);

    expect(screen.getByRole("status")).toHaveTextContent("확인한 내용");
    expect(screen.getByRole("button", { name: "기록에 반영" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "최신 내용 확인" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("uses alert only for failures and status for informative announcements", () => {
    render(<HostMeetingWorkspace {...props} announcements={[
      { kind: "status", message: "초안을 저장했습니다." },
      { kind: "alert", message: "최신 버전과 충돌했습니다." },
    ]} />);
    expect(screen.getByRole("status")).toHaveTextContent("초안을 저장했습니다");
    expect(screen.getByRole("alert")).toHaveTextContent("최신 버전과 충돌했습니다");
    expect(within(screen.getByRole("main", { name: "현재 모임 작업" })).queryByRole("alert")).not.toBeInTheDocument();
  });
});
