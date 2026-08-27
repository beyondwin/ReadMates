import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminOperationStateActions } from "./admin-operation-state-actions";

function renderActions(overrides: Partial<React.ComponentProps<typeof AdminOperationStateActions>> = {}) {
  const props: React.ComponentProps<typeof AdminOperationStateActions> = {
    allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
    pending: false,
    message: null,
    now: () => new Date("2026-08-04T10:00:00.000Z"),
    onAcknowledge: vi.fn(),
    onSnooze: vi.fn(),
    onResolve: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<AdminOperationStateActions {...props} />) };
}

describe("AdminOperationStateActions", () => {
  it("emits the selected duration ISO and required hold reason", async () => {
    const user = userEvent.setup();
    const { props } = renderActions();

    await user.click(screen.getByRole("button", { name: "보류" }));
    expect(screen.getByRole("button", { name: "보류 확정" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "보류 기간" }), "1시간");
    await user.type(screen.getByLabelText("보류 사유"), "야간 관찰");
    await user.click(screen.getByRole("button", { name: "보류 확정" }));

    expect(props.onSnooze).toHaveBeenCalledOnce();
    expect(props.onSnooze).toHaveBeenCalledWith("2026-08-04T11:00:00.000Z", "야간 관찰");
  });

  it.each([
    ["닫기 버튼", async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "닫기" }))],
    ["Escape", async (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}")],
    ["backdrop", async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByTestId("resolve-backdrop"))],
  ])("does not resolve when the confirmation is dismissed by %s", async (_label, dismiss) => {
    const user = userEvent.setup();
    const { props } = renderActions();
    await user.click(screen.getByRole("button", { name: "해결 확인" }));
    expect(screen.getByRole("dialog", { name: "해결 상태 확인" })).toBeInTheDocument();

    await dismiss(user);

    expect(props.onResolve).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "해결 상태 확인" })).not.toBeInTheDocument();
  });

  it("submits resolve only through the explicit confirmation", async () => {
    const user = userEvent.setup();
    const { props } = renderActions();

    await user.click(screen.getByRole("button", { name: "해결 확인" }));
    await user.click(screen.getByRole("button", { name: "신호 재검증 후 해결" }));

    expect(props.onResolve).toHaveBeenCalledOnce();
  });

  it("opens the resolve confirm on the shared dialog with initial and restored focus", async () => {
    const user = userEvent.setup();
    const { props } = renderActions();
    const trigger = screen.getByRole("button", { name: "해결 확인" });

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "해결 상태 확인" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    expect(screen.getByTestId("resolve-backdrop")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");

    expect(props.onResolve).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("disables every lifecycle control while a mutation is pending", () => {
    renderActions({ pending: true });

    expect(screen.getByRole("button", { name: "확인 처리" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "보류" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "무시" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "해결 확인" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("상태를 반영하고 있습니다.");
  });

  it("disables controls without in-flight copy when locked and not pending", () => {
    renderActions({ pending: false, disabled: true });

    expect(screen.getByRole("button", { name: "확인 처리" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "보류" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "해결 확인" })).toBeDisabled();
    expect(screen.queryByText("상태를 반영하고 있습니다.")).not.toBeInTheDocument();
  });

  it("announces a refresh-required conflict", () => {
    renderActions({ message: { kind: "conflict", text: "다른 운영자가 먼저 상태를 변경했습니다." } });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "최신 상태를 다시 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요.",
    );
  });

  it("closes a stale resolve confirmation when the confirmation key changes", async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderActions({
      confirmationKey: "case-notification:3:ACKNOWLEDGE,SNOOZE,RESOLVE",
    });

    await user.click(screen.getByRole("button", { name: "해결 확인" }));
    expect(screen.getByRole("dialog", { name: "해결 상태 확인" })).toBeInTheDocument();

    rerender(
      <AdminOperationStateActions
        {...props}
        confirmationKey="case-notification:4:SNOOZE,RESOLVE"
      />,
    );

    expect(screen.queryByRole("dialog", { name: "해결 상태 확인" })).not.toBeInTheDocument();
    expect(props.onResolve).not.toHaveBeenCalled();
  });

  it("announces unknown-outcome without treating it as success", () => {
    renderActions({
      message: {
        kind: "unknown-outcome",
        text: "명령 응답을 확인하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("명령 응답을 확인하지 못했습니다.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
