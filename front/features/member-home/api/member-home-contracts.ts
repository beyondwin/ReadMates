import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { CurrentSessionResponse } from "@/shared/model/current-session-contracts";

export type MemberHomeAuth = AuthMeResponse;
export type MemberHomeMembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";

export type MemberHomeCurrentSessionResponse = CurrentSessionResponse;

export type MemberHomeNoteFeedItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  kind: "QUESTION" | "ONE_LINE_REVIEW" | "LONG_REVIEW" | "HIGHLIGHT";
  text: string;
};

export type MemberHomeUpcomingSession = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  visibility: "MEMBER" | "PUBLIC";
};
