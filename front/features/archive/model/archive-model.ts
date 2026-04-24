export type ArchiveView = "sessions" | "reviews" | "questions" | "report";
export type AttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type SessionState = "DRAFT" | "OPEN" | "PUBLISHED" | "CLOSED";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type MemberRole = "HOST" | "MEMBER";

export type ArchiveFeedbackDocumentStatus = {
  available: boolean;
  readable: boolean;
  lockedReason: "NOT_AVAILABLE" | "NOT_ATTENDED" | null;
  title: string | null;
  uploadedAt: string | null;
};

export type ArchiveSessionItemLike = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  attendance: number;
  total: number;
  published: boolean;
  state: SessionState;
  feedbackDocument?: ArchiveFeedbackDocumentStatus;
};

export type ArchiveSessionRecord = {
  id: string;
  number: number;
  date: string;
  book: string;
  author: string;
  bookImageUrl: string | null;
  attendance: number;
  total: number;
  published: boolean;
  feedbackDocument: ArchiveFeedbackDocumentStatus;
  state: SessionState;
};

export type ArchiveQuestionItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  priority: number;
  text: string;
  draftThought: string | null;
};

export type ArchiveReviewItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  kind: "LONG_REVIEW";
  text: string;
};

export type FeedbackDocumentListItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor?: string | null;
  bookImageUrl?: string | null;
  date: string;
  fileName: string;
  uploadedAt: string;
};

export type MyPageProfile = {
  displayName: string;
  accountName: string;
  email: string;
  role: MemberRole;
  membershipStatus: MembershipStatus;
  clubName: string | null;
  joinedAt: string;
  sessionCount: number;
  totalSessionCount: number;
  recentAttendances: Array<{
    sessionNumber: number;
    attended: boolean;
  }>;
};

export type MemberArchiveSessionDetail = {
  myQuestions: readonly unknown[];
  myCheckin: unknown | null;
  myOneLineReview: unknown | null;
  myLongReview: unknown | null;
  publicHighlights: readonly unknown[];
  clubQuestions: readonly unknown[];
  clubOneLiners: readonly unknown[];
  publicOneLiners: readonly unknown[];
};

export type MemberArchiveHighlightItem = {
  text: string;
  sortOrder: number;
  authorName: string | null;
  authorShortName: string | null;
};

export type MemberArchiveQuestionItem = {
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
};

export type MemberArchiveCheckinItem = {
  readingProgress: number;
};

export type MemberArchiveOneLinerItem = {
  authorName: string;
  authorShortName: string;
  text: string;
};

export type MemberArchiveOneLineReview = {
  text: string;
};

export type MemberArchiveLongReview = {
  body: string;
};

export type MemberArchiveSessionDetailResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  state: SessionState;
  locationLabel: string;
  attendance: number;
  total: number;
  myAttendanceStatus: AttendanceStatus | null;
  isHost: boolean;
  publicSummary: string | null;
  publicHighlights: MemberArchiveHighlightItem[];
  clubQuestions: MemberArchiveQuestionItem[];
  clubOneLiners: MemberArchiveOneLinerItem[];
  publicOneLiners: MemberArchiveOneLinerItem[];
  myQuestions: MemberArchiveQuestionItem[];
  myCheckin: MemberArchiveCheckinItem | null;
  myOneLineReview: MemberArchiveOneLineReview | null;
  myLongReview: MemberArchiveLongReview | null;
  feedbackDocument: ArchiveFeedbackDocumentStatus;
};

const UNKNOWN_SESSION_YEAR_LABEL = "미정";
const SESSION_YEAR_GROUP_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:(?:T|\s).*)?)?)?$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?=[T\s])/;
const JOINED_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const UNKNOWN_PROFILE_SAVE_ERROR_MESSAGE = "이름 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";

export const archiveTabs: Array<{ key: ArchiveView; label: string }> = [
  { key: "sessions", label: "세션" },
  { key: "report", label: "피드백 문서" },
  { key: "questions", label: "내 질문" },
  { key: "reviews", label: "내 서평" },
];

export const mobileArchiveTabs: Array<{ key: ArchiveView; label: string }> = archiveTabs;

export function archiveViewFromSearchParam(value: string | null): ArchiveView {
  if (value === "reviews" || value === "questions" || value === "report") {
    return value;
  }

  return "sessions";
}

