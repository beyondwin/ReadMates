import { z } from "zod";

const GuestNavigationSchema = z
  .object({
    home: z.string(),
    current: z.string(),
    notes: z.string(),
    archive: z.string(),
    sessionDetail: z.string(),
    personalSpace: z.string(),
    personalRecords: z.string(),
    settings: z.string(),
    notifications: z.string(),
    feedback: z.string(),
    host: z.string(),
  })
  .strict();

export const GuestBrowseShellSchema = z
  .object({
    clubName: z.string(),
    tagline: z.string(),
    navigation: GuestNavigationSchema,
  })
  .strict();

const GuestAttendeeSchema = z
  .object({
    displayName: z.string(),
    avatarKey: z.string(),
    rsvpStatus: z.string(),
    attendanceStatus: z.string(),
  })
  .strict();

const GuestQuestionSchema = z
  .object({
    priority: z.number().int(),
    text: z.string(),
    draftThought: z.string().nullable(),
    authorName: z.string(),
    authorShortName: z.string(),
    avatarKey: z.string(),
  })
  .strict();

const GuestLongReviewSchema = z
  .object({
    title: z.string(),
    content: z.string(),
    authorName: z.string(),
    authorShortName: z.string(),
    avatarKey: z.string(),
  })
  .strict();

export const GuestCurrentSessionSchema = z
  .object({
    sessionId: z.string(),
    sessionNumber: z.number().int(),
    title: z.string(),
    bookTitle: z.string(),
    bookAuthor: z.string(),
    bookLink: z.string().nullable(),
    bookImageUrl: z.string().nullable(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    questionDeadlineAt: z.string(),
    attendees: z.array(GuestAttendeeSchema),
    board: z
      .object({
        questions: z.array(GuestQuestionSchema),
        longReviews: z.array(GuestLongReviewSchema),
      })
      .strict(),
  })
  .strict();

export const GuestCurrentSessionResponseSchema = z
  .object({
    currentSession: GuestCurrentSessionSchema,
  })
  .strict();

export const GuestUpcomingSessionSchema = z
  .object({
    sessionId: z.string(),
    sessionNumber: z.number().int(),
    title: z.string(),
    bookTitle: z.string(),
    bookAuthor: z.string(),
    bookLink: z.string().nullable(),
    bookImageUrl: z.string().nullable(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    questionDeadlineAt: z.string(),
    state: z.string(),
  })
  .strict();

export const GuestNoteSessionSchema = z
  .object({
    sessionId: z.string(),
    sessionNumber: z.number().int(),
    bookTitle: z.string(),
    date: z.string(),
    questionCount: z.number().int(),
    oneLinerCount: z.number().int(),
    longReviewCount: z.number().int(),
    highlightCount: z.number().int(),
    totalCount: z.number().int(),
  })
  .strict();

export const GuestNoteFeedItemSchema = z
  .object({
    sessionId: z.string(),
    sessionNumber: z.number().int(),
    bookTitle: z.string(),
    date: z.string(),
    authorName: z.string().nullable(),
    authorShortName: z.string().nullable(),
    avatarKey: z.string().nullable(),
    kind: z.string(),
    text: z.string(),
  })
  .strict();

export const GuestArchiveSessionSchema = z
  .object({
    sessionId: z.string(),
    sessionNumber: z.number().int(),
    title: z.string(),
    bookTitle: z.string(),
    bookAuthor: z.string(),
    bookImageUrl: z.string().nullable(),
    date: z.string(),
    attendance: z.number().int(),
    total: z.number().int(),
    state: z.string(),
  })
  .strict();

const GuestHighlightSchema = z
  .object({
    text: z.string(),
    sortOrder: z.number().int(),
    authorName: z.string().nullable(),
    authorShortName: z.string().nullable(),
    avatarKey: z.string().nullable(),
  })
  .strict();

const GuestOneLinerSchema = z
  .object({
    text: z.string(),
    authorName: z.string(),
    authorShortName: z.string(),
    avatarKey: z.string(),
  })
  .strict();

export const GuestArchiveDetailSchema = z
  .object({
    sessionId: z.string(),
    sessionNumber: z.number().int(),
    title: z.string(),
    bookTitle: z.string(),
    bookAuthor: z.string(),
    bookImageUrl: z.string().nullable(),
    date: z.string(),
    attendance: z.number().int(),
    total: z.number().int(),
    state: z.string(),
    summary: z.string().nullable(),
    highlights: z.array(GuestHighlightSchema),
    questions: z.array(GuestQuestionSchema),
    oneLiners: z.array(GuestOneLinerSchema),
    longReviews: z.array(GuestLongReviewSchema),
  })
  .strict();

function guestPageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();
}

export const GuestUpcomingSessionsPageSchema = guestPageSchema(GuestUpcomingSessionSchema);
export const GuestNoteSessionsPageSchema = guestPageSchema(GuestNoteSessionSchema);
export const GuestNoteFeedPageSchema = guestPageSchema(GuestNoteFeedItemSchema);
export const GuestArchivePageSchema = guestPageSchema(GuestArchiveSessionSchema);

export type GuestBrowseShell = z.infer<typeof GuestBrowseShellSchema>;
export type GuestCurrentSessionResponse = z.infer<typeof GuestCurrentSessionResponseSchema>;
export type GuestUpcomingSessionsPage = z.infer<typeof GuestUpcomingSessionsPageSchema>;
export type GuestNoteSessionsPage = z.infer<typeof GuestNoteSessionsPageSchema>;
export type GuestNoteFeedPage = z.infer<typeof GuestNoteFeedPageSchema>;
export type GuestArchivePage = z.infer<typeof GuestArchivePageSchema>;
export type GuestArchiveDetail = z.infer<typeof GuestArchiveDetailSchema>;

export const parseGuestBrowseShell = (value: unknown): GuestBrowseShell => GuestBrowseShellSchema.parse(value);
export const parseGuestCurrentSession = (value: unknown): GuestCurrentSessionResponse =>
  GuestCurrentSessionResponseSchema.parse(value);
export const parseGuestUpcomingSessions = (value: unknown): GuestUpcomingSessionsPage =>
  GuestUpcomingSessionsPageSchema.parse(value);
export const parseGuestNoteSessions = (value: unknown): GuestNoteSessionsPage => GuestNoteSessionsPageSchema.parse(value);
export const parseGuestNoteFeed = (value: unknown): GuestNoteFeedPage => GuestNoteFeedPageSchema.parse(value);
export const parseGuestArchive = (value: unknown): GuestArchivePage => GuestArchivePageSchema.parse(value);
export const parseGuestArchiveDetail = (value: unknown): GuestArchiveDetail => GuestArchiveDetailSchema.parse(value);
