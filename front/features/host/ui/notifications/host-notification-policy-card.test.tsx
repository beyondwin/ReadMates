import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostNotificationPolicyCard } from "./host-notification-policy-card";

afterEach(cleanup);

describe("HostNotificationPolicyCard", () => {
  it("keeps the server-confirmed value until a successful save is reflected by props", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <HostNotificationPolicyCard
        policy={{ sessionReminderEnabled: false, updatedAt: null }}
        onChange={onChange}
      />,
    );

    const reminder = screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" });
    expect(reminder).not.toBeChecked();
    expect(screen.getByText("기본은 꺼짐입니다.")).toBeInTheDocument();

    await user.click(reminder);

    expect(onChange).toHaveBeenCalledWith(true);
    expect(reminder).not.toBeChecked();

    rerender(
      <HostNotificationPolicyCard
        policy={{ sessionReminderEnabled: true, updatedAt: "2026-07-24T09:00:00Z" }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" })).toBeChecked();
  });

  it("keeps the confirmed policy value when saving fails", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockRejectedValue(new Error("save failed"));
    render(
      <HostNotificationPolicyCard
        policy={{ sessionReminderEnabled: false, updatedAt: null }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
    expect(screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" })).not.toBeChecked();
  });

  it("disables the policy control while a save is pending", () => {
    render(
      <HostNotificationPolicyCard
        policy={{ sessionReminderEnabled: true, updatedAt: "2026-07-24T09:00:00Z" }}
        pending
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" })).toBeDisabled();
    expect(screen.getByText("저장 중")).toBeInTheDocument();
  });
});