export function feedbackDocumentStatusFromList(
  session: ArchiveSessionItemLike,
  fallbackReadableReportAvailable: boolean,
): ArchiveFeedbackDocumentStatus {
  if (session.feedbackDocument) {
    return session.feedbackDocument;
  }

  return {
    available: fallbackReadableReportAvailable,
    readable: fallbackReadableReportAvailable,
    lockedReason: fallbackReadableReportAvailable ? null : "NOT_AVAILABLE",
    title: fallbackReadableReportAvailable ? `독서모임 ${session.sessionNumber}차 피드백` : null,
    uploadedAt: null,
  };
}

export function toArchiveSessionRecord(
  session: ArchiveSessionItemLike,
  fallbackReadableReportAvailable: boolean,
): ArchiveSessionRecord {
  return {
    id: session.sessionId,
    number: session.sessionNumber,
    date: session.date,
    book: session.bookTitle,
    author: session.bookAuthor,
    bookImageUrl: session.bookImageUrl,
    attendance: session.attendance,
    total: session.total,
    published: session.published,
    feedbackDocument: feedbackDocumentStatusFromList(session, fallbackReadableReportAvailable),
    state: session.state,
  };
}

export function toArchiveSessionRecords(sessions: ArchiveSessionItemLike[], reports: FeedbackDocumentListItem[]) {
  const feedbackSessionIds = new Set(reports.map((report) => report.sessionId));
  return sessions.map((session) => toArchiveSessionRecord(session, feedbackSessionIds.has(session.sessionId)));
}

function isValidSessionYearGroupDate(year: string, month?: string, day?: string, rawDate?: string) {
  if (!month) {
    return true;
  }

  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) {
    return false;
  }

  if (!day) {
    return true;
  }

  if (rawDate && rawDate.length > 10 && Number.isNaN(new Date(rawDate).getTime())) {
    return false;
  }

  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(year) &&
    date.getMonth() + 1 === monthNumber &&
    date.getDate() === Number(day)
  );
}

export function sessionYearGroupKey(date: string) {
  const trimmedDate = date.trim();
  const match = SESSION_YEAR_GROUP_PATTERN.exec(trimmedDate);
  if (!match) {
    return UNKNOWN_SESSION_YEAR_LABEL;
  }

  const [, year, month, day] = match;
  return isValidSessionYearGroupDate(year, month, day, trimmedDate) ? year : UNKNOWN_SESSION_YEAR_LABEL;
}

export function groupArchiveSessionsByYear(sessions: ArchiveSessionRecord[]) {
  const keyedSessions = sessions.map((session) => ({
    session,
    year: sessionYearGroupKey(session.date),
  }));

  return Array.from(new Set(keyedSessions.map(({ year }) => year))).map((year) => ({
    year,
    list: keyedSessions.filter((item) => item.year === year).map(({ session }) => session),
  }));
}

export function archiveSummary({
  sessions,
  questions,
  reviews,
}: {
  sessions: ArchiveSessionRecord[];
  questions: readonly unknown[];
  reviews: readonly unknown[];
}) {
  const bookCount = new Set(sessions.map((session) => session.book)).size;
  return `${bookCount}권 · ${questions.length}개의 질문 · ${reviews.length}개의 서평`;
}

export function feedbackReportActionLabel(report: FeedbackDocumentListItem, action: "읽기" | "PDF로 저장") {
  return `No.${String(report.sessionNumber).padStart(2, "0")} ${report.bookTitle} 피드백 문서 ${action}`;
}

export function publicationLabel(published: boolean, variant: "desktop" | "mobile" = "desktop") {
  if (variant === "mobile") {
    return published ? "공개" : "비공개";
  }

  return published ? "공개 기록" : "비공개 기록";
}

export function feedbackArchiveLabel(feedbackDocument: ArchiveFeedbackDocumentStatus) {
  if (!feedbackDocument.available) {
    return "피드백 없음";
  }

  if (!feedbackDocument.readable) {
    return "피드백 잠김";
  }

  return "피드백 있음";
}

