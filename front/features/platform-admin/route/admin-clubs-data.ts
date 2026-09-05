import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { platformAdminClubListFiltersFromSearch } from "@/features/platform-admin/model/platform-admin-club-list-filters";
import {
  buildClubManagementRow,
  type ClubManagementRow,
} from "@/features/platform-admin/model/platform-admin-club-triage-model";
import type { PlatformAdminClub } from "@/features/platform-admin/model/platform-admin-domain-types";
import { platformAdminClubsInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export type AdminClubsLedgerTabId = "all" | "attention" | "operating";

export type AdminClubsLedgerFact = {
  icon: "people" | "person" | "document" | "link";
  label: string;
  value: string;
};

export type AdminClubsLedgerView = {
  tabs: {
    id: AdminClubsLedgerTabId;
    label: "전체" | "확인 필요" | "운영 중";
    count: number;
  }[];
  rows: {
    clubId: string;
    name: string;
    statusLabel: string;
    needsReview: boolean;
    updatedAgo: string;
    href: string;
  }[];
  selected: {
    name: string;
    facts: AdminClubsLedgerFact[];
    review: { text: string }[];
    primary: { label: "운영 상태 변경 검토"; href: string };
    secondary: { label: "접근 권한 보기"; href: string };
    tertiary: { label: string; href: string } | null;
  } | null;
};

export type AdminClubLedgerPresentation = ClubManagementRow & {
  clubId: string;
  href: string;
  facts: AdminClubsLedgerFact[];
  review: { text: string }[];
  statusLabel: string;
  needsReview: boolean;
  updatedAgo: string;
  operationsFacts: {
    hostsLabel: string;
    membersLabel: string;
    recordsLabel: string;
    domainLabel: string;
    reviewLabel: string;
    ageLabel: string;
  };
};

function clubFacts(club: PlatformAdminClub): AdminClubsLedgerFact[] {
  const hostValue = club.firstHostOnboardingState === "ASSIGNED" ? "1명" : "없음";
  const domainValue = club.domainActionRequiredCount > 0
    ? "확인 필요"
    : club.domainCount > 0
      ? "연결됨"
      : "없음";
  return [
    { icon: "people", label: "호스트", value: hostValue },
    { icon: "link", label: "도메인", value: domainValue },
  ];
}

function reviewItems(row: ClubManagementRow): { text: string }[] {
  const items: { text: string }[] = [];
  if (row.requiredAction) items.push({ text: row.requiredAction });
  if (row.recentSignal && row.recentSignal !== row.requiredAction) {
    items.push({ text: row.recentSignal });
  }
  return items;
}

export function presentAdminClubForLedger(
  club: PlatformAdminClub,
  href: string,
): AdminClubLedgerPresentation {
  const row = buildClubManagementRow(club);
  const facts = clubFacts(club);
  const review = reviewItems(row);
  const needsReview = row.emphasis === "actionable";
  const host = facts.find((fact) => fact.icon === "people");
  const domain = facts.find((fact) => fact.icon === "link");
  return {
    ...row,
    clubId: club.clubId,
    href,
    facts,
    review,
    statusLabel: row.requiredAction ?? row.currentState,
    needsReview,
    updatedAgo: "",
    operationsFacts: {
      hostsLabel: host ? `${host.label} ${host.value}` : "호스트",
      membersLabel: "",
      recordsLabel: "",
      domainLabel: domain ? `${domain.label} ${domain.value}` : "도메인",
      reviewLabel: review[0]?.text ?? row.currentState,
      ageLabel: "",
    },
  };
}

export function buildAdminClubsLedgerView(
  clubs: readonly AdminClubLedgerPresentation[],
  selectedId: string | null,
): AdminClubsLedgerView {
  const attention = clubs.filter((club) => club.needsReview);
  const operating = clubs.filter((club) => !club.needsReview);
  const selectedClub = clubs.find((club) => club.clubId === selectedId)
    ?? attention[0]
    ?? clubs[0]
    ?? null;
  return {
    tabs: [
      { id: "all", label: "전체", count: clubs.length },
      { id: "attention", label: "확인 필요", count: attention.length },
      { id: "operating", label: "운영 중", count: operating.length },
    ],
    rows: clubs.map((club) => ({
      clubId: club.clubId,
      name: club.name,
      statusLabel: club.statusLabel,
      needsReview: club.needsReview,
      updatedAgo: club.updatedAgo,
      href: club.href,
    })),
    selected: selectedClub
      ? {
          name: selectedClub.name,
          facts: [...selectedClub.facts],
          review: [...selectedClub.review],
          primary: { label: "운영 상태 변경 검토", href: selectedClub.href },
          secondary: { label: "접근 권한 보기", href: selectedClub.href },
          tertiary: { label: "예시 데이터", href: selectedClub.href },
        }
      : null,
  };
}

export function adminClubsTabCountsFromView(view: AdminClubsLedgerView) {
  return {
    all: view.tabs[0]?.count ?? 0,
    attention: view.tabs[1]?.count ?? 0,
    operating: view.tabs[2]?.count ?? 0,
  };
}

export function adminClubsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminClubs({ request }: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth({ request });
    const filters = platformAdminClubListFiltersFromSearch(
      new URL(request.url).searchParams,
    );
    await queryClient.fetchInfiniteQuery(
      platformAdminClubsInfiniteQuery(filters),
    );
    return null;
  };
}
