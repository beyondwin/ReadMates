import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateArchiveQueries } from "@/features/archive/queries/archive-queries";
import { invalidateCurrentSession } from "@/features/current-session/queries/current-session-queries";
import { invalidateFeedbackQueries } from "@/features/feedback/queries/feedback-queries";
import type { HostSessionRecordsChangedEvent } from "@/features/host/route/host-session-editor-route";
import { invalidatePublicClubQueries } from "@/features/public/queries/public-queries";

export function useSessionRecordsChangedInvalidation() {
  const queryClient = useQueryClient();

  return useCallback(
    async ({ clubSlug }: HostSessionRecordsChangedEvent) => {
      const context = { clubSlug };
      await Promise.all([
        invalidateCurrentSession(queryClient, context),
        invalidateArchiveQueries(queryClient, context),
        invalidateFeedbackQueries(queryClient, context),
        invalidatePublicClubQueries(queryClient, clubSlug),
      ]);
    },
    [queryClient],
  );
}
