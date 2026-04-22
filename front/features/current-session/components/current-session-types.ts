import type { AuthMeResponse, CurrentSessionResponse } from "@/shared/api/readmates";

export type CurrentSessionAuth = Pick<AuthMeResponse, "membershipStatus">;
export type CurrentSession = NonNullable<CurrentSessionResponse["currentSession"]>;
export type RsvpUpdateStatus = Exclude<CurrentSession["myRsvpStatus"], "NO_RESPONSE">;
export type BoardQuestion = CurrentSession["board"]["questions"][number];
export type BoardCheckin = CurrentSession["board"]["checkins"][number];
export type BoardHighlight = CurrentSession["board"]["highlights"][number];
export type SaveScope = "checkin" | "question" | "longReview" | "oneLineReview";
export type SaveState = "idle" | "saving" | "saved" | "error";

export const SUSPENDED_MEMBER_NOTICE = "멤버십이 일시 정지되어 새 활동을 저장할 수 없습니다.";
