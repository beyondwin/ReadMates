import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLoaderData, useParams } from "react-router";
import {
  currentSessionQuery,
  invalidateCurrentSession,
  isCurrentScheduleSeenConflict,
  publishCurrentScheduleSeen,
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
import {
  publishTransitionAction,
  TransitionOwnerObsoleteError,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";
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
  const transitionOwner = useTransitionSafetyOwner("member-current-session");
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
    const operationId = `schedule-seen-${renderedSession?.sessionId ?? "current"}-${renderedRevision}`;
    const handle = transitionOwner.begin(operationId, "L1", async () => ({ operationId, outcome: "still-unknown" }));
    void markScheduleSeen(renderedRevision).then(async (receipt) => {
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "cache", () => publishCurrentScheduleSeen(queryClient, context, receipt));
    }).catch(async (error: unknown) => {
      if (error instanceof TransitionOwnerObsoleteError || !handle.isPublicationCurrent()) {
        acknowledgements.delete(renderedRevisionKey);
        return;
      }
      if (await handle.settle("failed") !== "accepted") return;
      if (isCurrentScheduleSeenConflict(error)) {
        await publishTransitionAction(handle, "cache", () => invalidateCurrentSession(queryClient, context));
      } else {
        await publishTransitionAction(handle, "cache", () => acknowledgements.delete(renderedRevisionKey));
      }
    });
  }, [context, markScheduleSeen, queryClient, renderedRevision, renderedRevisionKey, renderedSession?.sessionId, scheduleSeenWriteEligible, transitionOwner]);

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
    () => {
      const run = async <T,>(name: string, execute: () => Promise<T>): Promise<T> => {
        const operationId = `${name}-${globalThis.crypto.randomUUID()}`;
        const handle = transitionOwner.begin(operationId, "L1", async () => ({ operationId, outcome: "still-unknown" }));
        try {
          const result = await execute();
          if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
          await publishTransitionAction(handle, "cache", () => invalidateCurrentSession(queryClient, context));
          return result;
        } catch (error) {
          if (error instanceof TransitionOwnerObsoleteError) throw error;
          await handle.settle("failed");
          throw error;
        }
      };
      return {
        updateRsvp: (status) => run("member-rsvp", () => updateRsvpMutation.mutateAsync(status)),
        saveCheckin: (readingProgress) => run("member-checkin", () => saveCheckinMutation.mutateAsync(readingProgress)),
        saveQuestions: (questions) => run("member-questions", () => saveQuestionsMutation.mutateAsync(questions)),
        saveLongReview: (body) => run("member-long-review", () => saveLongReviewMutation.mutateAsync(body)),
        saveOneLineReview: (text) => run("member-one-line-review", () => saveOneLineReviewMutation.mutateAsync(text)),
      };
    },
    [
      saveCheckinMutation,
      saveLongReviewMutation,
      saveOneLineReviewMutation,
      saveQuestionsMutation,
      updateRsvpMutation,
      context,
      queryClient,
      transitionOwner,
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
