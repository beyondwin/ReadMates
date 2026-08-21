import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceTrashTombstone } from "./workspace-trash-tombstone";

const trash = {
  sessionId: "session-7",
  sessionNumber: 7,
  title: "테스트 책",
  deletedAtLabel: "삭제 2026.08.21 19:00",
  remainingCopy: "남은 복원 기간 7일",
};

describe("WorkspaceTrashTombstone", () => {
  it("renders a heading, remaining-time description, and no tablist", () => {
    render(
      <WorkspaceTrashTombstone
        {...trash}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "테스트 책" })).toBeVisible();
    expect(screen.getByText("No.7")).toBeVisible();
    expect(screen.getByText("이 모임은 휴지통에 있습니다.")).toBeVisible();
    expect(screen.getByText("삭제 2026.08.21 19:00")).toBeVisible();
    expect(screen.getByText("남은 복원 기간 7일")).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "방금 삭제한 모임 복구" })).toHaveLength(2);
  });

  it("uses one visible primary restore control per media state and pads the sticky CTA", () => {
    const { container } = render(
      <WorkspaceTrashTombstone
        {...trash}
        onRestore={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "방금 삭제한 모임 복구" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveClass("rm-host-session-workspace__cta--desktop");
    expect(buttons[1]).toHaveClass("rm-host-session-workspace__cta--mobile");
    expect(container.querySelector(".rm-host-session-workspace")).toHaveClass(
      "rm-host-session-workspace",
    );
    expect(container.querySelector(".rm-host-session-workspace__sticky-cta")).toBeInTheDocument();
  });

  it("announces restore success and returns focus to the workspace heading", async () => {
    const user = userEvent.setup();
    function Harness() {
      const headingRef = useRef<HTMLHeadingElement>(null);
      const [restored, setRestored] = useState(false);
      return (
        <WorkspaceTrashTombstone
          {...trash}
          headingRef={headingRef}
          restoreSuccess={restored}
          onRestore={() => {
            setRestored(true);
            headingRef.current?.focus();
          }}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getAllByRole("button", { name: "방금 삭제한 모임 복구" })[0]!);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("모임을 복원했습니다.");
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "테스트 책" })).toHaveFocus();
    });
  });

  it("disables restore after expiry and keeps 다시 시도 for other errors", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <WorkspaceTrashTombstone
        {...trash}
        restoreDisabled
        restoreDisabledReason="복원 기간이 지났습니다."
        onRestore={vi.fn()}
      />,
    );

    for (const button of screen.getAllByRole("button", { name: "방금 삭제한 모임 복구" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("alert")).toHaveTextContent("복원 기간이 지났습니다.");
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();

    rerender(
      <WorkspaceTrashTombstone
        {...trash}
        restoreError="모임을 복원하지 못했습니다."
        onRestore={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("테스트 책")).toBeVisible();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("모임을 복원하지 못했습니다.");
    await user.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "방금 삭제한 모임 복구" })[0]).toBeEnabled();
  });

  it("shows the other OPEN session link and resolution condition on restore conflict", () => {
    render(
      <WorkspaceTrashTombstone
        {...trash}
        restoreConflict={{
          openSessionHref: "/app/host/sessions/open-session",
          message: "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 작성 중으로 되돌린 뒤 다시 시도하세요.",
        }}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByText(
      "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 작성 중으로 되돌린 뒤 다시 시도하세요.",
    )).toBeVisible();
    expect(screen.getByRole("link", { name: "진행 중인 모임 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/open-session",
    );
    expect(screen.getByText("테스트 책")).toBeVisible();
  });
});
