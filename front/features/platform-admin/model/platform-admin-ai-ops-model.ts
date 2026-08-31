import { aiJobInProgressLabel, aiJobStallLabel } from "@/features/platform-admin/model/admin-copy";
import {
  mapAdminSemanticLanguage,
  type AdminSemanticLanguage,
} from "@/features/platform-admin/model/admin-status-language";
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

const AI_OPS_JOB_STATUS_LABELS = {
  PENDING: "대기 중",
  RUNNING: "진행 중",
  COMMITTING: "저장 중",
  COMMIT_RETRY: "저장 재시도 중",
  SUCCEEDED: "완료",
  COMPLETED: "완료",
  FAILED: "실패",
  CANCELLED: "취소됨",
  CANCELED: "취소됨",
} as const;

const AI_OPS_JOB_STAGE_LABELS = {
  READY: "준비됨",
  GENERATING: "생성 중",
  GENERATING_RECORD: "기록 생성 중",
  GENERATING_HIGHLIGHTS: "하이라이트 생성 중",
  GENERATING_SUMMARY: "요약 생성 중",
  VALIDATING_GROUNDING: "근거 확인 중",
} as const;

export function aiOpsJobStatusLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, AI_OPS_JOB_STATUS_LABELS);
}

export function aiOpsJobStageLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, AI_OPS_JOB_STAGE_LABELS);
}

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

const AI_OPS_IN_PROGRESS_STATUSES = new Set(["PENDING", "RUNNING", "COMMITTING", "COMMIT_RETRY"]);

export function formatAiJobElapsedLabel(
  job: {
    status: string;
    createdAt: string;
    lastUpdatedAt: string;
    staleCandidate: boolean;
  },
  now: Date,
): string | null {
  if (!AI_OPS_IN_PROGRESS_STATUSES.has(job.status)) {
    return null;
  }
  const origin = job.staleCandidate ? job.lastUpdatedAt : job.createdAt;
  const minutes = elapsedMinutes(origin, now);
  if (minutes == null) {
    return null;
  }
  return job.staleCandidate ? aiJobStallLabel(minutes) : aiJobInProgressLabel(minutes);
}

function elapsedMinutes(value: string, now: Date): number | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor((now.getTime() - parsed) / 60_000));
}
