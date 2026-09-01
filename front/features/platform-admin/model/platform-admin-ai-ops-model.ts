import { aiJobInProgressLabel, aiJobStallLabel } from "@/features/platform-admin/model/admin-copy";
import {
  mapAdminSemanticLanguage,
  type AdminSemanticLanguage,
} from "@/features/platform-admin/model/admin-status-language";
import type {
  PlatformAdminAiOpsFilters,
  PlatformAdminAiOpsJob,
  PlatformAdminAiOpsJobListResponse,
  PlatformAdminAiOpsSummaryResponse,
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

export type AiOpsServiceDetail = {
  operatorSentence: string;
  latestObservedAt: string | null;
  nextSafeAction: string;
};

export type AiOpsJobNarrative = {
  operatorSentence: string;
  nextSafeAction: string;
  cleanupSentence: string | null;
};

export function buildAiOpsServiceDetail(
  summary: Pick<
    PlatformAdminAiOpsSummaryResponse,
    "activeJobCount" | "failedLast24h" | "staleCandidateCount"
  > | null,
  jobs: PlatformAdminAiOpsJob[],
): AiOpsServiceDetail {
  const latestObservedAt = latestAiOpsObservation(jobs);
  if (!summary) {
    return {
      operatorSentence: jobs.length > 0
        ? "AI 처리 집계는 확인할 수 없지만 최근 작업 기록은 확인할 수 있습니다."
        : "AI 처리 상태를 확인할 수 없습니다.",
      latestObservedAt,
      nextSafeAction: "잠시 뒤 집계를 다시 확인하고, 표시된 작업은 최근 갱신 시각을 기준으로 판단하세요.",
    };
  }

  const attention: string[] = [];
  if (summary.failedLast24h > 0) {
    attention.push(`최근 24시간 실패 ${summary.failedLast24h}건`);
  }
  if (summary.staleCandidateCount > 0) {
    attention.push(`오래 멈춘 작업 ${summary.staleCandidateCount}건`);
  }
  if (attention.length > 0) {
    return {
      operatorSentence: `${joinKoreanList(attention)}을 먼저 확인하세요.`,
      latestObservedAt,
      nextSafeAction: "실패 원인을 좁힌 뒤 멈춘 작업의 최신 상태와 허용된 복구 방법을 확인하세요.",
    };
  }
  if (summary.activeJobCount > 0) {
    return {
      operatorSentence: `AI 처리 ${summary.activeJobCount}건이 진행 중이며 최근 24시간 실패는 없습니다.`,
      latestObservedAt,
      nextSafeAction: "최근 갱신 시각이 오래되지 않았다면 처리가 끝날 때까지 기다리세요.",
    };
  }
  return {
    operatorSentence: "지금 확인할 AI 처리 이상은 없습니다.",
    latestObservedAt,
    nextSafeAction: "새 이상 신호가 생기기 전에는 별도 조치가 필요하지 않습니다.",
  };
}

export function buildAiOpsJobNarrative(
  job: Pick<
    PlatformAdminAiOpsJob,
    "club" | "status" | "staleCandidate" | "cleanupPending" | "availableActions"
  >,
): AiOpsJobNarrative {
  const club = job.club.name ?? job.club.slug ?? "선택한 클럽";
  const operatorSentence = job.staleCandidate
    ? `${club}의 AI 처리가 오래 멈춰 있습니다.`
    : job.status === "FAILED"
      ? `${club}의 AI 처리가 실패했습니다.`
      : job.status === "SUCCEEDED" || job.status === "COMPLETED"
        ? `${club}의 AI 처리가 완료되었습니다.`
        : `${club}의 AI 처리가 ${aiOpsJobStatusLanguage(job.status).primaryText}입니다.`;
  const nextSafeAction = job.availableActions.includes("RETRY_COMMIT")
    ? "최신 상태를 확인한 뒤 저장 복구를 검토할 수 있습니다."
    : job.availableActions.includes("FORCE_CANCEL")
      ? "최신 상태를 확인한 뒤 강제 취소를 검토할 수 있습니다."
      : "실패 원인과 최근 갱신 시각을 확인하세요.";
  const cleanupSentence = job.cleanupPending == null
    ? null
    : job.cleanupPending
      ? "임시 데이터 정리가 남아 있습니다."
      : "임시 데이터 정리가 끝났습니다.";
  return { operatorSentence, nextSafeAction, cleanupSentence };
}

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

function latestAiOpsObservation(jobs: PlatformAdminAiOpsJob[]): string | null {
  let latest: { value: string; millis: number } | null = null;
  for (const job of jobs) {
    const millis = Date.parse(job.lastUpdatedAt);
    if (Number.isNaN(millis)) continue;
    if (!latest || millis > latest.millis) {
      latest = { value: job.lastUpdatedAt, millis };
    }
  }
  return latest?.value ?? null;
}

function joinKoreanList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")}과 ${parts.at(-1)}`;
}
