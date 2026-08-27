import type { HostSessionListItem } from "@/features/host/api/host-contracts";
import { hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
import { resolvedSessionExposure, sessionExposureCopy } from "./session-exposure-model";

export type HostMeetingListRow = {
  id: string;
  ordinal: number;
  title: string;
  meetingDate: string;
  lifecycleLabel: string;
  nextAction: { label: string; href: string };
  readerProjection: string;
  attention: ReadonlyArray<string>;
};

export type HostMeetingListState = {
  baseUpdatedAt: number;
  appendedItems: HostSessionListItem[];
  nextCursor: string | null;
  paginationStarted: boolean;
  announcement: string | null;
  focusHeadingRevision: number;
  replaceHref: string | null;
};

function lifecycleLabel(state: HostSessionListItem["state"]) {
  return hostMeetingLifecycleLabel(state);
}

function attentionLabels(item: HostSessionListItem) {
  const labels: string[] = [];
  if (item.needsAttention) labels.push("확인 필요");
  if (item.state === "OPEN") labels.push("참석 응답 확인");
  return labels;
}

export function hostMeetingListRows(items: readonly HostSessionListItem[]): HostMeetingListRow[] {
  return items.map((item) => {
    const exposure = resolvedSessionExposure(item);
    const projection = sessionExposureCopy(exposure.accessScope, exposure.siteVisibility);
    return {
      id: item.sessionId,
      ordinal: item.sessionNumber,
      title: item.title,
      meetingDate: item.date,
      lifecycleLabel: lifecycleLabel(item.state),
      nextAction: {
        label: item.state === "OPEN" ? "모임 열기" : "모임 준비하기",
        href: `/app/host/sessions/${encodeURIComponent(item.sessionId)}`,
      },
      readerProjection: `${projection.accessLabel} · ${projection.siteLabel}`,
      attention: attentionLabels(item),
    };
  });
}

export function hostListCursorRecovery(
  state: HostMeetingListState,
  restartHref: string,
): HostMeetingListState {
  return {
    baseUpdatedAt: state.baseUpdatedAt,
    appendedItems: [],
    nextCursor: null,
    paginationStarted: false,
    announcement: "목록이 바뀌어 처음부터 다시 불러왔습니다.",
    focusHeadingRevision: state.focusHeadingRevision + 1,
    replaceHref: restartHref,
  };
}

export function hostMeetingListNextCursor(
  state: Pick<HostMeetingListState, "paginationStarted" | "nextCursor">,
  baseCursor: string | null,
) {
  return state.paginationStarted ? state.nextCursor : baseCursor;
}

export function hostMeetingListBaseRefresh(
  state: HostMeetingListState,
  baseUpdatedAt: number,
  nextCursor: string | null,
): HostMeetingListState {
  return {
    ...state,
    baseUpdatedAt,
    appendedItems: [],
    nextCursor,
    paginationStarted: false,
  };
}
