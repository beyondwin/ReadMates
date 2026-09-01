import { describe, expect, it } from "vitest";
import { ReadmatesApiError, ReadmatesTransportError } from "@/shared/api/errors";
import {
  hostCloseConfirmErrorDisposition,
  hostCoHostErrorDisposition,
  hostInvitationLinkUpdateErrorDisposition,
  hostSettingsUpdateErrorDisposition,
} from "./host-settings-recovery";

function apiError(code: string, status: number, fallback = false) {
  return new ReadmatesApiError(
    {
      code,
      status,
      message: "요청한 작업을 처리하지 못했습니다.",
      fallback,
    },
    new Response(null, { status }),
  );
}

describe("host settings recovery disposition", () => {
  it.each([
    ["HOST_CLUB_CLOSE_PREVIEW_EXPIRED", 409],
    ["HOST_CLUB_CLOSE_PREVIEW_MISMATCH", 409],
    ["HOST_CLUB_CLOSE_PREVIEW_NOT_FOUND", 404],
    ["HOST_CLUB_CLOSE_PREVIEW_CONSUMED", 409],
    ["HOST_SETTINGS_STALE", 409],
    ["HOST_CLUB_SETTINGS_NOT_FOUND", 404],
  ])("classifies close API code %s as a non-current preview without reading its message", (code, status) => {
    expect(hostCloseConfirmErrorDisposition(apiError(code, status))).toBe("non-current");
  });

  it("uses fallback status for a non-current close response and preserves only transport uncertainty", () => {
    expect(hostCloseConfirmErrorDisposition(apiError("CONFLICT", 409, true))).toBe("non-current");
    expect(hostCloseConfirmErrorDisposition(apiError("INVALID_REQUEST", 400))).toBe("rejected");
    expect(hostCloseConfirmErrorDisposition(new ReadmatesTransportError())).toBe("unknown");
    expect(hostCloseConfirmErrorDisposition(new Error("unexpected"))).toBe("rejected");
  });

  it.each([
    [apiError("HOST_SETTINGS_STALE", 409), "stale"],
    [apiError("LAST_ACTIVE_HOST_REQUIRED", 409), "permission"],
    [apiError("PERMISSION_DENIED", 403), "permission"],
    [apiError("UNKNOWN_FORBIDDEN", 403), "permission"],
    [apiError("INVALID_REQUEST", 400), "rejected"],
    [new ReadmatesTransportError(), "unknown"],
    [new Error("unexpected"), "rejected"],
  ])("classifies a co-host failure from code/status as %s", (error, expected) => {
    expect(hostCoHostErrorDisposition(error)).toBe(expected);
  });

  it("classifies settings stale only from the structured server code or fallback 409", () => {
    expect(hostSettingsUpdateErrorDisposition(apiError("HOST_SETTINGS_STALE", 409))).toBe("stale");
    expect(hostSettingsUpdateErrorDisposition(apiError("CONFLICT", 409, true))).toBe("stale");
    expect(hostSettingsUpdateErrorDisposition(apiError("INVALID_REQUEST", 400))).toBe("rejected");
    expect(hostSettingsUpdateErrorDisposition(new ReadmatesTransportError())).toBe("unknown");
    expect(hostSettingsUpdateErrorDisposition(new Error("HOST_SETTINGS_STALE:409"))).toBe("rejected");
  });

  it("classifies invitation-link stale only from the structured server code or fallback 409", () => {
    expect(hostInvitationLinkUpdateErrorDisposition(apiError("INVITATION_LINK_STALE", 409))).toBe("stale");
    expect(hostInvitationLinkUpdateErrorDisposition(apiError("CONFLICT", 409, true))).toBe("stale");
    expect(hostInvitationLinkUpdateErrorDisposition(apiError("INVALID_REQUEST", 400))).toBe("rejected");
    expect(hostInvitationLinkUpdateErrorDisposition(new ReadmatesTransportError())).toBe("unknown");
    expect(hostInvitationLinkUpdateErrorDisposition(new Error("INVITATION_LINK_STALE:409"))).toBe("rejected");
  });
});
