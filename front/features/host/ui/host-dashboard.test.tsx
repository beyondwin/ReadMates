import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import HostDashboard from "./host-dashboard";

type HostDashboardProps = Parameters<typeof HostDashboard>[0];

const dashboard = {
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
} satisfies HostDashboardProps["data"];

const hostSessions = {
  items: [],
  nextCursor: null,
} satisfies HostDashboardProps["hostSessions"];

const actions = {
  updateCurrentSessionParticipation: async () => undefined,
  updateSessionVisibility: async () => undefined,
  openSession: async () => undefined,
  loadHostSessions: async () => ({ items: [], nextCursor: null }),
} satisfies HostDashboardProps["actions"];

describe("HostDashboard", () => {
  it("renders headings without unnamed interactive elements", () => {
    const { container } = render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });
});
