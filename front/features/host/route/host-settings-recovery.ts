import {
  isReadmatesApiError,
  isReadmatesTransportError,
} from "@/shared/api/errors";

export type HostCloseConfirmErrorDisposition = "non-current" | "rejected" | "unknown";
export type HostCoHostErrorDisposition = "stale" | "permission" | "rejected" | "unknown";

const NON_CURRENT_PREVIEW_CODES = new Set([
  "HOST_CLUB_CLOSE_PREVIEW_EXPIRED",
  "HOST_CLUB_CLOSE_PREVIEW_MISMATCH",
  "HOST_CLUB_CLOSE_PREVIEW_NOT_FOUND",
  "HOST_CLUB_CLOSE_PREVIEW_CONSUMED",
  "HOST_SETTINGS_STALE",
  "HOST_CLUB_SETTINGS_NOT_FOUND",
]);

export function hostCloseConfirmErrorDisposition(error: unknown): HostCloseConfirmErrorDisposition {
  if (!isReadmatesApiError(error)) {
    return isReadmatesTransportError(error) ? "unknown" : "rejected";
  }
  if (
    NON_CURRENT_PREVIEW_CODES.has(error.code)
    || (error.fallback && [404, 409, 410].includes(error.status))
  ) {
    return "non-current";
  }
  return "rejected";
}

export function hostCoHostErrorDisposition(error: unknown): HostCoHostErrorDisposition {
  if (isReadmatesApiError(error)) {
    if (error.code === "HOST_SETTINGS_STALE") return "stale";
    if (error.code === "LAST_ACTIVE_HOST_REQUIRED" || error.code === "PERMISSION_DENIED" || error.status === 403) {
      return "permission";
    }
    return "rejected";
  }
  return isReadmatesTransportError(error) ? "unknown" : "rejected";
}
