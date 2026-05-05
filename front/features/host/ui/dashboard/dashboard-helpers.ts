import type {
  CurrentSessionResponse,
  HostDashboardResponse,
} from "@/features/host/ui/host-ui-types";
import type {
  HostChecklistState as ChecklistState,
  HostDashboardAlertTone as HostAlertTone,
} from "@/features/host/model/host-dashboard-model";
import { nonNegativeCount, rsvpLabel } from "@/shared/ui/readmates-display";

export type CurrentSession = NonNullable<CurrentSessionResponse["currentSession"]>;

export function memberSessionState(
  session: CurrentSession,
  member: CurrentSession["attendees"][number],
  currentMembershipId: string | null | undefined,
) {
  const rsvp = rsvpLabel(member.rsvpStatus);

  if (member.rsvpStatus === "NO_RESPONSE" || member.rsvpStatus === "DECLINED") {
    return rsvp;
  }

  if (member.membershipId !== currentMembershipId) {
    return rsvp;
  }

  const progress = session.myCheckin?.readingProgress;
  if (typeof progress !== "number") {
    return rsvp;
  }

  return `${rsvp} · ${progress >= 100 ? "완독" : `${progress}%`}`;
}

export function hostAlertMetrics(data: HostDashboardResponse): Array<{
  desktopLabel: string;
  mobileLabel: string;
  value: number;
  desktopHint: string;
  mobileHint: string;
  tone: HostAlertTone;
}> {
  return [
    {
      desktopLabel: "RSVP 미응답",
      mobileLabel: "RSVP 미응답",
      value: nonNegativeCount(data.rsvpPending),
      desktopHint: "모임 전날 자정까지",
      mobileHint: "응답 상태 확인",
      tone: "warn",
    },
    {
      desktopLabel: "진행률 미작성",
      mobileLabel: "진행률 미작성",
      value: nonNegativeCount(data.checkinMissing),
      desktopHint: "읽기 상태 확인",
      mobileHint: "읽기 상태 확인",
      tone: "default",
    },
    {
      desktopLabel: "공개 대기",
      mobileLabel: "공개 대기",
      value: nonNegativeCount(data.publishPending),
      desktopHint: "한줄평 · 요약 편집 필요",
      mobileHint: "요약 편집 필요",
      tone: "accent",
    },
    {
      desktopLabel: "피드백 문서 등록 대기",
      mobileLabel: "피드백 문서 등록 대기",
      value: nonNegativeCount(data.feedbackPending),
      desktopHint: "문서 업로드 확인",
      mobileHint: "문서 업로드 확인",
      tone: "warn",
    },
  ];
}

export function checklistTextColor(state: ChecklistState) {
  return state === "complete" ? "var(--text-3)" : "var(--text)";
}

export function checklistBadgeClass(state: ChecklistState) {
  if (state === "complete") {
    return "badge badge-ok badge-dot";
  }

  if (state === "pending") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}

export function badgeClass(value: number, tone: HostAlertTone) {
  if (value === 0 || tone === "ok") {
    return "badge badge-ok badge-dot";
  }

  if (tone === "warn") {
    return "badge badge-warn badge-dot";
  }

  if (tone === "accent") {
    return "badge badge-accent badge-dot";
  }

  return "badge badge-dot";
}
