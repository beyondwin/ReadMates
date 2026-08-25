import type { HostSessionScheduleDefaults } from "./host-schedule-defaults-state";
import type { HostSessionRequest } from "./host-session-editor-model";

export type NewMeetingDraft = {
  title: string;
  bookTitle: string;
  author: string;
  meetingDate: string;
  meetingTime: string;
  locationLabel: string;
  meetingUrl: string;
  meetingPasscode: string;
};

export type ScheduleSuggestionField<T> = {
  value: T;
  reason: string;
  sourceMeetingCount: number;
  sensitive: boolean;
};

export type NewMeetingField = keyof NewMeetingDraft;
export type NewMeetingFieldErrors = Partial<Record<NewMeetingField, string>>;
export type NewMeetingSuggestionStatus = "ready" | "loading" | "error" | "no-history";

export type NewMeetingSuggestions = {
  status: NewMeetingSuggestionStatus;
  message: string;
  blocking: false;
  meetingDate: ScheduleSuggestionField<string> | null;
  meetingTime: ScheduleSuggestionField<string> | null;
  locationLabel: ScheduleSuggestionField<string> | null;
  meetingUrl: ScheduleSuggestionField<string> | null;
  meetingPasscode: ScheduleSuggestionField<string> | null;
};

export const NEW_MEETING_FIELD_LIMITS = {
  title: 255,
  bookTitle: 255,
  author: 255,
  locationLabel: 255,
  meetingUrl: 1000,
  meetingPasscode: 255,
} as const satisfies Partial<Record<NewMeetingField, number>>;

const fieldLabels: Record<NewMeetingField, string> = {
  title: "모임 제목",
  bookTitle: "책 제목",
  author: "저자",
  meetingDate: "모임 날짜",
  meetingTime: "시작 시간",
  locationLabel: "장소",
  meetingUrl: "미팅 URL",
  meetingPasscode: "Passcode",
};

const requiredFields: readonly NewMeetingField[] = ["title", "bookTitle", "author", "meetingDate"];

