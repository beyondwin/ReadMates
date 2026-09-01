import { z } from "zod";

const LocalDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/);

export const HostPersonAttendanceItemSchema = z.object({
  sessionNumber: z.number().int().positive(),
  scheduledAt: LocalDateTimeSchema,
  attendanceStatus: z.enum(["UNKNOWN", "ATTENDED", "ABSENT"]),
}).strict();

export const HostPersonDetailSchema = z.object({
  membershipId: z.string().min(1),
  displayName: z.string().min(1),
  avatarKey: z.string().min(1),
  status: z.enum(["INVITED", "VIEWER", "ACTIVE", "SUSPENDED", "LEFT", "INACTIVE"]),
  role: z.enum(["MEMBER", "HOST"]),
  lastClubAccessAt: z.string().datetime({ offset: true }).nullable(),
  currentSchedule: z.object({
    state: z.enum(["DRAFT", "OPEN", "CLOSED", "PUBLISHED"]),
    scheduleRevision: z.number().int().positive(),
    scheduledAt: LocalDateTimeSchema,
  }).strict().nullable(),
  currentRsvp: z.enum(["NO_RESPONSE", "GOING", "MAYBE", "DECLINED"]).nullable(),
  attendanceHistory: z.object({
    items: z.array(HostPersonAttendanceItemSchema),
    nextCursor: z.string().min(1).nullable(),
  }).strict(),
}).strict();

export type HostPersonDetail = z.infer<typeof HostPersonDetailSchema>;

export function parseHostPersonDetail(value: unknown): HostPersonDetail {
  return HostPersonDetailSchema.parse(value);
}
