import { useQuery } from "@tanstack/react-query";
import {
  buildAdminAlarmSummary,
  type AdminAlarmSummary,
} from "@/features/platform-admin/model/admin-alarm-summary";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { platformAdminOperationCasesQuery } from "@/features/platform-admin/queries/platform-admin-operations-queries";

export type { AdminAlarmSummary };

const ALARM_OPERATIONS_FILTER = {
  states: ["OPEN", "ACKNOWLEDGED"],
} as const;

export function useAdminAlarmSummary(): {
  summary: AdminAlarmSummary | null;
  state: "ready" | "loading" | "unavailable";
} {
  const operations = useQuery({
    ...platformAdminOperationCasesQuery(ALARM_OPERATIONS_FILTER, { active: true }),
    throwOnError: false,
  });
  const health = useQuery({
    ...platformAdminHealthSnapshotQuery(),
    throwOnError: false,
  });

  if (operations.isError && health.isError) {
    return { summary: null, state: "unavailable" };
  }

  const operationsData = operations.data ?? null;
  const healthData = health.data ?? null;
  if (operationsData == null && healthData == null) {
    const waiting = operations.isPending || health.isPending;
    return { summary: null, state: waiting ? "loading" : "unavailable" };
  }

  return {
    summary: buildAdminAlarmSummary({
      operations: operationsData,
      health: healthData,
    }),
    state: "ready",
  };
}
