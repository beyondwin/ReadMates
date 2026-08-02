import { describe, expect, it } from "vitest";

import {
  GUEST_READ_SURFACE_CAPABILITIES,
  MEMBER_READ_SURFACE_CAPABILITIES,
  readSurfaceCapabilitiesForAuth,
  VIEWER_READ_SURFACE_CAPABILITIES,
} from "./read-surface-capabilities";

describe("read surface capabilities", () => {
  it("keeps guest and viewer controls visible but non-writable and feedback-locked", () => {
    expect(GUEST_READ_SURFACE_CAPABILITIES).toEqual({
      canWrite: false,
      canReadFeedback: false,
      canViewPersonalState: false,
    });
    expect(VIEWER_READ_SURFACE_CAPABILITIES).toEqual({
      canWrite: false,
      canReadFeedback: false,
      canViewPersonalState: true,
    });
  });

  it("keeps active member writing and feedback capability available", () => {
    expect(MEMBER_READ_SURFACE_CAPABILITIES).toEqual({
      canWrite: true,
      canReadFeedback: true,
      canViewPersonalState: true,
    });
  });

  it("derives protected viewer and suspended access without upgrading either audience", () => {
    expect(readSurfaceCapabilitiesForAuth({ membershipStatus: "VIEWER", approvalState: "VIEWER" })).toEqual(
      VIEWER_READ_SURFACE_CAPABILITIES,
    );
    expect(readSurfaceCapabilitiesForAuth({ membershipStatus: "SUSPENDED", approvalState: "SUSPENDED" })).toEqual({
      canWrite: false,
      canReadFeedback: false,
      canViewPersonalState: true,
    });
  });
});
