import type { AdminOperationCase, AdminOperationCasesResponse } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  healthCardEvidenceState,
  type PlatformHealthSnapshot,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { adminOperationSummaryLabel } from "@/features/platform-admin/model/platform-admin-operations-model";

export type AdminAlarmSummary = {
  attention: { count: number; headline: string | null };
  unacknowledged: number;
  serviceState: "ok" | "degraded" | "unknown";
  asOf: string | null;
};

const ATTENTION_STATES = new Set(["OPEN", "ACKNOWLEDGED"]);
const SEVERITY_RANK = ["CRITICAL", "WARNING", "READY", "INFO"] as const;

export function buildAdminAlarmSummary({
  operations,
  health,
}: {
  operations: AdminOperationCasesResponse | null;
  health: PlatformHealthSnapshot | null;
}): AdminAlarmSummary {
  const active = (operations?.items ?? []).filter((item) => ATTENTION_STATES.has(item.state));
  const fromCounts = operations
    ? Math.max(0, operations.counts.open - operations.counts.snoozed)
    : 0;
  const ranked = [...active].sort(compareAttentionCase);
  const top = ranked[0];

  return {
    attention: {
      count: Math.max(active.length, fromCounts),
      headline: top ? adminOperationSummaryLabel(top.summaryCode).title : null,
    },
    unacknowledged: active.filter((item) => item.state === "OPEN").length,
    serviceState: deriveServiceState(health),
    asOf: usableIso(operations?.generatedAt) ?? usableIso(health?.generatedAt),
  };
}

function compareAttentionCase(a: AdminOperationCase, b: AdminOperationCase): number {
  return (
    SEVERITY_RANK.indexOf(a.severity) - SEVERITY_RANK.indexOf(b.severity) ||
    a.id.localeCompare(b.id)
  );
}

function deriveServiceState(
  health: PlatformHealthSnapshot | null,
): AdminAlarmSummary["serviceState"] {
  if (health == null || health.refreshState === "UNAVAILABLE") return "unknown";
  const states = health.cards.map(healthCardEvidenceState);
  if (states.some((state) => state === "warn" || state === "crit")) return "degraded";
  if (states.some((state) => state === "unavailable")) return "unknown";
  return "ok";
}

function usableIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}
