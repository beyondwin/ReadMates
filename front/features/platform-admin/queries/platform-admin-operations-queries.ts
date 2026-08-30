import { infiniteQueryOptions, queryOptions, useMutation, type QueryClient } from "@tanstack/react-query";
import {
  acknowledgeAdminOperationCase,
  fetchAdminOperationCase,
  fetchAdminOperationCases,
  resolveAdminOperationCase,
  snoozeAdminOperationCase,
} from "@/features/platform-admin/api/platform-admin-operations-api";
import type {
  AdminOperationCaseFilter,
  AdminOperationCaseState,
  AdminOperationSeverity,
  AdminOperationSourceType,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";

const OPERATIONS_POLL_INTERVAL_MS = 15_000;

type OperationsPolling = {
  active?: boolean;
};

type VersionedCaseMutation = {
  caseId: string;
  expectedVersion: number;
};

type SnoozeCaseMutation = VersionedCaseMutation & {
  snoozedUntil: string;
};

function normalizedSet<T extends string>(values: readonly T[] | undefined): T[] {
  return [...new Set(values ?? [])].sort() as T[];
}

function normalizeFilter(filter: AdminOperationCaseFilter = {}, cursorMode: "keep" | "omit" = "keep") {
  return {
    states: normalizedSet<AdminOperationCaseState>(filter.states),
    severities: normalizedSet<AdminOperationSeverity>(filter.severities),
    sources: normalizedSet<AdminOperationSourceType>(filter.sources),
    assignee: filter.assignee ?? null,
    limit: filter.limit ?? null,
    cursor: cursorMode === "omit" ? null : filter.cursor ?? null,
  };
}

function documentIsVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export const adminOperationsKeys = {
  all: ["platform-admin", "operations"] as const,
  cases: () => [...adminOperationsKeys.all, "cases"] as const,
  lists: () => [...adminOperationsKeys.cases(), "list"] as const,
  list: (filter: AdminOperationCaseFilter = {}) =>
    [...adminOperationsKeys.lists(), normalizeFilter(filter)] as const,
  pages: (filter: AdminOperationCaseFilter = {}) =>
    [...adminOperationsKeys.lists(), "pages", normalizeFilter(filter, "omit")] as const,
  details: () => [...adminOperationsKeys.cases(), "detail"] as const,
  detail: (caseId: string) => [...adminOperationsKeys.details(), caseId] as const,
} as const;

export function platformAdminOperationCasesQuery(
  filter: AdminOperationCaseFilter = {},
  polling: OperationsPolling = {},
) {
  const active = polling.active ?? false;
  return queryOptions({
    queryKey: adminOperationsKeys.list(filter),
    queryFn: () => fetchAdminOperationCases(filter),
    refetchInterval: () => (active && documentIsVisible() ? OPERATIONS_POLL_INTERVAL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function platformAdminOperationCasePagesQuery(
  filter: AdminOperationCaseFilter = {},
  polling: OperationsPolling = {},
) {
  const active = polling.active ?? false;
  return infiniteQueryOptions({
    queryKey: adminOperationsKeys.pages(filter),
    queryFn: ({ pageParam }) => fetchAdminOperationCases({
      ...filter,
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: () => (active && documentIsVisible() ? OPERATIONS_POLL_INTERVAL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function platformAdminOperationCaseQuery(caseId: string) {
  return queryOptions({
    queryKey: adminOperationsKeys.detail(caseId),
    queryFn: () => fetchAdminOperationCase(caseId),
  });
}

export function useAcknowledgeAdminOperationCaseMutation() {
  return useMutation({
    mutationKey: adminOperationsKeys.all,
    retry: 0,
    mutationFn: ({ caseId, expectedVersion }: VersionedCaseMutation) =>
      acknowledgeAdminOperationCase(caseId, expectedVersion),
  });
}

export function useSnoozeAdminOperationCaseMutation() {
  return useMutation({
    mutationKey: adminOperationsKeys.all,
    retry: 0,
    mutationFn: ({ caseId, expectedVersion, snoozedUntil }: SnoozeCaseMutation) =>
      snoozeAdminOperationCase(caseId, expectedVersion, snoozedUntil),
  });
}

export function useResolveAdminOperationCaseMutation() {
  return useMutation({
    mutationKey: adminOperationsKeys.all,
    retry: 0,
    mutationFn: ({ caseId, expectedVersion }: VersionedCaseMutation) =>
      resolveAdminOperationCase(caseId, expectedVersion),
  });
}

export function publishAdminOperationCase(client: QueryClient, caseId: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: adminOperationsKeys.lists() }),
    client.invalidateQueries({ queryKey: adminOperationsKeys.detail(caseId), exact: true }),
  ]);
}
