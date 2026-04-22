import type { AuthMeResponse, CurrentSessionResponse } from "@/shared/api/readmates";
export {
  SUSPENDED_MEMBER_NOTICE,
  VIEWER_MEMBER_NOTICE,
  VIEWER_MEMBER_SHORT_NOTICE,
} from "@/features/current-session/model/current-session-view-model";

export type CurrentSessionAuth = Pick<AuthMeResponse, "membershipStatus" | "approvalState"> & {
  role?: AuthMeResponse["role"];
};
export type CurrentSession = NonNullable<CurrentSessionResponse["currentSession"]>;
export type RsvpUpdateStatus = Exclude<CurrentSession["myRsvpStatus"], "NO_RESPONSE">;
export type BoardQuestion = CurrentSession["board"]["questions"][number];
export type BoardCheckin = CurrentSession["board"]["checkins"][number];
export type BoardHighlight = CurrentSession["board"]["highlights"][number];
export type SaveScope = "rsvp" | "checkin" | "question" | "longReview" | "oneLineReview";
export type SaveState = "idle" | "saving" | "saved" | "error";
