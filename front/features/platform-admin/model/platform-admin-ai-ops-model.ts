import type {
  PlatformAdminAiOpsFilters,
  PlatformAdminAiOpsJob,
  PlatformAdminAiOpsJobListResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";

export type AiOpsJobFilter = {
  errorCode: string | null;
  clubId: string | null;
  jobId: string | null;
};

export const EMPTY_AI_OPS_FILTER: AiOpsJobFilter = { errorCode: null, clubId: null, jobId: null };

export function aiOpsFilterFromSearchParams(params: URLSearchParams): AiOpsJobFilter {
  return {
    errorCode: params.get("errorCode") || null,
    clubId: params.get("clubId") || null,
    jobId: params.get("jobId") || null,
  };
}

export function aiOpsSearchFromFilter(filter: AiOpsJobFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.errorCode) {
    params.set("errorCode", filter.errorCode);
  }
  if (filter.clubId) {
    params.set("clubId", filter.clubId);
  }
  if (filter.jobId) {
    params.set("jobId", filter.jobId);
  }
  return params;
}

export function aiOpsPathFromFilter(filter: AiOpsJobFilter): string {
  const search = aiOpsSearchFromFilter(filter).toString();
  return search ? `/admin/ai-ops?${search}` : "/admin/ai-ops";
}

export function hasActiveAiOpsFilter(filter: AiOpsJobFilter): boolean {
  return Boolean(filter.errorCode || filter.clubId);
}

export function aiOpsFilterToQuery(filter: AiOpsJobFilter): PlatformAdminAiOpsFilters {
  const query: PlatformAdminAiOpsFilters = {};
  if (filter.errorCode) {
    query.errorCode = filter.errorCode;
  }
  if (filter.clubId) {
    query.clubId = filter.clubId;
  }
  return query;
}

export type AiOpsCostWindow = "7d" | "30d" | "90d";

export const AI_OPS_COST_WINDOWS: AiOpsCostWindow[] = ["7d", "30d", "90d"];

export const AI_OPS_DEFAULT_WINDOW: AiOpsCostWindow = "30d";

export function aiOpsWindowFromSearchParams(params: URLSearchParams): AiOpsCostWindow {
  const raw = params.get("window");
  return AI_OPS_COST_WINDOWS.includes(raw as AiOpsCostWindow) ? (raw as AiOpsCostWindow) : AI_OPS_DEFAULT_WINDOW;
}

export function mergeAiOpsJobPages(pages: PlatformAdminAiOpsJobListResponse[]): PlatformAdminAiOpsJob[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.items).filter((job) => {
    if (seen.has(job.jobId)) {
      return false;
    }
    seen.add(job.jobId);
    return true;
  });
}

export type AiOpsErrorClassification = {
  kind: "DISABLED" | "UNAVAILABLE" | "CONFLICT" | "UNKNOWN";
  status: number | null;
  code: string | null;
  message: string;
};

export function classifyAiOpsError(error: unknown): AiOpsErrorClassification {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const status = typeof record?.status === "number" ? record.status : null;
  const code = typeof record?.code === "string" ? record.code : null;
  const message = error instanceof Error ? error.message : "AI 작업 상태를 확인하지 못했습니다.";
  const kind =
    status === 404
      ? "DISABLED"
      : status !== null && status >= 500
        ? "UNAVAILABLE"
        : status === 409
          ? "CONFLICT"
          : "UNKNOWN";
  return { kind, status, code, message };
}
