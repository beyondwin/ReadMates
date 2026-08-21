import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  buildHostSessionWorkspace,
  type HostSessionWorkspaceInput,
  type HostSessionWorkspaceLocation,
  type HostSessionWorkspaceView,
} from "@/features/host/model/host-session-workspace-model";
import {
  HostSessionWorkspace,
  type HostSessionWorkspaceProps,
} from "./host-session-workspace";

const today = "2026-08-21";

const baseInput = {
  meetingDate: "2026-08-28",
  today,
  unknownAttendanceCount: 0,
  hasRecordDraft: false,
  recordDraftStale: false,
  recordValidationIssueCount: 0,
  hasAppliedRecord: false,
  publicationReady: false,
} satisfies Omit<HostSessionWorkspaceInput, "state">;

function viewFor(input: HostSessionWorkspaceInput): HostSessionWorkspaceView {
  return buildHostSessionWorkspace(input);
}

function WorkspaceHarness({
  view,
  initialLocation = { panel: "focus", source: "manual" },
  onLocationChange,
  onPrimaryAction = vi.fn(),
  ...props
}: Partial<Omit<HostSessionWorkspaceProps, "view" | "header" | "location" | "onLocationChange">> & {
  view: HostSessionWorkspaceView;
  initialLocation?: HostSessionWorkspaceLocation;
  onLocationChange?: (next: HostSessionWorkspaceLocation) => void;
}) {
  const [location, setLocation] = useState<HostSessionWorkspaceLocation>(initialLocation);
  return (
    <HostSessionWorkspace
      view={view}
      header={{
        returnHref: "/app/host",
        returnLabel: "운영으로",
        sessionNumber: 7,
        title: "테스트 책",
        date: "2026-08-21",
        time: "20:00",
        location: "온라인",
      }}
      onPrimaryAction={onPrimaryAction}
      basicPanel={<p>기본 정보 편집</p>}
      attendancePanel={<p>출석 편집</p>}
      recordsPanel={<p>기록 편집</p>}
      historyPanel={<p>변경 내역 목록</p>}
      {...props}
      location={location}
      onLocationChange={(next) => {
        setLocation(next);
        onLocationChange?.(next);
      }}
    />
  );
}

