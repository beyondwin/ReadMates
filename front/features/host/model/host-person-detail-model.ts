export type HostPersonAttendanceView = {
  sessionNumber: number;
  scheduledAt: string;
  attendanceStatus: "UNKNOWN" | "ATTENDED" | "ABSENT";
};

export type HostPersonDetailView = {
  membershipId: string;
  displayName: string;
  avatarKey: string;
  status: "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
  role: "MEMBER" | "HOST";
  lastClubAccessAt: string | null;
  currentSchedule: {
    state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
    scheduleRevision: number;
    scheduledAt: string;
  } | null;
  currentRsvp: "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED" | null;
  attendanceHistory: {
    items: HostPersonAttendanceView[];
    nextCursor: string | null;
  };
};
