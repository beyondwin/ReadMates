import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useParams } from "react-router";
import { getAiGenerationCapabilities, getClubAiDefault, putClubAiDefault } from "@/features/host/aigen/api/aigen-api";
import { aiClubKeys } from "@/features/host/aigen/queries/aigen-job-queries";
import { hostMutationKey } from "@/features/host/queries/host-state-purge";
import { hostClubOperationsQuery } from "@/features/host/queries/host-club-operations-queries";
import { hostNotificationHealthQuery } from "@/features/host/queries/host-notification-queries";
import { hostSessionRecordAttentionPagesQuery } from "@/features/host/queries/host-session-record-queries";
import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
import { HostOperationsPage } from "@/features/host/ui/host-operations-page";
import type { HostOperationsCard } from "@/shared/observability/frontend-observability-contracts";
import { recordHostOperationsCardLoad } from "@/shared/observability/frontend-observability";
import type { HostOperationsRouteData } from "./host-operations-data";
import { publishTransitionAction, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";

function useRecordHostOperationsCardLoad(
  card: HostOperationsCard,
  query: {
    isFetching: boolean;
    isError: boolean;
    isSuccess: boolean;
  },
  enabled = true,
) {
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      startedAtRef.current = null;
      return;
    }
    if (query.isFetching) {
      if (startedAtRef.current === null) {
        startedAtRef.current = performance.now();
      }
      return;
    }
    const startedAt = startedAtRef.current;
    if (startedAt === null || (!query.isSuccess && !query.isError)) {
      return;
    }
    startedAtRef.current = null;
    recordHostOperationsCardLoad({
      card,
      outcome: query.isError ? "error" : "success",
      durationMs: performance.now() - startedAt,
    });
  }, [card, enabled, query.isError, query.isFetching, query.isSuccess]);
}

