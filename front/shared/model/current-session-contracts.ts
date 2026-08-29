import { z } from "zod";

export type RsvpStatus = "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";
export type AttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionMemberRole = "HOST" | "MEMBER";

export type CurrentSessionResponse = {
  currentSession: null | {
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookLink: string | null;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
    locationLabel: string;
    meetingUrl: string | null;
    meetingPasscode: string | null;
    questionDeadlineAt: string;
    myRsvpStatus: RsvpStatus;
    scheduleRevision: number;
    mySeenScheduleRevision: number | null;
    myScheduleSeenAt: string | null;
    myCheckin: null | {
      readingProgress: number;
    };
    myQuestions: Array<{
      priority: number;
      text: string;
      draftThought: string | null;
      authorName: string;
      authorShortName: string;
      avatarKey: string;
    }>;
    myOneLineReview: null | {
      text: string;
      avatarKey?: string;
    };
    myLongReview: null | {
      body: string;
      avatarKey?: string;
    };
    board: {
      questions: Array<{
        priority: number;
        text: string;
        draftThought: string | null;
        authorName: string;
        authorShortName: string;
        avatarKey: string;
      }>;
      longReviews: Array<{
        authorName: string;
        authorShortName: string;
        avatarKey: string;
        body: string;
      }>;
    };
    attendees: Array<{
      membershipId: string;
      avatarKey: string;
      displayName: string;
      accountName: string;
      role: CurrentSessionMemberRole;
      rsvpStatus: RsvpStatus;
      attendanceStatus: AttendanceStatus;
      participationStatus?: SessionParticipationStatus;
    }>;
  };
};

export const CurrentSessionResponseSchema = z.object({
      currentSession: z
        .object({
          sessionId: z.string(),
          sessionNumber: z.number(),
          title: z.string(),
          bookTitle: z.string(),
          bookAuthor: z.string(),
          bookLink: z.string().nullable(),
          bookImageUrl: z.string().nullable(),
          date: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          locationLabel: z.string(),
          meetingUrl: z.string().nullable(),
          meetingPasscode: z.string().nullable(),
          questionDeadlineAt: z.string(),
          myRsvpStatus: z.enum(["NO_RESPONSE", "GOING", "MAYBE", "DECLINED"]),
          scheduleRevision: z.number().int().positive(),
          mySeenScheduleRevision: z.number().int().positive().nullable(),
          myScheduleSeenAt: z.string().datetime({ offset: true }).nullable(),
          myCheckin: z
            .object({
              readingProgress: z.number(),
            })
            .nullable(),
          myQuestions: z.array(
            z.object({
              priority: z.number(),
              text: z.string(),
              draftThought: z.string().nullable(),
              authorName: z.string(),
              authorShortName: z.string(),
              avatarKey: z.string(),
            }),
          ),
          myOneLineReview: z
            .object({
              text: z.string(),
              avatarKey: z.string().optional(),
            })
            .nullable(),
          myLongReview: z
            .object({
              body: z.string(),
              avatarKey: z.string().optional(),
            })
            .nullable(),
          board: z.object({
            questions: z.array(
              z.object({
                priority: z.number(),
                text: z.string(),
                draftThought: z.string().nullable(),
                authorName: z.string(),
                authorShortName: z.string(),
                avatarKey: z.string(),
              }),
            ),
            longReviews: z.array(
              z.object({
                authorName: z.string(),
                authorShortName: z.string(),
                avatarKey: z.string(),
                body: z.string(),
              }),
            ),
          }),
          attendees: z.array(
            z.object({
              membershipId: z.string(),
              avatarKey: z.string(),
              displayName: z.string(),
              accountName: z.string(),
              role: z.enum(["HOST", "MEMBER"]),
              rsvpStatus: z.enum(["NO_RESPONSE", "GOING", "MAYBE", "DECLINED"]),
              attendanceStatus: z.enum(["UNKNOWN", "ATTENDED", "ABSENT"]),
              participationStatus: z.enum(["ACTIVE", "REMOVED"]).optional(),
            }),
          ),
        })
        .nullable(),
    });

export function parseCurrentSessionResponse(value: unknown): CurrentSessionResponse {
  if (import.meta.env.DEV) {
    return CurrentSessionResponseSchema.parse(value);
  }

  return value as CurrentSessionResponse;
}
