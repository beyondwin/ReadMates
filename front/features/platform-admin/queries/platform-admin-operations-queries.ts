import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
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

function normalizeFilter(filter: AdminOperationCaseFilter = {}) {
  return {
    states: normalizedSet<AdminOperationCaseState>(filter.states),
    severities: normalizedSet<AdminOperationSeverity>(filter.severities),
    sources: normalizedSet<AdminOperationSourceType>(filter.sources),
    assignee: filter.assignee ?? null,
    limit: filter.limit ?? null,
    cursor: filter.cursor ?? null,
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
    [...adminOperationsKeys.lists(), "pages", normalizeFilter(filter)] as const,
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
    initialPageParam: filter.cursor ?? null as string | null,
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
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, expectedVersion }: VersionedCaseMutation) =>
      acknowledgeAdminOperationCase(caseId, expectedVersion),
    onSuccess: (_response, variables) =>
      Promise.all([
        client.invalidateQueries({ queryKey: adminOperationsKeys.lists() }),
        client.invalidateQueries({ queryKey: adminOperationsKeys.detail(variables.caseId), exact: true }),
      ]),
  });
}

export function useSnoozeAdminOperationCaseMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, expectedVersion, snoozedUntil }: SnoozeCaseMutation) =>
      snoozeAdminOperationCase(caseId, expectedVersion, snoozedUntil),
    onSuccess: (_response, variables) =>
      Promise.all([
        client.invalidateQueries({ queryKey: adminOperationsKeys.lists() }),
        client.invalidateQueries({ queryKey: adminOperationsKeys.detail(variables.caseId), exact: true }),
      ]),
  });
}

export function useResolveAdminOperationCaseMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, expectedVersion }: VersionedCaseMutation) =>
      resolveAdminOperationCase(caseId, expectedVersion),
    onSuccess: (_response, variables) =>
      Promise.all([
        client.invalidateQueries({ queryKey: adminOperationsKeys.lists() }),
        client.invalidateQueries({ queryKey: adminOperationsKeys.detail(variables.caseId), exact: true }),
      ]),
  });
}
