import type { CSSProperties, ReactNode } from "react";
import type { CurrentSessionReadView } from "@/features/current-session/model/current-session-read-view";

export {
  SUSPENDED_MEMBER_NOTICE,
  VIEWER_MEMBER_NOTICE,
  VIEWER_MEMBER_SHORT_NOTICE,
} from "@/features/current-session/model/current-session-view-model";

export type CurrentSessionAuth = {
  membershipStatus: string | null;
  approvalState: string | null;
  role?: "HOST" | "MEMBER" | null;
};

export type RsvpStatus = "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";
export type AttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionMemberRole = "HOST" | "MEMBER";

export type { CurrentSessionReadView as CurrentSession };

export type CurrentSessionPageData = {
  currentSession: CurrentSession | null;
};

export type RsvpUpdateStatus = "GOING" | "MAYBE" | "DECLINED";
export type BoardQuestion = CurrentSession["board"]["questions"][number];
export type BoardLongReview = CurrentSession["board"]["longReviews"][number];
export type SaveScope = "rsvp" | "checkin" | "question" | "longReview" | "oneLineReview";
export type SaveState = "idle" | "saving" | "saved" | "error";

export type CurrentSessionInternalLinkProps = {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export type InternalLinkComponent = (props: CurrentSessionInternalLinkProps) => ReactNode;
