import type { SessionState } from "./readmates-types";

export type MeetingAudience = "host" | "member" | "guest" | "public";
export type MeetingPublicationAction =
  | "publishMemberNotes"
  | "removeMemberNotes"
  | "publishPublicRecord"
  | "removePublicRecord";
export type MeetingPublicationActionForm = "action" | "completed";
export type AccessScope = "HOST_ONLY" | "GUEST_READABLE";
export type SiteVisibility = "HIDDEN" | "PUBLIC_RECORD";
export type MeetingProjectionSurface = "host" | "memberGuest" | "publicRecord";

export const MEETING_NOUN = "모임";
export const MEETING_RESPONSE_LABEL = "참석 응답";
export const MEETING_ATTENDANCE_LABEL = "실제 출석";
export const MEETING_APPLY_LABEL = "기록에 반영";

const HOST_LIFECYCLE: Record<SessionState, string> = {
  DRAFT: "모임 작성 중",
  OPEN: "멤버와 준비 중",
  CLOSED: "기록 정리 중",
  PUBLISHED: "게스트·멤버 노트 게시 완료",
};

const MEMBER_GUEST_LIFECYCLE: Record<SessionState, string> = {
  DRAFT: "예정 모임",
  OPEN: "이번 모임",
  CLOSED: "지난 모임 기록",
  PUBLISHED: "지난 모임 기록",
};

const PUBLICATION_ACTION_LABEL: Record<MeetingPublicationAction, string> = {
  publishMemberNotes: "게스트·멤버 노트에 기록 게시",
  removeMemberNotes: "게스트·멤버 노트에서 기록 내리기",
  publishPublicRecord: "공개 기록에 게시",
  removePublicRecord: "공개 기록에서 내리기",
};

const PUBLICATION_COMPLETED_LABEL: Record<MeetingPublicationAction, string> = {
  publishMemberNotes: "게스트·멤버 노트에 기록을 게시했습니다.",
  removeMemberNotes: "게스트·멤버 노트에서 기록을 내렸습니다.",
  publishPublicRecord: "공개 기록에 게시했습니다.",
  removePublicRecord: "공개 기록에서 내렸습니다.",
};

export function formatMeetingOrdinal(value: number, mode: "folio" | "sentence"): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError("Meeting ordinal must be a positive integer");
  }
  return mode === "folio" ? `No.${value}` : `${value}번째 ${MEETING_NOUN}`;
}

export function formatMeetingLifecycle(state: SessionState, audience: MeetingAudience): string {
  if (audience === "host") {
    return HOST_LIFECYCLE[state];
  }
  if (audience === "public") {
    return "공개 기록";
  }
  return MEMBER_GUEST_LIFECYCLE[state];
}

export function formatMeetingProjection(
  input: { state: SessionState; accessScope: AccessScope; siteVisibility: SiteVisibility },
  surface: MeetingProjectionSurface,
): string {
  if (surface === "host") {
    return input.state === "PUBLISHED" ? "편집·수정" : "편집";
  }

  if (surface === "memberGuest") {
    if (input.accessScope === "HOST_ONLY") {
      return "호스트만 보기";
    }
    switch (input.state) {
      case "DRAFT":
        return "예정 화면 후보";
      case "OPEN":
        return "준비 화면";
      case "CLOSED":
        return "archive의 모임·현재 기록";
      case "PUBLISHED":
        return "notes/archive";
    }
  }

  if (input.state === "DRAFT" || input.state === "OPEN") {
    return "게시 불가";
  }
  if (input.state === "CLOSED") {
    return "notes·공개 사이트에는 게시 안 됨";
  }
  return input.siteVisibility === "PUBLIC_RECORD" ? "공개 기록에 게시" : "공개 기록에 게시 안 함";
}

export function formatPublicationAction(
  action: MeetingPublicationAction,
  form: MeetingPublicationActionForm = "action",
): string {
  return form === "completed" ? PUBLICATION_COMPLETED_LABEL[action] : PUBLICATION_ACTION_LABEL[action];
}
