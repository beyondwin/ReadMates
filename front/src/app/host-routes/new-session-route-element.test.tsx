import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/host/route/new-host-meeting-route", () => ({
  NewHostMeetingRoute: () => <div>dedicated new meeting route</div>,
}));

vi.mock("@/features/host/route/host-session-editor-route", () => ({
  NewHostSessionRoute: () => <div>legacy create editor</div>,
}));

vi.mock("@/src/app/host-route-invalidation", () => ({
  useSessionRecordsChangedInvalidation: () => vi.fn(),
}));

import { NewHostSessionRouteElement } from "./new-session-route-element";

describe("NewHostSessionRouteElement", () => {
  it("owns /sessions/new with the dedicated meeting route", () => {
    render(<NewHostSessionRouteElement />);

    expect(screen.getByText("dedicated new meeting route")).toBeInTheDocument();
    expect(screen.queryByText("legacy create editor")).not.toBeInTheDocument();
  });
});
