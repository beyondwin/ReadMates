import type {
  PublicClubResponse,
  PublicSessionDetailResponse,
  PublicSessionListItem,
} from "@/features/public/api/public-contracts";

export type LivingArchiveReaderTrace = {
  id: string;
  index: number;
  authorName: string;
  authorShortName: string;
  avatarKey: string;
  text: string;
  kind: "oneLiner" | "highlight";
};

export type LivingArchivePreviewModel = {
  clubName: string;
  sessions: PublicSessionListItem[];
  latest: PublicSessionListItem | null;
  latestDetail: PublicSessionDetailResponse | null;
  readerTraces: LivingArchiveReaderTrace[];
};

export function buildLivingArchivePreviewModel(
  club: PublicClubResponse,
  latestDetail: PublicSessionDetailResponse | null,
): LivingArchivePreviewModel {
  const readerTraces = latestDetail
    ? [
        ...latestDetail.oneLiners.map((oneLiner, sourceIndex) => ({
          id: `one-liner-${sourceIndex}`,
          authorName: oneLiner.authorName,
          authorShortName: oneLiner.authorShortName,
          avatarKey: oneLiner.avatarKey,
          text: oneLiner.text,
          kind: "oneLiner" as const,
        })),
        ...latestDetail.highlights.flatMap((highlight, sourceIndex) => {
          if (!highlight.authorName || !highlight.authorShortName) {
            return [];
          }

          return [{
            id: `highlight-${sourceIndex}`,
            authorName: highlight.authorName,
            authorShortName: highlight.authorShortName,
            avatarKey: highlight.avatarKey,
            text: highlight.text,
            kind: "highlight" as const,
          }];
        }),
      ].slice(0, 3).map((trace, index) => ({ ...trace, index }))
    : [];

  return {
    clubName: club.clubName,
    sessions: club.recentSessions,
    latest: club.recentSessions[0] ?? null,
    latestDetail,
    readerTraces,
  };
}