export function emptyNewMeetingDraft(): NewMeetingDraft {
  return {
    title: "",
    bookTitle: "",
    author: "",
    meetingDate: "",
    meetingTime: "20:00",
    locationLabel: "온라인",
    meetingUrl: "",
    meetingPasscode: "",
  };
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function validIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function validTime(value: string): boolean {
  if (!value) return true;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
}

function validHttpsUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateNewMeetingDraft(draft: NewMeetingDraft): NewMeetingFieldErrors {
  const errors: NewMeetingFieldErrors = {};
  for (const field of requiredFields) {
    if (!draft[field].trim()) errors[field] = `${fieldLabels[field]}을 입력해 주세요.`;
  }
  for (const [field, limit] of Object.entries(NEW_MEETING_FIELD_LIMITS) as Array<[keyof typeof NEW_MEETING_FIELD_LIMITS, number]>) {
    if (codePointLength(draft[field]) > limit) errors[field] = `${fieldLabels[field]}은 ${limit}자까지 입력할 수 있습니다.`;
  }
  if (draft.meetingDate && !validIsoDate(draft.meetingDate)) errors.meetingDate = "유효한 모임 날짜를 입력해 주세요.";
  if (!validTime(draft.meetingTime)) errors.meetingTime = "유효한 시작 시간을 입력해 주세요.";
  if (!validHttpsUrl(draft.meetingUrl)) errors.meetingUrl = "https로 시작하는 유효한 미팅 URL을 입력해 주세요.";
  return errors;
}

function sourceMeetingCount(defaults: HostSessionScheduleDefaults): number {
  const count = defaults.hints
    .map((hint) => /(?:최근\s*)?(\d+)\s*(?:개|회)/.exec(hint)?.[1])
    .find(Boolean);
  return Math.min(10, Math.max(0, Number(count ?? (defaults.previousOnlineMeeting ? 1 : 0))));
}

function suggestion<T>(value: T, reason: string, count: number, sensitive = false): ScheduleSuggestionField<T> {
  return { value, reason, sourceMeetingCount: count, sensitive };
}

const statusCopy: Record<Exclude<NewMeetingSuggestionStatus, "ready">, string> = {
  loading: "기본 일정을 확인하고 있습니다.",
  error: "기본 일정을 불러오지 못했습니다.",
  "no-history": "지난 모임이 없어 직접 입력합니다.",
};

export function newMeetingSuggestionsFromDefaults(
  defaults: HostSessionScheduleDefaults | null,
  status: NewMeetingSuggestionStatus = defaults ? "ready" : "no-history",
): NewMeetingSuggestions {
  if (!defaults || status !== "ready") {
    return {
      status,
      message: status === "ready" ? "지난 모임이 없어 직접 입력합니다." : statusCopy[status],
      blocking: false,
      meetingDate: null,
      meetingTime: null,
      locationLabel: null,
      meetingUrl: null,
      meetingPasscode: null,
    };
  }
  const count = sourceMeetingCount(defaults);
  const reason = defaults.hints[0] ?? "최근 모임의 운영 정보를 바탕으로 제안합니다.";
  const previous = defaults.previousOnlineMeeting;
  return {
    status: "ready",
    message: reason,
    blocking: false,
    meetingDate: defaults.automatic.suggestedDate
      ? suggestion(defaults.automatic.suggestedDate, reason, count)
      : null,
    meetingTime: suggestion(defaults.automatic.startTime, reason, count),
    locationLabel: suggestion(defaults.automatic.locationLabel, reason, count),
    meetingUrl: previous ? suggestion(previous.meetingUrl, "이전 온라인 모임 정보입니다.", 1, true) : null,
    meetingPasscode: previous?.meetingPasscode
      ? suggestion(previous.meetingPasscode, "이전 온라인 모임 정보입니다.", 1, true)
      : null,
  };
}

export function applyNewMeetingSuggestions(
  draft: NewMeetingDraft,
  suggestions: NewMeetingSuggestions,
  dirty: ReadonlySet<NewMeetingField>,
): NewMeetingDraft {
  const next = { ...draft };
  for (const field of ["meetingDate", "meetingTime", "locationLabel"] as const) {
    const candidate = suggestions[field];
    if (!dirty.has(field) && candidate) next[field] = candidate.value;
  }
  return next;
}

export function adoptSensitiveMeetingSuggestion(
  draft: NewMeetingDraft,
  suggestions: NewMeetingSuggestions,
): NewMeetingDraft {
  return {
    ...draft,
    meetingUrl: suggestions.meetingUrl?.value ?? draft.meetingUrl,
    meetingPasscode: suggestions.meetingPasscode?.value ?? draft.meetingPasscode,
  };
}

export function buildNewMeetingRequest(draft: NewMeetingDraft): HostSessionRequest {
  return {
    title: draft.title.trim(),
    bookTitle: draft.bookTitle.trim(),
    bookAuthor: draft.author.trim(),
    locationLabel: draft.locationLabel.trim(),
    meetingUrl: draft.meetingUrl.trim(),
    meetingPasscode: draft.meetingPasscode.trim(),
    date: draft.meetingDate,
    startTime: draft.meetingTime || null,
    accessScope: "HOST_ONLY",
  };
}

export function projectCreatedMeeting(input: {
  sessionId: string;
  sessionNumber?: number;
  state?: string;
  accessScope?: string;
}) {
  if (typeof input.sessionId !== "string" || !input.sessionId.trim()) {
    throw new Error("UNSAFE_CREATED_MEETING_ID");
  }
  if (input.state && input.state !== "DRAFT") throw new Error("UNSAFE_CREATED_MEETING_STATE");
  if (input.accessScope && input.accessScope !== "HOST_ONLY") throw new Error("UNSAFE_CREATED_MEETING_ACCESS");
  return {
    sessionId: input.sessionId,
    sessionNumber: input.sessionNumber ?? null,
    state: "DRAFT" as const,
    accessScope: "HOST_ONLY" as const,
    siteVisibility: "HIDDEN" as const,
    notificationDecision: "NOT_SENT" as const,
  };
}

function knownField(value: unknown): NewMeetingField | null {
  if (typeof value !== "string") return null;
  return (Object.keys(fieldLabels) as NewMeetingField[]).includes(value as NewMeetingField)
    ? value as NewMeetingField
    : null;
}

export function classifyNewMeetingServerFailure(status: number, body: unknown): {
  field: NewMeetingField | null;
  message: string;
} | null {
  if (status !== 400) return null;
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const field = knownField(record.field);
  return {
    field,
    message: field ? `${fieldLabels[field]}을 확인해 주세요.` : "모임 정보를 확인해 주세요.",
  };
}
