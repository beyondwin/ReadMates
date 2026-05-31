export type ReadingLoopState =
  | "NO_SESSION"
  | "HOST_SETUP_REQUIRED"
  | "MEMBER_PREP_REQUIRED"
  | "SESSION_READY"
  | "REFLECTION_DUE"
  | "ARCHIVE_AVAILABLE";

export type ReadingLoopRsvpStatus = "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";

export type ReadingLoopInput = {
  hasCurrentSession: boolean;
  hostBlockerCount?: number;
  memberCanWrite?: boolean;
  memberRsvpStatus?: ReadingLoopRsvpStatus;
  memberHasCheckin?: boolean;
  memberQuestionCount?: number;
  minimumQuestionCount?: number;
  sessionDate?: string | null;
  today?: Date;
  memberHasReflection?: boolean;
  archiveItemCount?: number;
};

export const READING_LOOP_LABELS: Record<ReadingLoopState, string> = {
  NO_SESSION: "세션 대기",
  HOST_SETUP_REQUIRED: "호스트 준비 필요",
  MEMBER_PREP_REQUIRED: "멤버 준비 필요",
  SESSION_READY: "세션 준비됨",
  REFLECTION_DUE: "회고 필요",
  ARCHIVE_AVAILABLE: "아카이브 연결",
};

const READING_LOOP_DESCRIPTIONS: Record<ReadingLoopState, string> = {
  NO_SESSION: "현재 열린 세션이 없어 호스트가 새 세션을 열면 멤버 준비가 시작됩니다.",
  HOST_SETUP_REQUIRED: "호스트가 세션 정보, 멤버 상태, 공개 범위, 운영 대기 항목을 먼저 닫아야 합니다.",
  MEMBER_PREP_REQUIRED: "멤버가 RSVP, 읽기 진행률, 질문 중 남은 준비를 완료해야 합니다.",
  SESSION_READY: "호스트 운영과 멤버 준비가 큰 문제 없이 모임을 기다릴 수 있는 상태입니다.",
  REFLECTION_DUE: "모임 이후 한줄평, 서평, 기록 정리가 남아 있습니다.",
  ARCHIVE_AVAILABLE: "공개되거나 보존된 기록을 아카이브와 노트에서 이어 읽을 수 있습니다.",
};

export function readingLoopDescription(state: ReadingLoopState): string {
  return READING_LOOP_DESCRIPTIONS[state];
}

export function deriveReadingLoopState(input: ReadingLoopInput): ReadingLoopState {
  if (!input.hasCurrentSession) {
    return "NO_SESSION";
  }

  if ((input.hostBlockerCount ?? 0) > 0) {
    return "HOST_SETUP_REQUIRED";
  }

  const canWrite = input.memberCanWrite ?? false;
  const minimumQuestionCount = input.minimumQuestionCount ?? 2;
  const memberPrepMissing =
    canWrite &&
    (input.memberRsvpStatus === "NO_RESPONSE" ||
      input.memberHasCheckin === false ||
      (input.memberQuestionCount ?? 0) < minimumQuestionCount);

  if (memberPrepMissing) {
    return "MEMBER_PREP_REQUIRED";
  }

  if (isAfterSessionDate(input.sessionDate, input.today ?? new Date()) && input.memberHasReflection === false) {
    return "REFLECTION_DUE";
  }

  if ((input.archiveItemCount ?? 0) > 0) {
    return "ARCHIVE_AVAILABLE";
  }

  return "SESSION_READY";
}

function isAfterSessionDate(sessionDate: string | null | undefined, today: Date): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate ?? "");

  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return current.getTime() > target.getTime();
}