describe("HostSessionWorkspace", () => {
  it("renders the DRAFT focus deck with a duplicated primary action and no page tabs", () => {
    const onPrimaryAction = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "DRAFT" })}
        onPrimaryAction={onPrimaryAction}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "테스트 책" })).toBeVisible();
    expect(screen.getByText("No.7")).toBeVisible();
    expect(screen.getByText("모임 작성 중")).toBeVisible();
    expect(screen.queryByText("멤버와 준비 중")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "멤버와 준비 시작" })).toHaveLength(2);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모임 정보" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "변경 내역" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("list", { name: "진행 상황" })).toBeVisible();
  });

  it("reviews member input while OPEN before the meeting date", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({
          ...baseInput,
          state: "OPEN",
          meetingDate: "2026-08-28",
          today: "2026-08-21",
        })}
        onPrimaryAction={onPrimaryAction}
      />,
    );

    expect(screen.getByText("멤버와 준비 중")).toBeVisible();
    const buttons = screen.getAllByRole("button", { name: "멤버 응답 확인하기" });
    expect(buttons).toHaveLength(2);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await user.click(buttons[0]!);
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it("prioritizes attendance on meeting day without page tabs", async () => {
    const user = userEvent.setup();
    const onLocationChange = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({
          ...baseInput,
          state: "OPEN",
          meetingDate: "2026-08-21",
          today: "2026-08-21",
          unknownAttendanceCount: 2,
        })}
        onLocationChange={onLocationChange}
      />,
    );

    expect(screen.getByText("멤버와 준비 중")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "출석 확인하기" })).toHaveLength(2);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("listitem", { name: /출석/ })).getByRole("button"));
    expect(onLocationChange).toHaveBeenCalledWith({ panel: "attendance", source: "manual" });
    expect(screen.getByText("출석 편집")).toBeVisible();
  });

  it("shows CLOSED import-first with duplicated 정리본 올리기 and no page tabs", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "CLOSED" })}
        onPrimaryAction={onPrimaryAction}
      />,
    );

    expect(screen.getByText("기록 정리 중")).toBeVisible();
    const buttons = screen.getAllByRole("button", { name: "정리본 올리기" });
    expect(buttons).toHaveLength(2);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await user.click(buttons[1]!);
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it("shows CLOSED-ready publish as the duplicated primary action", () => {
    render(
      <WorkspaceHarness
        view={viewFor({
          ...baseInput,
          state: "CLOSED",
          hasRecordDraft: true,
          hasAppliedRecord: true,
          publicationReady: true,
        })}
      />,
    );

    expect(screen.getByText("기록 정리 중")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "기록 공개" })).toHaveLength(2);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("disables publish with a one-line reason when publication is blocked", () => {
    render(
      <WorkspaceHarness
        view={viewFor({
          ...baseInput,
          state: "CLOSED",
          hasRecordDraft: true,
          hasAppliedRecord: true,
          publicationReady: false,
        })}
        primaryActionDisabled
        primaryActionReason="공개 조건을 먼저 확인해 주세요."
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "기록 공개" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    expect(screen.getByText("공개 조건을 먼저 확인해 주세요.")).toBeVisible();
  });

  it("shows PUBLISHED public-result controls without unpublishing", async () => {
    const user = userEvent.setup();
    const onCreateRevision = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({
          ...baseInput,
          state: "PUBLISHED",
          hasRecordDraft: true,
          hasAppliedRecord: true,
          publicationReady: true,
        })}
        publicRecordHref="/app/sessions/session-7"
        onCreateRevision={onCreateRevision}
      />,
    );

    expect(screen.getByText("공개 완료")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "공개 기록 보기" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "수정본 만들기" })).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "수정본 만들기" }));
    expect(onCreateRevision).toHaveBeenCalledTimes(1);
  });

  it("opens 모임 정보 as a disclosure panel rather than a tab", async () => {
    const user = userEvent.setup();
    render(<WorkspaceHarness view={viewFor({ ...baseInput, state: "DRAFT" })} />);

    const info = screen.getByRole("button", { name: "모임 정보" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(info).toHaveAttribute("aria-controls", "workspace-panel-basic");
    await user.click(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("기본 정보 편집")).toBeVisible();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "모임 정보" })).toBeVisible();
  });

  it("opens 변경 내역 as a disclosure panel rather than a tab", async () => {
    const user = userEvent.setup();
    render(<WorkspaceHarness view={viewFor({ ...baseInput, state: "OPEN" })} />);

    const history = screen.getByRole("button", { name: "변경 내역" });
    expect(history).toHaveAttribute("aria-expanded", "false");
    await user.click(history);
    expect(history).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("변경 내역 목록")).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("keeps an error inside the focus card with retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "DRAFT" })}
        error={{ message: "요청을 처리하지 못했습니다.", onRetry }}
      />,
    );

    const focus = screen.getByRole("region", { name: "지금 할 일" });
    const alert = within(focus).getByRole("alert");
    expect(alert).toHaveTextContent("요청을 처리하지 못했습니다.");
    await user.click(within(focus).getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("wires desktop and mobile primary buttons to the same handler and disabled state", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    const { rerender } = render(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "CLOSED" })}
        onPrimaryAction={onPrimaryAction}
      />,
    );

    const [desktop, mobile] = screen.getAllByRole("button", { name: "정리본 올리기" });
    expect(desktop).toHaveClass("rm-host-session-workspace__cta--desktop");
    expect(mobile).toHaveClass("rm-host-session-workspace__cta--mobile");
    await user.click(desktop!);
    await user.click(mobile!);
    expect(onPrimaryAction).toHaveBeenCalledTimes(2);

    rerender(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "CLOSED" })}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled
      />,
    );
    const disabled = screen.getAllByRole("button", { name: "정리본 올리기" });
    expect(disabled[0]).toBeDisabled();
    expect(disabled[1]).toBeDisabled();
  });

  it("renders the undo bar as a status region when a pending undo exists", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onOpenHistory = vi.fn();
    const onDismiss = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "OPEN" })}
        pendingUndo={{
          description: "출석을 바꿨습니다.",
          onUndo,
          onOpenHistory,
          onDismiss,
        }}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("출석을 바꿨습니다.");
    await user.click(within(status).getByRole("button", { name: "되돌리기" }));
    await user.click(within(status).getByRole("button", { name: "변경 내역" }));
    await user.click(within(status).getByRole("button", { name: "닫기" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render an undo bar when pendingUndo is null", () => {
    render(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "DRAFT" })}
        pendingUndo={null}
      />,
    );
    expect(screen.queryByRole("button", { name: "되돌리기" })).not.toBeInTheDocument();
  });

  it("keeps the undo bar with an inline explanation and a 변경 내역 action", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "OPEN" })}
        pendingUndo={{
          description: "모임 정보를 저장했습니다.",
          error: "그 사이 다른 변경이 있습니다. 변경 내역에서 다시 확인하세요.",
          onUndo: vi.fn(),
          onOpenHistory,
          onDismiss: vi.fn(),
        }}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("모임 정보를 저장했습니다.");
    expect(screen.getByRole("alert")).toHaveTextContent("그 사이 다른 변경이 있습니다");
    await user.click(within(status).getByRole("button", { name: "변경 내역" }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "되돌리기" })).toBeVisible();
  });

  it("confirms a restore preview, redacts sensitive values, and restores trigger focus", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    function UndoConfirmHarness() {
      const [confirm, setConfirm] = useState<HostSessionWorkspaceProps["undoConfirm"]>({
        items: [
          { label: "세션 제목", currentValue: "새 제목", targetValue: "이전 제목", sensitive: false },
          { label: "미팅 URL", currentValue: null, targetValue: null, sensitive: true },
        ],
        submitting: false,
        onConfirm,
        onCancel: () => setConfirm(null),
      });
      return (
        <WorkspaceHarness
          view={viewFor({ ...baseInput, state: "OPEN" })}
          pendingUndo={{
            description: "모임 정보를 저장했습니다.",
            onUndo: vi.fn(),
            onOpenHistory: vi.fn(),
            onDismiss: vi.fn(),
          }}
          undoConfirm={confirm}
        />
      );
    }
    render(<UndoConfirmHarness />);

    const trigger = within(screen.getByRole("status")).getByRole("button", { name: "되돌리기" });
    const dialog = screen.getByRole("dialog", { name: "이 변경을 되돌릴까요?" });
    expect(dialog).toHaveTextContent("세션 제목: 새 제목 → 이전 제목");
    expect(dialog).toHaveTextContent("미팅 URL: 미리보기에 표시하지 않습니다");
    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "이 변경을 되돌릴까요?" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("pins the overlay sheet as a bottom sheet and the mobile CTA as a footer", async () => {
    const user = userEvent.setup();
    render(<WorkspaceHarness view={viewFor({ ...baseInput, state: "OPEN" })} />);

    await user.click(screen.getByRole("button", { name: "변경 내역" }));
    const sheet = screen.getByRole("dialog", { name: "변경 내역" });
    expect(sheet).toHaveClass("rm-host-session-workspace__sheet");
    expect(sheet).toHaveClass("rm-host-session-workspace__sheet--bottom");
    expect(document.querySelector(".rm-host-session-workspace__sticky-cta"))
      .toHaveClass("rm-host-session-workspace__footer-cta");
  });

  it("closes 변경 내역 on Escape and restores trigger focus as Back would", async () => {
    const user = userEvent.setup();
    const onLocationChange = vi.fn();
    render(
      <WorkspaceHarness
        view={viewFor({ ...baseInput, state: "OPEN" })}
        onLocationChange={onLocationChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "변경 내역" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "변경 내역" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(onLocationChange).toHaveBeenCalledWith({ panel: "focus", source: "manual" });
    expect(screen.queryByRole("dialog", { name: "변경 내역" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
