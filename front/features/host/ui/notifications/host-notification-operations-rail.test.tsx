import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HostNotificationOperationsRail,
  type HostNotificationOperationsRailProps,
} from "./host-notification-operations-rail";

afterEach(cleanup);

const defaultProps: HostNotificationOperationsRailProps = {
  summary: { pending: 2, failed: 1, dead: 0, sentLast24h: 4 },
  policy: { sessionReminderEnabled: false, updatedAt: null },
  processableCount: 3,
  hasProcessableNotifications: true,
  processPending: false,
  isRefreshing: false,
  policyPending: false,
  policyError: null,
  policyLoadError: null,
  policyLoading: false,
  onProcess: vi.fn(),
  onPolicyChange: vi.fn().mockResolvedValue(undefined),
  onPolicyRetry: vi.fn().mockResolvedValue(undefined),
};

function renderRail(
  overrides: Partial<HostNotificationOperationsRailProps> = {},
) {
  return render(
    <HostNotificationOperationsRail {...defaultProps} {...overrides} />,
  );
}

describe("HostNotificationOperationsRail", () => {
  it("renders policy and four metrics as one operations rail", () => {
    renderRail();

    const rail = screen.getByRole("region", { name: "알림 운영 상태" });
    expect(within(rail).getByText("자동 리마인더")).toBeInTheDocument();
    expect(within(rail).getByText("모임 전날 · 기본 꺼짐")).toBeInTheDocument();
    expect(within(rail).getByText("대기")).toBeInTheDocument();
    expect(within(rail).getByText("실패")).toBeInTheDocument();
    expect(within(rail).getByText("중단")).toBeInTheDocument();
    expect(within(rail).getByText("최근 24시간")).toBeInTheDocument();
    expect(within(rail).queryByText(/opt-in|Asia\/Seoul/i)).not.toBeInTheDocument();
  });

  it("hides the process action when no notification can be processed", () => {
    renderRail({
      summary: { pending: 0, failed: 0, dead: 0, sentLast24h: 0 },
      processableCount: 0,
      hasProcessableNotifications: false,
    });

    expect(screen.queryByRole("button", { name: /처리/ })).not.toBeInTheDocument();
  });

  it("disables the policy control while saving is pending", () => {
    renderRail({ policyPending: true });

    expect(screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" })).toBeDisabled();
  });

  it("keeps the server-confirmed policy value when saving fails", async () => {
    const user = userEvent.setup();
    renderRail({ onPolicyChange: vi.fn().mockRejectedValue(new Error("save failed")) });

    const reminder = screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" });
    await user.click(reminder);

    expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
    expect(reminder).not.toBeChecked();
  });
});