export function feedbackArchiveDescription(feedbackDocument: ArchiveFeedbackDocumentStatus) {
  if (!feedbackDocument.available) {
    return "등록된 피드백 문서가 없습니다.";
  }

  if (!feedbackDocument.readable) {
    return "등록된 피드백 문서가 있지만 이 계정에는 열람 권한이 없습니다.";
  }

  return "피드백 문서를 열람할 수 있습니다.";
}

export function feedbackArchiveBadgeClass(feedbackDocument: ArchiveFeedbackDocumentStatus) {
  if (!feedbackDocument.available) {
    return "badge badge-readonly badge-dot";
  }

  if (!feedbackDocument.readable) {
    return "badge badge-locked badge-dot";
  }

  return "badge badge-ok badge-dot";
}

export function selectedArchiveSectionMeta(view: ArchiveView) {
  if (view === "reviews") {
    return {
      eyebrow: "SAVED REVIEWS",
      title: "내 서평",
      body: "회차별로 흩어진 감상을 한 권의 발췌 노트처럼 모았습니다.",
    };
  }

  if (view === "questions") {
    return {
      eyebrow: "SAVED QUESTIONS",
      title: "내 질문",
      body: "모임 전에 남겼던 질문과 초안을 다시 읽을 수 있는 질문장입니다.",
    };
  }

  if (view === "report") {
    return {
      eyebrow: "FEEDBACK DOCUMENTS",
      title: "피드백 문서",
      body: "참석한 회차의 운영 피드백 문서를 보존 문서로 열람합니다.",
    };
  }

  return {
    eyebrow: "SESSION RECORDS",
    title: "세션 기록",
    body: "지난 회차의 책과 기록을 한곳에 모아둔 독서모임 기록입니다.",
  };
}

export function sessionNo(sessionNumber: number) {
  return `No.${String(sessionNumber).padStart(2, "0")}`;
}

export function attendanceText(status: AttendanceStatus | null) {
  if (status === "ATTENDED") {
    return "참석";
  }

  if (status === "ABSENT") {
    return "불참";
  }

  return "기록 없음";
}

export function feedbackStatusText(feedbackDocument: ArchiveFeedbackDocumentStatus) {
  if (!feedbackDocument.available) {
    return "피드백 없음";
  }

  if (!feedbackDocument.readable) {
    return "피드백 잠김";
  }

  return "피드백 공개";
}

export function feedbackAccessCopy(feedback: ArchiveFeedbackDocumentStatus) {
  if (!feedback.available) {
    return "호스트가 문서를 등록하면 참석 기록과 함께 열람 가능 여부가 표시됩니다.";
  }

  if (!feedback.readable) {
    return "피드백 문서는 정식 멤버 중 이 회차 참석자로 확인된 계정에만 열립니다.";
  }

  return "이 회차 참석 기록이 확인되어 문서를 열람할 수 있습니다.";
}

export function feedbackBadgeClass(feedbackDocument: ArchiveFeedbackDocumentStatus) {
  if (!feedbackDocument.available) {
    return "badge badge-readonly badge-dot";
  }

  if (!feedbackDocument.readable) {
    return "badge badge-locked badge-dot";
  }

  return "badge badge-ok badge-dot";
}

export function feedbackDocumentCardClassName({
  feedback,
  compact,
  mobile,
}: {
  feedback: ArchiveFeedbackDocumentStatus;
  compact: boolean;
  mobile: boolean;
}) {
  const baseClassName = mobile ? "m-card" : compact ? "surface-quiet" : "surface";

  if (!feedback.available) {
    return `${baseClassName} rm-empty-state rm-state rm-state--readonly`;
  }

  if (!feedback.readable) {
    return `${baseClassName} rm-locked-state`;
  }

  return baseClassName;
}

export function feedbackRailCardClassName(feedbackDocument: ArchiveFeedbackDocumentStatus) {
  if (!feedbackDocument.available) {
    return "surface-quiet rm-state rm-state--readonly";
  }

  if (!feedbackDocument.readable) {
    return "surface-quiet rm-state rm-state--locked";
  }

  return "surface-quiet";
}

export function hasClubRecords(session: MemberArchiveSessionDetail) {
  return session.publicHighlights.length > 0 || session.clubQuestions.length > 0 || session.clubOneLiners.length > 0;
}

export function hasMyRecords(session: MemberArchiveSessionDetail) {
  return (
    session.myQuestions.length > 0 ||
    session.myCheckin !== null ||
    session.myOneLineReview !== null ||
    session.myLongReview !== null
  );
}

