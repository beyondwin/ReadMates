import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLoaderData, useParams } from "react-router";
import {
  currentSessionQuery,
  useSaveCurrentSessionCheckinMutation,
  useSaveCurrentSessionLongReviewMutation,
  useSaveCurrentSessionOneLineReviewMutation,
  useSaveCurrentSessionQuestionsMutation,
  useUpdateCurrentSessionRsvpMutation,
} from "@/features/current-session/queries/current-session-queries";
import { memberCurrentSessionReadPage } from "@/features/current-session/model/current-session-read-view";
import type { CurrentSessionRouteData } from "@/features/current-session/route/current-session-data";
import { CurrentSessionPage, type CurrentSessionSaveActions } from "@/features/current-session/ui/current-session-page";
import type { CurrentSessionInternalLinkProps, InternalLinkComponent } from "@/features/current-session/ui/current-session-types";
import {
  RECOVER_READ_SESSION_EXPIRY,
  type ReadmatesApiContext,
} from "@/shared/api/client";
import { readSurfaceCapabilitiesForAuth } from "@/shared/model/read-surface-capabilities";
export { CurrentSessionRouteError } from "./current-session-route-error";

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext | undefined {
  return clubSlug ? { clubSlug } : undefined;
}

function AnchorInternalLink({ href, children, ...props }: CurrentSessionInternalLinkProps) {
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

export function CurrentSessionRoute({
  internalLinkComponent = AnchorInternalLink,
}: {
  internalLinkComponent?: InternalLinkComponent;
}) {
  const loaderData = useLoaderData() as CurrentSessionRouteData;
  const params = useParams();
  const context = useMemo(() => contextFromClubSlug(params.clubSlug), [params.clubSlug]);
  const currentQuery = useQuery(currentSessionQuery(context, RECOVER_READ_SESSION_EXPIRY));
  const updateRsvpMutation = useUpdateCurrentSessionRsvpMutation(context);
  const saveCheckinMutation = useSaveCurrentSessionCheckinMutation(context);
  const saveQuestionsMutation = useSaveCurrentSessionQuestionsMutation(context);
  const saveLongReviewMutation = useSaveCurrentSessionLongReviewMutation(context);
  const saveOneLineReviewMutation = useSaveCurrentSessionOneLineReviewMutation(context);
  const currentData = currentQuery.data ?? loaderData.current;
  const currentSessionPage = memberCurrentSessionReadPage(
    currentData,
    readSurfaceCapabilitiesForAuth(loaderData.auth),
  );

  const currentSessionSaveActions = useMemo<CurrentSessionSaveActions>(
    () => ({
      updateRsvp: (status) => updateRsvpMutation.mutateAsync(status),
      saveCheckin: (readingProgress) => saveCheckinMutation.mutateAsync(readingProgress),
      saveQuestions: (questions) => saveQuestionsMutation.mutateAsync(questions),
      saveLongReview: (body) => saveLongReviewMutation.mutateAsync(body),
      saveOneLineReview: (text) => saveOneLineReviewMutation.mutateAsync(text),
    }),
    [
      saveCheckinMutation,
      saveLongReviewMutation,
      saveOneLineReviewMutation,
      saveQuestionsMutation,
      updateRsvpMutation,
    ],
  );

  return (
    <CurrentSessionPage
      auth={loaderData.auth}
      data={currentSessionPage}
      actions={currentSessionSaveActions}
      internalLinkComponent={internalLinkComponent}
    />
  );
}
