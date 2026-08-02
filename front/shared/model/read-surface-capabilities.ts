export type ReadSurfaceCapabilities = Readonly<{
  canWrite: boolean;
  canReadFeedback: boolean;
  canViewPersonalState: boolean;
}>;

export const GUEST_READ_SURFACE_CAPABILITIES: ReadSurfaceCapabilities = Object.freeze({
  canWrite: false,
  canReadFeedback: false,
  canViewPersonalState: false,
});

export const VIEWER_READ_SURFACE_CAPABILITIES: ReadSurfaceCapabilities = Object.freeze({
  canWrite: false,
  canReadFeedback: false,
  canViewPersonalState: true,
});

export const MEMBER_READ_SURFACE_CAPABILITIES: ReadSurfaceCapabilities = Object.freeze({
  canWrite: true,
  canReadFeedback: true,
  canViewPersonalState: true,
});

export function readSurfaceCapabilitiesForAuth(auth: {
  membershipStatus: string | null;
  approvalState: string | null;
}): ReadSurfaceCapabilities {
  if (auth.membershipStatus === "ACTIVE" && auth.approvalState === "ACTIVE") {
    return MEMBER_READ_SURFACE_CAPABILITIES;
  }
  if (auth.membershipStatus === "VIEWER") {
    return VIEWER_READ_SURFACE_CAPABILITIES;
  }
  return Object.freeze({ canWrite: false, canReadFeedback: false, canViewPersonalState: true });
}
