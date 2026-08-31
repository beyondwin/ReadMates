import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLoaderData, useParams } from "react-router";
import {
  currentSessionQuery,
  isCurrentScheduleSeenConflict,
  useMarkCurrentScheduleSeenMutation,
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

const renderedScheduleAcknowledgements = new WeakMap<QueryClient, Set<string>>();

function acknowledgementSet(client: QueryClient) {
  const current = renderedScheduleAcknowledgements.get(client);
  if (current) return current;

  const created = new Set<string>();
  renderedScheduleAcknowledgements.set(client, created);
  return created;
}

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
  const queryClient = useQueryClient();
  const context = useMemo(() => contextFromClubSlug(params.clubSlug), [params.clubSlug]);
  const currentQuery = useQuery(currentSessionQuery(context, RECOVER_READ_SESSION_EXPIRY));
  const {
    error: scheduleSeenError,
    isError: scheduleSeenIsError,
    isPending: scheduleSeenIsPending,
    mutateAsync: markScheduleSeen,
  } = useMarkCurrentScheduleSeenMutation(context);
  const updateRsvpMutation = useUpdateCurrentSessionRsvpMutation(context);
  const saveCheckinMutation = useSaveCurrentSessionCheckinMutation(context);
  const saveQuestionsMutation = useSaveCurrentSessionQuestionsMutation(context);
  const saveLongReviewMutation = useSaveCurrentSessionLongReviewMutation(context);
  const saveOneLineReviewMutation = useSaveCurrentSessionOneLineReviewMutation(context);
  const currentData = currentQuery.data ?? loaderData.current;
  const readSurfaceCapabilities = readSurfaceCapabilitiesForAuth(loaderData.auth);
  const currentSessionPage = memberCurrentSessionReadPage(
    currentData,
    readSurfaceCapabilities,
  );
  const renderedSession = currentData.currentSession;
  const renderedRevision = renderedSession?.scheduleRevision ?? null;
  const scheduleSeenWriteEligible = Boolean(
    readSurfaceCapabilities.canWrite
    && loaderData.auth.membershipId
    && renderedSession?.attendees.some((attendee) => (
      attendee.membershipId === loaderData.auth.membershipId
      && (attendee.participationStatus ?? "ACTIVE") === "ACTIVE"
    )),
  );
  const renderedRevisionKey = renderedSession === null || renderedRevision === null
    ? null
    : `${context?.clubSlug ?? "unscoped"}:${renderedSession.sessionId}:${renderedRevision}`;
  const acknowledgeRenderedRevision = useCallback(() => {
    if (!scheduleSeenWriteEligible || renderedRevision === null || renderedRevisionKey === null) return;

    const acknowledgements = acknowledgementSet(queryClient);
    if (acknowledgements.has(renderedRevisionKey)) return;

    acknowledgements.add(renderedRevisionKey);
    void markScheduleSeen(renderedRevision).catch((error: unknown) => {
      if (!isCurrentScheduleSeenConflict(error)) {
        acknowledgements.delete(renderedRevisionKey);
      }
    });
  }, [markScheduleSeen, queryClient, renderedRevision, renderedRevisionKey, scheduleSeenWriteEligible]);

  useEffect(() => {
    if (
      scheduleSeenWriteEligible
      && renderedSession
      && renderedSession.mySeenScheduleRevision !== renderedSession.scheduleRevision
    ) {
      acknowledgeRenderedRevision();
    }
  }, [acknowledgeRenderedRevision, renderedSession, scheduleSeenWriteEligible]);

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
      scheduleSeenRecovery={
        scheduleSeenWriteEligible
        && scheduleSeenIsError
        && !isCurrentScheduleSeenConflict(scheduleSeenError)
          ? {
              isRetrying: scheduleSeenIsPending,
              onRetry: acknowledgeRenderedRevision,
            }
          : undefined
      }
    />
  );
}