export function myRecordSummary(session: MemberArchiveSessionDetail) {
  const count =
    session.myQuestions.length +
    (session.myCheckin ? 1 : 0) +
    (session.myOneLineReview ? 1 : 0) +
    (session.myLongReview ? 1 : 0);

  if (count === 0) {
    return "기록 없음";
  }

  return `${count}개 기록`;
}

function isValidDateOnly(year: string, month: string, day: string) {
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(year) &&
    date.getMonth() + 1 === Number(month) &&
    date.getDate() === Number(day)
  );
}

function formatDateOnlyLabel(value: string | null | undefined, fallback = "미정") {
  const text = value?.trim() || fallback;
  if (text === fallback) {
    return fallback;
  }

  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(text);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return isValidDateOnly(year, month, day) ? `${year}.${month}.${day}` : fallback;
  }

  const datePrefixMatch = DATE_PREFIX_PATTERN.exec(text);
  if (!datePrefixMatch || Number.isNaN(new Date(text).getTime())) {
    return fallback;
  }

  const [, year, month, day] = datePrefixMatch;
  return isValidDateOnly(year, month, day) ? `${year}.${month}.${day}` : fallback;
}

export function formatSessionMonthDayLabel(date: string) {
  return formatDateOnlyLabel(date).replace(/^\d{4}\./, "");
}

export function membershipIdentityLabel(data: Pick<MyPageProfile, "role" | "membershipStatus">) {
  if (data.role === "HOST" && data.membershipStatus === "ACTIVE") {
    return "호스트";
  }

  switch (data.membershipStatus) {
    case "ACTIVE":
      return "정식 멤버";
    case "VIEWER":
      return "둘러보기 멤버";
    case "SUSPENDED":
      return "일시 정지 멤버";
    case "INVITED":
      return "초대 대기";
    case "LEFT":
      return "탈퇴한 멤버";
    case "INACTIVE":
      return "비활성 멤버";
  }
}

export function clubDisplayName(data: Pick<MyPageProfile, "clubName">) {
  return data.clubName?.trim() || "클럽 정보 없음";
}

export function formatJoinedMonth(joinedAt: string) {
  if (!joinedAt.trim()) {
    return "합류 전";
  }

  const monthMatch = JOINED_MONTH_PATTERN.exec(joinedAt.trim());
  if (monthMatch) {
    const [, year, month] = monthMatch;
    const monthNumber = Number(month);
    if (monthNumber >= 1 && monthNumber <= 12) {
      return `${year}.${month}`;
    }
  }

  return formatDateOnlyLabel(joinedAt).slice(0, 7);
}

export function membershipJoinedLine(data: MyPageProfile) {
  const joinedMonth = formatJoinedMonth(data.joinedAt);
  return joinedMonth === "합류 전" ? `${membershipIdentityLabel(data)} · 합류 전` : `${membershipIdentityLabel(data)} · ${joinedMonth} 합류`;
}

export function profileSaveErrorMessage(code: string | null | undefined) {
  switch (code) {
    case "DISPLAY_NAME_REQUIRED":
      return "이름을 입력해 주세요.";
    case "DISPLAY_NAME_TOO_LONG":
      return "이름은 20자 이하로 입력해 주세요.";
    case "DISPLAY_NAME_INVALID":
      return "이름으로 쓸 수 없는 형식입니다.";
    case "DISPLAY_NAME_RESERVED":
      return "시스템에서 쓰는 이름은 사용할 수 없습니다.";
    case "DISPLAY_NAME_DUPLICATE":
      return "같은 클럽에서 이미 쓰고 있는 이름입니다.";
    case "MEMBERSHIP_NOT_ALLOWED":
      return "현재 상태에서는 프로필을 수정할 수 없습니다.";
    default:
      return UNKNOWN_PROFILE_SAVE_ERROR_MESSAGE;
  }
}

export function attendanceSummary({
  sessionCount,
  totalSessionCount,
}: Pick<MyPageProfile, "sessionCount" | "totalSessionCount">) {
  const total = Math.max(totalSessionCount ?? sessionCount, sessionCount);
  return {
    attended: sessionCount,
    total,
    rate: total > 0 ? Math.round((sessionCount / total) * 100) : 0,
  };
}
