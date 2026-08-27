import type { HostMeetingRecordReadiness } from "@/features/host/model/host-meeting-record-readiness";
import {
  buildHostMeetingDiary,
} from "@/features/host/model/host-meeting-diary-model";
import {
  buildHostMeetingWorkspace,
  type HostMeetingWorkspaceInput,
  type HostMeetingWorkspaceView,
} from "@/features/host/model/host-session-workspace-model";
import type { WorkspaceHeaderModel } from "@/features/host/ui/session-workspace/workspace-header";
import type { WorkspacePendingUndo } from "@/features/host/ui/session-workspace/workspace-undo-bar";
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
});
