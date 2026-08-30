import type { HostSessionListItem } from "@/features/host/api/host-contracts";
import { formatMeetingOrdinal, hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
import type { HostSessionLedgerItem } from "./host-session-ledger-model";
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

export type HostMeetingTocRow = {
  id: string;
  ordinalFolio: string;
  title: string;
  lifecycleLabel: string;
  attentionLabel: string | null;
  summary: string;
  href: string;
  state?: unknown;
};

export type HostMeetingTocSections = {
  upcoming: { rows: HostMeetingTocRow[]; nextCursor: string | null };
  past: { rows: HostMeetingTocRow[]; nextCursor: string | null };
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

type TocSourceItem = Pick<
  HostSessionListItem,
  "sessionId" | "sessionNumber" | "title" | "bookTitle" | "date" | "state" | "needsAttention"
>;

function lifecycleLabel(state: HostSessionListItem["state"]) {
  return hostMeetingLifecycleLabel(state);
}

function attentionLabels(item: HostSessionListItem) {
  const labels: string[] = [];
  if (item.needsAttention) labels.push("확인 필요");
  if (item.state === "OPEN") labels.push("참석 응답 확인");
  return labels;
}

function normalizeBasePath(basePath: string): string {
  return basePath.replace(/\/+$/, "") || "/";
}

function sessionDetailHref(basePath: string, sessionId: string): string {
  return `${normalizeBasePath(basePath)}/sessions/${encodeURIComponent(sessionId)}`;
}

function dateMmDd(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return date;
  }
  return `${match[2]}-${match[3]}`;
}

function tocAttentionLabel(item: Pick<TocSourceItem, "needsAttention">): string | null {
  return item.needsAttention ? "기록 확인 필요" : null;
}

function tocTitle(item: Pick<TocSourceItem, "bookTitle" | "title">): string {
  const bookTitle = item.bookTitle.trim();
  return bookTitle || item.title;
}

function upcomingSummary(item: Pick<TocSourceItem, "date">): string {
  return `${dateMmDd(item.date)} 예정일`;
}

function pastSummary(item: Pick<TocSourceItem, "date">): string {
  return dateMmDd(item.date);
}

function toTocRow(
  item: TocSourceItem,
  basePath: string,
  kind: "upcoming" | "past",
  detailLinkState?: unknown,
): HostMeetingTocRow {
  return {
    id: item.sessionId,
    ordinalFolio: formatMeetingOrdinal(item.sessionNumber, "folio"),
    title: tocTitle(item),
    lifecycleLabel: hostMeetingLifecycleLabel(item.state),
    attentionLabel: tocAttentionLabel(item),
    summary: kind === "upcoming" ? upcomingSummary(item) : pastSummary(item),
    href: sessionDetailHref(basePath, item.sessionId),
    ...(detailLinkState === undefined ? {} : { state: detailLinkState }),
  };
}

export function buildHostMeetingTocSections(input: {
  basePath: string;
  upcomingItems: readonly HostSessionListItem[];
  upcomingCursor: string | null;
  pastItems: readonly HostSessionLedgerItem[];
  pastCursor: string | null;
  detailLinkState?: unknown;
}): HostMeetingTocSections {
  const basePath = normalizeBasePath(input.basePath);
  return {
    upcoming: {
      rows: input.upcomingItems.map((item) => toTocRow(item, basePath, "upcoming", input.detailLinkState)),
      nextCursor: input.upcomingCursor,
    },
    past: {
      rows: input.pastItems.map((item) => toTocRow(item, basePath, "past", input.detailLinkState)),
      nextCursor: input.pastCursor,
    },
  };
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
