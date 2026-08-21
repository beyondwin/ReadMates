import type { HostSessionReverseRequest } from "../api/host-session-record-contracts";
import type { HostSessionState } from "./host-session-editor-model";
import type { HostSessionDetailResponse } from "./host-view-types";

export type { HostSessionReverseRequest };

export type HostSessionLifecycleResult =
  | { ok: true; session: HostSessionDetailResponse }
  | { ok: false; message: string; openSessionId: string | null };

export type SessionLifecycleConfirmKind =
  | "open"
  | "close"
  | "publish"
  | "reopen"
  | "unpublish"
  | "return-to-draft";

export type SessionLifecycleConfirmCopy = {
  kind: SessionLifecycleConfirmKind;
  title: string;
  body: string;
  confirmLabel: string;
  successFlash: string;
};

type ReverseLifecycleAction = {
  kind: Extract<SessionLifecycleConfirmKind, "reopen" | "unpublish" | "return-to-draft">;
  label: string;
};

const confirmCopyByKind: Record<SessionLifecycleConfirmKind, SessionLifecycleConfirmCopy> = {
  open: {
    kind: "open",
    title: "멤버에게 열기",
    body: "멤버 참석과 질문이 시작됩니다.",
    confirmLabel: "멤버에게 열기",
    successFlash: "모임을 열었습니다.",
  },
  close: {
    kind: "close",
    title: "모임 마치기",
    body: "모임을 마치면 참석과 질문이 멈춥니다. 기록은 남습니다.",
    confirmLabel: "모임 마치기",
    successFlash: "모임을 마쳤습니다.",
  },
  publish: {
    kind: "publish",
    title: "기록 공개",
    body: "멤버 노트·아카이브에 나갑니다. 공개 배치가 켜져 있으면 사이트에도 나갑니다.",
    confirmLabel: "기록 공개",
    successFlash: "기록을 공개했습니다.",
  },
  reopen: {
    kind: "reopen",
    title: "다시 진행 중으로",
    body: "다시 진행 중이 됩니다. 공개 사이트 배치는 숨깁니다. 기록은 남습니다.",
    confirmLabel: "다시 진행 중으로",
    successFlash: "다시 진행 중으로 바꿨습니다.",
  },
  unpublish: {
    kind: "unpublish",
    title: "공개 취소",
    body: "공개 사이트에서 내려갑니다. 기록과 이미 보낸 알림은 남습니다.",
    confirmLabel: "공개 취소",
    successFlash: "공개를 취소했습니다.",
  },
  "return-to-draft": {
    kind: "return-to-draft",
    title: "모임 전으로 되돌리기",
    body: "모임 전 상태가 됩니다. 참석·질문은 남습니다.",
    confirmLabel: "모임 전으로 되돌리기",
    successFlash: "모임 전으로 되돌렸습니다.",
  },
};

export function reverseLifecycleAction(state: HostSessionState): ReverseLifecycleAction | null {
  if (state === "OPEN") {
    return { kind: "return-to-draft", label: "모임 전으로 되돌리기" };
  }
  if (state === "CLOSED") {
    return { kind: "reopen", label: "다시 진행 중으로" };
  }
  if (state === "PUBLISHED") {
    return { kind: "unpublish", label: "공개 취소" };
  }
  return null;
}

export function lifecycleConfirmCopy(kind: SessionLifecycleConfirmKind): SessionLifecycleConfirmCopy {
  return confirmCopyByKind[kind];
}

export function openAlreadyExistsMessage(): string {
  return "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.";
}

export type HostSessionTrashRestoreFailure =
  | { kind: "expired" }
  | { kind: "open-conflict"; openSessionId: string }
  | { kind: "failed" };

export function classifyHostSessionTrashRestoreFailure(error: unknown): HostSessionTrashRestoreFailure {
  const candidate = error as { status?: number; code?: string; openSessionId?: string | null };
  if (candidate.status === 410 || candidate.code === "HOST_SESSION_TRASH_EXPIRED") {
    return { kind: "expired" };
  }
  if (candidate.code === "SESSION_OPEN_ALREADY_EXISTS" && candidate.openSessionId) {
    return { kind: "open-conflict", openSessionId: candidate.openSessionId };
  }
  return { kind: "failed" };
}

export const REVERSE_REASON_NOTE_MAX_LENGTH = 500;

export const SELECTABLE_REVERSE_REASON_OPTIONS = [
  { code: "ACCIDENTAL_TRANSITION", label: "실수로 상태를 바꿈" },
  { code: "MEETING_RESCHEDULED", label: "모임 일정이 바뀜" },
  { code: "CONTENT_CORRECTION", label: "내용을 바로잡기 위함" },
  { code: "OPERATIONAL_RECOVERY", label: "운영을 복구하기 위함" },
  { code: "OTHER_OPERATIONAL_REASON", label: "그 밖의 운영 사유" },
] as const;

const reverseReasonLabels: Record<string, string> = {
  ACCIDENTAL_TRANSITION: "실수로 상태를 바꿈",
  MEETING_RESCHEDULED: "모임 일정이 바뀜",
  CONTENT_CORRECTION: "내용을 바로잡기 위함",
  OPERATIONAL_RECOVERY: "운영을 복구하기 위함",
  OTHER_OPERATIONAL_REASON: "그 밖의 운영 사유",
  LEGACY_UNSPECIFIED: "이전 클라이언트에서 사유 없이 변경됨",
  EMPTY_SESSION_DELETED: "빈 모임 삭제",
};

export type ReverseLifecycleConfirmKind = ReverseLifecycleAction["kind"];

export function isReverseLifecycleKind(
  kind: SessionLifecycleConfirmKind,
): kind is ReverseLifecycleConfirmKind {
  return kind === "reopen" || kind === "unpublish" || kind === "return-to-draft";
}

export function lifecycleReasonLabel(reasonCode: string | null | undefined): string | null {
  if (!reasonCode) {
    return null;
  }
  return reverseReasonLabels[reasonCode] ?? null;
}

export function remainingReverseReasonNoteCount(note: string): number {
  return REVERSE_REASON_NOTE_MAX_LENGTH - note.length;
}

export type ReverseReasonValidationResult =
  | { ok: true; request: HostSessionReverseRequest }
  | { ok: false; message: string; focus: "reason" | "note" };

export function buildHostSessionReverseRequest(input: {
  reasonCode: string;
  reasonNote: string;
}): ReverseReasonValidationResult {
  if (!SELECTABLE_REVERSE_REASON_OPTIONS.some((option) => option.code === input.reasonCode)) {
    return { ok: false, message: "사유를 선택해 주세요", focus: "reason" };
  }
  const trimmedNote = input.reasonNote.trim();
  if (!trimmedNote) {
    return { ok: true, request: { reasonCode: input.reasonCode as HostSessionReverseRequest["reasonCode"] } };
  }
  if (trimmedNote.length > REVERSE_REASON_NOTE_MAX_LENGTH) {
    return { ok: false, message: "설명은 500자까지입니다", focus: "note" };
  }
  if (hasIsoControlCharacter(trimmedNote)) {
    return { ok: false, message: "설명에 사용할 수 없는 문자가 있습니다", focus: "note" };
  }
  return {
    ok: true,
    request: {
      reasonCode: input.reasonCode as HostSessionReverseRequest["reasonCode"],
      reasonNote: trimmedNote,
    },
  };
}

function hasIsoControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}
