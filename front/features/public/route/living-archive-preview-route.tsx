import { useQuery } from "@tanstack/react-query";
import { useLoaderData } from "react-router";
import { buildLivingArchivePreviewModel } from "@/features/public/model/living-archive-preview-model";
import { publicClubQuery, publicSessionQuery } from "@/features/public/queries/public-queries";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import { LivingArchivePreviewHead } from "@/features/public/ui/living-archive-preview-head";
import { LivingArchivePreviewPage } from "@/features/public/ui/living-archive-preview-page";
import "@/features/public/ui/living-archive-preview.css";

export function LivingArchivePreviewRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));
  const latestSessionId = clubQuery.data?.recentSessions[0]?.sessionId ?? "";
  const sessionQuery = useQuery({
    ...publicSessionQuery(data.clubSlug, latestSessionId),
    enabled: Boolean(latestSessionId),
  });

  if (!clubQuery.data) {
    return <LivingArchivePreviewHead />;
  }

  const model = buildLivingArchivePreviewModel(clubQuery.data, sessionQuery.data ?? null);

  return (
    <>
      <LivingArchivePreviewHead />
      <LivingArchivePreviewPage model={model} publicBasePath={data.publicBasePath} />
    </>
  );
}
