import { readmatesFetch } from "@/shared/api/client";
import type {
  AdminOperationCaseDetailResponse,
  AdminOperationCaseFilter,
  AdminOperationCaseMutationResponse,
  AdminOperationCasesResponse,
} from "./platform-admin-operations-contracts";

const OPERATIONS_CASES_PATH = "/api/admin/operations/cases";
const PLATFORM_CONTEXT = { clubSlug: undefined } as const;

function appendListFilter(
  search: URLSearchParams,
  key: "state" | "severity" | "source",
  values: readonly string[] | undefined,
) {
  if (values?.length) {
    search.set(key, values.join(","));
  }
}

function casesPath(filter: AdminOperationCaseFilter) {
  const search = new URLSearchParams();
  appendListFilter(search, "state", filter.states);
  appendListFilter(search, "severity", filter.severities);
  appendListFilter(search, "source", filter.sources);
  if (filter.assignee) search.set("assignee", filter.assignee);
  if (filter.limit !== undefined) search.set("limit", String(filter.limit));
  if (filter.cursor) search.set("cursor", filter.cursor);
  const query = search.toString();
  return query ? `${OPERATIONS_CASES_PATH}?${query}` : OPERATIONS_CASES_PATH;
}

function casePath(caseId: string) {
  return `${OPERATIONS_CASES_PATH}/${encodeURIComponent(caseId)}`;
}

function mutateCase(
  caseId: string,
  action: "acknowledge" | "snooze" | "resolve",
  body: { expectedVersion: number; snoozedUntil?: string },
) {
  return readmatesFetch<AdminOperationCaseMutationResponse>(
    `${casePath(caseId)}/${action}`,
    { method: "POST", body: JSON.stringify(body) },
    PLATFORM_CONTEXT,
  );
}

export function fetchAdminOperationCases(
  filter: AdminOperationCaseFilter = {},
): Promise<AdminOperationCasesResponse> {
  return readmatesFetch<AdminOperationCasesResponse>(casesPath(filter), undefined, PLATFORM_CONTEXT);
}

export function fetchAdminOperationCase(caseId: string): Promise<AdminOperationCaseDetailResponse> {
  return readmatesFetch<AdminOperationCaseDetailResponse>(casePath(caseId), undefined, PLATFORM_CONTEXT);
}

export function acknowledgeAdminOperationCase(
  caseId: string,
  expectedVersion: number,
): Promise<AdminOperationCaseMutationResponse> {
  return mutateCase(caseId, "acknowledge", { expectedVersion });
}

export function snoozeAdminOperationCase(
  caseId: string,
  expectedVersion: number,
  snoozedUntil: string,
): Promise<AdminOperationCaseMutationResponse> {
  return mutateCase(caseId, "snooze", { expectedVersion, snoozedUntil });
}

export function resolveAdminOperationCase(
  caseId: string,
  expectedVersion: number,
): Promise<AdminOperationCaseMutationResponse> {
  return mutateCase(caseId, "resolve", { expectedVersion });
}
