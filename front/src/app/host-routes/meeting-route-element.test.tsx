import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@/features/host/route/host-session-editor-route", () => ({
  EditHostSessionRoute: () => <div>editor body</div>,
}));

vi.mock("@/features/host/route/host-meeting-ledger-route", () => ({
  HostMeetingLedgerRoute: ({ children }: { children: ReactNode }) => (
    <div>
      ledger chrome
      {children}
    </div>
  ),
}));

vi.mock("@/src/app/host-route-invalidation", () => ({
  useSessionRecordsChangedInvalidation: () => vi.fn(),
}));

vi.mock("@/src/app/route-continuity", () => ({
  hostDashboardReturnTarget: { href: "/app/host", label: "운영으로" },
  readmatesReturnState: () => ({ href: "/app/host", label: "운영으로" }),
  readReadmatesReturnTarget: () => ({ href: "/app/host", label: "운영으로" }),
}));

vi.mock("@/src/app/router-link", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

import { MeetingRouteElement } from "./meeting-route-element";

describe("MeetingRouteElement", () => {
  it("renders the session editor without the operating ledger chrome", () => {
    render(
      <MemoryRouter initialEntries={["/app/host/sessions/draft-1"]}>
        <Routes>
          <Route path="/app/host/sessions/:sessionId" element={<MeetingRouteElement />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("editor body")).toBeInTheDocument();
    expect(screen.queryByText("ledger chrome")).not.toBeInTheDocument();
  });
});
