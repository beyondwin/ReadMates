import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminOperationStateActions } from "./admin-operation-state-actions";

const adminOperationActionLanguage = vi.hoisted(() => vi.fn((action: string) => ({
  primaryText: `canonical:${action}`,
  technicalDisclosure: null,
})));

vi.mock("@/features/platform-admin/model/admin-status-language", () => ({
  adminOperationActionLanguage,
}));

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
  it("shows only the server lifecycle actions and submits the selected snooze time without collecting a reason", async () => {
    const user = userEvent.setup();
    const { props } = renderActions();

    expect(screen.getByRole("button", { name: "canonical:ACKNOWLEDGE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "canonical:SNOOZE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "canonical:RESOLVE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "canonical:ACKNOWLEDGE" })).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("button", { name: "무시" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "병합" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "canonical:SNOOZE" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "미룰 시간" }), "1시간");
    await user.click(screen.getByRole("button", { name: "미루기" }));

    expect(props.onSnooze).toHaveBeenCalledOnce();
    expect(props.onSnooze).toHaveBeenCalledWith("2026-08-04T11:00:00.000Z");
  });

  it.each([
    ["닫기 버튼", async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "닫기" }))],
    ["Escape", async (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}")],
    ["backdrop", async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByTestId("resolve-backdrop"))],
  ])("does not resolve when the confirmation is dismissed by %s", async (_label, dismiss) => {
    const user = userEvent.setup();
    const { props } = renderActions();
    await user.click(screen.getByRole("button", { name: "canonical:RESOLVE" }));
    expect(screen.getByRole("dialog", { name: "해결 상태 확인" })).toBeInTheDocument();

    await dismiss(user);

    expect(props.onResolve).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "해결 상태 확인" })).not.toBeInTheDocument();
  });

  it("submits resolve only through the explicit confirmation", async () => {
    const user = userEvent.setup();
    const { props } = renderActions();

    await user.click(screen.getByRole("button", { name: "canonical:RESOLVE" }));
    await user.click(screen.getByRole("button", { name: "신호 재검증 후 해결" }));

    expect(props.onResolve).toHaveBeenCalledOnce();
  });

  it("opens the resolve confirm on the shared dialog with initial and restored focus", async () => {
    const user = userEvent.setup();
    const { props } = renderActions();
    const trigger = screen.getByRole("button", { name: "canonical:RESOLVE" });

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

    expect(screen.getByRole("button", { name: "canonical:ACKNOWLEDGE" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "canonical:SNOOZE" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "canonical:RESOLVE" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "무시" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("상태를 반영하고 있습니다.");
  });

  it("disables controls without in-flight copy when locked and not pending", () => {
    renderActions({ pending: false, disabled: true });

    expect(screen.getByRole("button", { name: "canonical:ACKNOWLEDGE" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "canonical:SNOOZE" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "canonical:RESOLVE" })).toBeDisabled();
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

    await user.click(screen.getByRole("button", { name: "canonical:RESOLVE" }));
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

  it("keeps the server action as the accessible name when mockup visual copy differs", () => {
    renderActions({
      actionCopy: {
        ACKNOWLEDGE: "다시 보내기 검토",
        SNOOZE: "30분 뒤 다시 보기",
        RESOLVE: "자세히 보기",
      },
    });

    const acknowledge = screen.getByRole("button", { name: "canonical:ACKNOWLEDGE" });
    const snooze = screen.getByRole("button", { name: "canonical:SNOOZE" });
    const resolve = screen.getByRole("button", { name: "canonical:RESOLVE" });

    expect(acknowledge).toHaveTextContent("다시 보내기 검토");
    expect(snooze).toHaveTextContent("30분 뒤 다시 보기");
    expect(resolve).toHaveTextContent("자세히 보기");
    expect(acknowledge.getAttribute("aria-label")).toBe("canonical:ACKNOWLEDGE");
    expect(acknowledge.getAttribute("aria-label")).not.toContain("·");
    expect(acknowledge).toHaveAttribute("aria-describedby");
    expect(snooze).toHaveAttribute("aria-describedby");
    expect(resolve).toHaveAttribute("aria-describedby");
    expect(document.getElementById(acknowledge.getAttribute("aria-describedby") ?? "")).toHaveTextContent("다시 보내기 검토");
    expect(screen.queryByRole("button", { name: "다시 보내기 검토" })).not.toBeInTheDocument();
  });
});
