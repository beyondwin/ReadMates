import type { HostMeetingRecordReadiness } from "@/features/host/model/host-meeting-record-readiness";
import {
  buildHostMeetingDiary,
} from "@/features/host/model/host-meeting-diary-model";
import type { SessionClosingBoardView } from "@/features/host/model/session-closing-model";
import {
  buildHostMeetingWorkspace,
  type HostMeetingWorkspaceInput,
  type HostMeetingWorkspaceView,
} from "@/features/host/model/host-session-workspace-model";
import type { WorkspaceHeaderModel } from "@/features/host/ui/session-workspace/workspace-header";
import type { WorkspacePendingUndo } from "@/features/host/ui/session-workspace/workspace-undo-bar";
import type { MeetingClosingChecklistSlot } from "./host-meeting-workspace";
import { buildMeetingAudienceProjections } from "./meeting-audience-projections";
import type { MeetingAudienceProjection } from "./meeting-focus-facts";

export const FOCUS_DECK_TITLE =
  "경계가 긴 한글 모임 제목과 A deliberately long English meeting title without clipping";

const FOCUS_DECK_CURRENT_URL = "https://readmates.test/clubs/alpha/app/host/sessions/session-27";

export const FOCUS_DECK_HEADER: WorkspaceHeaderModel = {
  sessionNumber: 27,
  title: FOCUS_DECK_TITLE,
  date: "2026.08.26",
  time: "20:00",
  location: "온라인 · 서울의 아주 긴 모임 장소 설명 DeliberatelyLongEnglishVenueName",
};

export const FOCUS_DECK_PUBLIC_RECORD_HREF = "/clubs/alpha/records/session-27";

export const FOCUS_DECK_RECOVERY: WorkspacePendingUndo = {
  description: "최근 출석 변경을 되돌릴 수 있습니다.",
  onUndo: () => undefined,
  onOpenHistory: () => undefined,
  onDismiss: () => undefined,
};

export type FocusDeckFixture = {
  view: HostMeetingWorkspaceView;
  diary: ReturnType<typeof buildHostMeetingDiary>;
  header: WorkspaceHeaderModel;
  projections: readonly MeetingAudienceProjection[];
  recordReadiness?: HostMeetingRecordReadiness;
  publicRecordHref?: string | null;
  memberViewHref?: string | null;
  pendingUndo?: WorkspacePendingUndo | null;
  onCreateRevision?: (() => void) | null;
  /** CLOSED records/publish step — production always mounts this slot. */
  closingChecklist?: MeetingClosingChecklistSlot | null;
};

/** Incomplete closing checklist for CLOSED CT — matches embedded production slot. */
export const CLOSED_DIARY_CLOSING_VIEW: SessionClosingBoardView = {
  title: "No.27 · 마감 점검 책",
  subtitle: "2026-08-20 · Members",
  statusLabel: "조치 필요",
  statusTone: "warn",
  primaryAction: {
    label: "기록 패키지 검토",
    reason: "정리본을 올리기 전에 기록 패키지와 소감 수집 상태를 확인해야 합니다.",
    tone: "warn",
    href: "/app/host/sessions/session-27/edit?records=json",
  },
  checklist: [
    {
      id: "SESSION_CLOSED",
      label: "출석 확정",
      detail: "참석이 확정됐습니다.",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: null,
      actionLabel: "상태 확인",
      completedStamp: "2026-08-20",
    },
    {
      id: "MEMBER_NOTIFICATION_SENT",
      label: "소감 수집",
      detail: "미제출자에게 수동 발송할 수 있습니다.",
      state: "ACTION_REQUIRED",
      stateLabel: "조치 필요",
      tone: "warn",
      href: "/app/host/notifications",
      actionLabel: "수동 발송",
      completedStamp: null,
    },
    {
      id: "RECORD_PACKAGE_SAVED",
      label: "기록 초안",
      detail: "정리본이 아직 없습니다.",
      state: "ACTION_REQUIRED",
      stateLabel: "조치 필요",
      tone: "warn",
      href: "/app/host/sessions/session-27/edit?records=json",
      actionLabel: "확인하기",
      completedStamp: null,
    },
    {
      id: "FEEDBACK_DOCUMENT_READY",
      label: "피드백 문서 확인",
      detail: "피드백 문서를 아직 확인하지 않았습니다.",
      state: "ACTION_REQUIRED",
      stateLabel: "조치 필요",
      tone: "warn",
      href: null,
      actionLabel: "상태 확인",
      completedStamp: null,
    },
    {
      id: "PUBLIC_RECORD_VISIBLE",
      label: "멤버 게시",
      detail: "멤버·게스트 표면에 아직 게시되지 않았습니다.",
      state: "BLOCKED",
      stateLabel: "차단",
      tone: "danger",
      href: null,
      actionLabel: "상태 확인",
      completedStamp: null,
    },
  ],
  surfaces: [],
  evidence: [
    { label: "공개 요약", value: "없음" },
    { label: "하이라이트", value: "0" },
    { label: "한줄평", value: "0" },
    { label: "피드백 문서", value: "확인 필요" },
    { label: "최근 멤버 알림", value: "없음" },
  ],
};