export function HostOperationsRoute({
  LinkComponent,
}: {
  LinkComponent?: HostLinkComponent;
}) {
  const { auth, clubSlug } = useLoaderData() as HostOperationsRouteData;
  const params = useParams<{ clubSlug: string }>();
  const resolvedSlug = clubSlug ?? params.clubSlug ?? auth.currentMembership?.clubSlug;
  if (!resolvedSlug) {
    throw new Error("HOST_API_CONTEXT_REQUIRED");
  }
  const context = useMemo(() => ({ clubSlug: resolvedSlug }), [resolvedSlug]);
  const queryClient = useQueryClient();

  const attentionQuery = useInfiniteQuery(hostSessionRecordAttentionPagesQuery(context));
  const clubOpsQuery = useQuery(hostClubOperationsQuery(context));
  const notificationsQuery = useQuery(hostNotificationHealthQuery(context));
  const aiCapabilitiesQuery = useQuery({
    queryKey: aiClubKeys.capabilities(context),
    queryFn: () => getAiGenerationCapabilities(resolvedSlug),
    staleTime: 0,
    enabled: Boolean(resolvedSlug),
  });
  const aiGenerationEnabled =
    aiCapabilitiesQuery.data?.enabled === true && !aiCapabilitiesQuery.isFetching;
  const aiDefaultsQuery = useQuery({
    queryKey: aiClubKeys.defaults(context),
    queryFn: () => getClubAiDefault(resolvedSlug),
    enabled: Boolean(resolvedSlug) && aiGenerationEnabled,
  });
  const serverModel = aiDefaultsQuery.data?.defaultModel ?? null;
  const [selectedModelOverride, setSelectedModelOverride] = useState<string | null>(null);
  const selectedModel = selectedModelOverride ?? serverModel;
  const [savedModel, setSavedModel] = useState(false);
  const aiDefaultMutation = useMutation({
    mutationKey: hostMutationKey(resolvedSlug, "aigen", "club-default"),
    mutationFn: (model: string) => putClubAiDefault(resolvedSlug, { defaultModel: model }),
  });
  const aiDefaultDirty = selectedModel !== null && serverModel !== null && selectedModel !== serverModel;
  const transitionOwner = useTransitionSafetyOwner("host-ai-defaults", aiDefaultDirty, "저장하지 않은 AI 기본 모델이 있습니다.");
  const saveAiDefault = async () => {
    if (!selectedModel || !aiDefaultDirty || aiDefaultMutation.isPending) return;
    const operationId = `host-ai-default-${globalThis.crypto.randomUUID()}`;
    const handle = transitionOwner.begin(operationId, "L1", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      await aiDefaultMutation.mutateAsync(selectedModel);
      if (await handle.settle("succeeded") === "accepted") {
        await publishTransitionAction(handle, "cache", () => queryClient.invalidateQueries({ queryKey: aiClubKeys.defaults(context) }));
        await publishTransitionAction(handle, "successCopy", () => setSavedModel(true));
      }
    } catch {
      await handle.settle("failed");
    }
  };
  useRecordHostOperationsCardLoad("attention", attentionQuery);
  useRecordHostOperationsCardLoad("club_readiness", clubOpsQuery);
  useRecordHostOperationsCardLoad("notifications", notificationsQuery);
  useRecordHostOperationsCardLoad("ai_defaults", aiCapabilitiesQuery, Boolean(resolvedSlug));
  useRecordHostOperationsCardLoad(
    "ai_defaults",
    aiDefaultsQuery,
    Boolean(resolvedSlug) && aiGenerationEnabled,
  );

  const attentionItems = attentionQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = attentionQuery.data?.pages[0]?.summary.needsAttentionCount ?? 0;

  return (
    <HostOperationsPage
      clubSlug={resolvedSlug ?? ""}
      LinkComponent={LinkComponent}
      aiDefaults={{
        enabled: aiGenerationEnabled,
        capabilityLoading: aiCapabilitiesQuery.isFetching,
        capabilityError: aiCapabilitiesQuery.isError,
        model: selectedModel ?? serverModel,
        loading: aiDefaultsQuery.isLoading,
        pending: aiDefaultMutation.isPending,
        error: aiDefaultsQuery.isError ? "기본 모델 정보를 불러오지 못했습니다." : aiDefaultMutation.error instanceof Error ? aiDefaultMutation.error.message : null,
        saved: savedModel,
        canSave: aiGenerationEnabled && aiDefaultDirty && !aiDefaultMutation.isPending && !aiDefaultsQuery.isLoading,
        onModelChange: (model) => { setSavedModel(false); aiDefaultMutation.reset(); setSelectedModelOverride(model); },
        onSave: () => { void saveAiDefault(); },
        onRetryCapabilities: () => { void aiCapabilitiesQuery.refetch(); },
        onRetryDefault: () => { void aiDefaultsQuery.refetch(); },
      }}
      attention={{
        items: attentionItems,
        totalCount,
        hasMore: Boolean(attentionQuery.hasNextPage),
        loading: attentionQuery.isPending && !attentionQuery.data,
        loadingMore: attentionQuery.isFetchingNextPage,
        error: attentionQuery.isError && !attentionQuery.data
          ? "확인 필요 목록을 불러오지 못했습니다."
          : null,
        loadMoreError: attentionQuery.isFetchNextPageError ? "더 불러오지 못했습니다." : null,
        isRefreshing: attentionQuery.isFetching && !attentionQuery.isPending && !attentionQuery.isFetchingNextPage,
        onRetry: () => {
          void attentionQuery.refetch();
        },
        onLoadMore: () => {
          void attentionQuery.fetchNextPage();
        },
      }}
      clubReadiness={{
        data: clubOpsQuery.data ?? null,
        loading: clubOpsQuery.isPending && !clubOpsQuery.data,
        error: clubOpsQuery.isError
          ? clubOpsQuery.data
            ? "클럽 준비도를 새로고치지 못했습니다."
            : "클럽 준비도를 불러오지 못했습니다."
          : null,
        isRefreshing: clubOpsQuery.isFetching && Boolean(clubOpsQuery.data),
        onRetry: () => {
          void clubOpsQuery.refetch();
        },
      }}
      notifications={{
        data: notificationsQuery.data ?? null,
        loading: notificationsQuery.isPending && !notificationsQuery.data,
        error: notificationsQuery.isError
          ? notificationsQuery.data
            ? "알림 상태를 새로고치지 못했습니다."
            : "알림 상태를 불러오지 못했습니다."
          : null,
        isRefreshing: notificationsQuery.isFetching && Boolean(notificationsQuery.data),
        onRetry: () => {
          void notificationsQuery.refetch();
        },
      }}
    />
  );
}
