import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MeetingPhaseTabView } from "@/features/host/model/host-operating-room-model";
import { MeetingPhaseTabs, type MeetingPhaseTabLink } from "./meeting-phase-tabs";

const phases: readonly MeetingPhaseTabLink[] = [
  { id: "prep", label: "준비실", availability: "complete", blockedReason: null, href: "?phase=prep" },
  { id: "live", label: "현장", availability: "available", blockedReason: null, href: "?phase=live" },
  {
    id: "closing",
    label: "마감실",
    availability: "blocked",
    blockedReason: "모임을 마친 뒤 사용할 수 있습니다.",
    href: "?phase=closing",
  },
];

describe("MeetingPhaseTabs", () => {
  it("marks exactly one route-selected phase and keeps completed phases readable", () => {
    render(<MeetingPhaseTabs phases={phases} currentPhase="live" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);

    const current = screen.getByRole("tab", { name: /현장/ });
    expect(current).toHaveAttribute("href", "?phase=live");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveAttribute("aria-selected", "true");

    const complete = screen.getByRole("tab", { name: /준비실/ });
    expect(complete).toHaveAttribute("href", "?phase=prep");
    expect(complete).toHaveAccessibleName(/완료/);
    expect(complete).not.toHaveAttribute("aria-current");
  });

  it("keeps 현재·완료·잠김 state labels screen-reader-only", () => {
    render(<MeetingPhaseTabs phases={phases} currentPhase="live" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.filter((tab) => tab.getAttribute("aria-current") === "page")).toHaveLength(1);

    expect(screen.getByRole("tab", { name: /준비실/ }).querySelector(".rm-operating-room-phases__state")).toHaveClass("rm-sr-only");
    expect(screen.getByRole("tab", { name: /현장/ }).querySelector(".rm-operating-room-phases__state")).toHaveClass("rm-sr-only");
    expect(screen.getByRole("tab", { name: /마감실/ }).querySelector(".rm-operating-room-phases__state")).toHaveClass("rm-sr-only");
  });

  it("shows a blocked reason and does not expose a false destination", () => {
    render(<MeetingPhaseTabs phases={phases} currentPhase="live" />);

    const blocked = screen.getByRole("tab", { name: /마감실/ });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(blocked).not.toHaveAttribute("href");
    expect(blocked).toHaveAccessibleDescription("모임을 마친 뒤 사용할 수 있습니다.");
    expect(screen.getByText("모임을 마친 뒤 사용할 수 있습니다.")).toHaveClass("rm-operating-room-phases__reason");
  });

  it("preserves completion meaning when a completed phase is also current", () => {
    render(<MeetingPhaseTabs phases={phases} currentPhase="prep" />);

    const completedCurrent = screen.getByRole("tab", { name: /준비실/ });
    expect(completedCurrent).toHaveAccessibleName(/현재 · 완료/);
    expect(completedCurrent).toHaveAttribute("aria-current", "page");
  });

  it("reports link activation without deriving or mutating phase state", async () => {
    const onPhaseChange = vi.fn<(phase: MeetingPhaseTabView["id"]) => void>();
    render(
      <MeetingPhaseTabs
        phases={phases.map((phase) => ({ ...phase, href: `#${phase.id}` }))}
        currentPhase="live"
        onPhaseChange={onPhaseChange}
      />,
    );

    const phaseTab = screen.getByRole("tab", { name: /준비실/ });
    expect(fireEvent.click(phaseTab)).toBe(false);

    expect(onPhaseChange).toHaveBeenCalledOnce();
    expect(onPhaseChange).toHaveBeenCalledWith("prep");
    expect(screen.getByRole("tab", { name: /현장/ })).toHaveAttribute("aria-selected", "true");
  });

  it("uses roving focus and skips blocked phases with tab keys", async () => {
    const user = userEvent.setup();
    render(<MeetingPhaseTabs phases={phases} currentPhase="live" />);

    const prep = screen.getByRole("tab", { name: /준비실/ });
    const live = screen.getByRole("tab", { name: /현장/ });
    const closing = screen.getByRole("tab", { name: /마감실/ });

    expect(live).toHaveAttribute("tabindex", "0");
    expect(prep).toHaveAttribute("tabindex", "-1");
    expect(closing).not.toHaveAttribute("tabindex");

    live.focus();
    await user.keyboard("{ArrowRight}");
    expect(prep).toHaveFocus();

    await user.keyboard("{End}");
    expect(live).toHaveFocus();
  });
});