function readyReadiness(facts: {
  hasDraft?: boolean;
  draftLiveBaseStale?: boolean;
  validationIssueCount?: number;
  hasAppliedRecord?: boolean;
  publicationReady?: boolean;
}): HostMeetingRecordReadiness {
  return {
    status: "ready",
    observedAt: "2026-08-25T01:02:03.000Z",
    facts: {
      hasDraft: facts.hasDraft ?? false,
      draftLiveBaseStale: facts.draftLiveBaseStale ?? false,
      validationIssueCount: facts.validationIssueCount ?? 0,
      hasAppliedRecord: facts.hasAppliedRecord ?? false,
      publicationReady: facts.publicationReady ?? false,
    },
  };
}

function fixture(
  input: Omit<HostMeetingWorkspaceInput, "currentUrl">,
  extras: Omit<FocusDeckFixture, "view" | "diary" | "header" | "projections"> = {},
): FocusDeckFixture {
  const view = buildHostMeetingWorkspace({
    currentUrl: FOCUS_DECK_CURRENT_URL,
    ...input,
  });
  const diary = buildHostMeetingDiary({
    workspace: view,
    meetingDate: input.meetingDate,
    today: input.today,
    currentUrl: FOCUS_DECK_CURRENT_URL,
  });
  return {
    view,
    diary,
    header: FOCUS_DECK_HEADER,
    projections: buildMeetingAudienceProjections({
      visibility: input.state === "DRAFT" ? "HOST_ONLY" : "MEMBER",
      lifecycle: input.state,
    }),
    recordReadiness: input.recordReadiness,
    memberViewHref: "/app/sessions/session-27",
    ...extras,
  };
}

export const draftFocusDeck = fixture({
  state: "DRAFT",
  meetingDate: "2026-09-02",
  today: "2026-08-26",
  unansweredResponseCount: 0,
  unknownAttendanceCount: 0,
  recordReadiness: { status: "not-required" },
});

export const openFocusDeck = fixture({
  state: "OPEN",
  meetingDate: "2026-08-26",
  today: "2026-08-26",
  unansweredResponseCount: 5,
  unknownAttendanceCount: 17,
  recordReadiness: { status: "not-required" },
});

export const closedFocusDeck = fixture({
  state: "CLOSED",
  meetingDate: "2026-08-20",
  today: "2026-08-26",
  unansweredResponseCount: 0,
  unknownAttendanceCount: 0,
  recordReadiness: readyReadiness({ hasDraft: false, hasAppliedRecord: false, publicationReady: false }),
}, {
  pendingUndo: FOCUS_DECK_RECOVERY,
  closingChecklist: { kind: "ready", view: CLOSED_DIARY_CLOSING_VIEW },
});

export const publishedFocusDeck = fixture({
  state: "PUBLISHED",
  meetingDate: "2026-08-20",
  today: "2026-08-26",
  unansweredResponseCount: 0,
  unknownAttendanceCount: 0,
  recordReadiness: readyReadiness({ hasAppliedRecord: true, publicationReady: true }),
}, {
  publicRecordHref: FOCUS_DECK_PUBLIC_RECORD_HREF,
  onCreateRevision: () => undefined,
});

export const readinessPendingFocusDeck = fixture({
  state: "CLOSED",
  meetingDate: "2026-08-20",
  today: "2026-08-26",
  unansweredResponseCount: 0,
  unknownAttendanceCount: 0,
  recordReadiness: { status: "pending" },
}, {
  closingChecklist: { kind: "loading" },
});
