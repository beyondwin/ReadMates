import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DangerZone } from "./danger-zone";

function renderDangerZone() {
  return render(<DangerZone onLeaveMembership={vi.fn()} />);
}

describe("DangerZone", () => {
  it("exposes a stable relationship between the disclosure trigger and confirmation panel", async () => {
    const user = userEvent.setup();
    renderDangerZone();
    const trigger = screen.getByRole("button", { name: "클럽 탈퇴…" });
    const confirmationId = trigger.getAttribute("aria-controls");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(confirmationId).toBeTruthy();
    expect(document.getElementById(confirmationId!)).toBeNull();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(confirmationId!);
    expect(panel).toBeVisible();
    expect(panel).toHaveClass("rm-account-settings-page__termination-confirm");
    expect(screen.getByRole("button", { name: "클럽 탈퇴" })).toBeVisible();

    await user.click(trigger);
    await user.click(trigger);

    expect(document.getElementById(confirmationId!)).toBeVisible();
    expect(trigger).toHaveAttribute("aria-controls", confirmationId);
  });

  it("collapses the confirmation and returns focus to the trigger after cancel", async () => {
    const user = userEvent.setup();
    renderDangerZone();
    const trigger = screen.getByRole("button", { name: "클럽 탈퇴…" });
    const confirmationId = trigger.getAttribute("aria-controls");

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(confirmationId!)).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
