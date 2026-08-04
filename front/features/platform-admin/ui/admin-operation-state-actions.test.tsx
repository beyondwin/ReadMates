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
  it("emits exact ISO snooze targets from the injected clock", async () => {
    const user = userEvent.setup();
    const { props } = renderActions();

    await user.click(screen.getByRole("button", { name: "1시간 보류" }));
    await user.click(screen.getByRole("button", { name: "4시간 보류" }));
    await user.click(screen.getByRole("button", { name: "24시간 보류" }));
    await user.click(screen.getByRole("button", { name: "7일 보류" }));

    expect(props.onSnooze).toHaveBeenNthCalledWith(1, "2026-08-04T11:00:00.000Z");
    expect(props.onSnooze).toHaveBeenNthCalledWith(2, "2026-08-04T14:00:00.000Z");
    expect(props.onSnooze).toHaveBeenNthCalledWith(3, "2026-08-05T10:00:00.000Z");
    expect(props.onSnooze).toHaveBeenNthCalledWith(4, "2026-08-11T10:00:00.000Z");
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

  it("disables every lifecycle control while a mutation is pending", () => {
    renderActions({ pending: true });

    expect(screen.getByRole("button", { name: "확인 처리" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1시간 보류" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "4시간 보류" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "24시간 보류" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "7일 보류" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "해결 확인" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("상태를 반영하고 있습니다.");
  });

  it("announces a refresh-required conflict", () => {
    renderActions({ message: { kind: "conflict", text: "다른 운영자가 먼저 상태를 변경했습니다." } });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "최신 상태를 다시 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요.",
    );
  });
});
