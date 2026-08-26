import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { fetchAdminAnalyticsExport } from "@/features/platform-admin/api/platform-admin-analytics-api";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  analyticsSearchFromWindow,
  analyticsWindowFromSearchParams,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";
import {
  installPlatformAdminAuthorityLossHandler,
  isPlatformAdminAuthorityLossError,
  platformAdminCapabilitiesQuery,
  purgePlatformAdminState,
  subscribePlatformAdminAuthorityLoss,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminAnalyticsOverviewView } from "@/features/platform-admin/ui/admin-analytics-overview";

const GENERIC_ERROR = "분석 데이터를 처리하지 못했습니다. 다시 시도해 주세요.";

export function AdminAnalyticsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const window = useMemo(() => analyticsWindowFromSearchParams(searchParams), [searchParams]);
  const capabilities = useQuery(platformAdminCapabilitiesQuery()).data ?? null;
  const canView = capabilities !== null && canAdmin(capabilities, "VIEW_ANALYTICS");
  const canExport = capabilities !== null && canAdmin(capabilities, "EXPORT_ANALYTICS");
  const query = useQuery({
    ...platformAdminAnalyticsOverviewQuery(window),
    enabled: canView,
  });

  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
  }, [queryClient]);

  function changeWindow(next: AnalyticsWindow) {
    setSearchParams(analyticsSearchFromWindow(next));
  }

  return (
    <AnalyticsExportSession
      key={canExport ? "export-allowed" : "export-denied"}
      overview={canView ? query.data ?? null : null}
      window={window}
      loading={canView && query.isLoading}
      error={canView && query.isError ? GENERIC_ERROR : null}
      canView={canView}
      canExport={canExport}
      onWindowChange={changeWindow}
    />
  );
}

function AnalyticsExportSession({
  overview,
  window,
  loading,
  error,
  canView,
  canExport,
  onWindowChange,
}: {
  overview: Parameters<typeof AdminAnalyticsOverviewView>[0]["overview"];
  window: AnalyticsWindow;
  loading: boolean;
  error: string | null;
  canView: boolean;
  canExport: boolean;
  onWindowChange: (window: AnalyticsWindow) => void;
}) {
  const queryClient = useQueryClient();
  const [exportStatus, setExportStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const exportGeneration = useRef(0);

  useEffect(() => subscribePlatformAdminAuthorityLoss(() => {
    exportGeneration.current += 1;
    setExportStatus("idle");
  }), []);

  async function exportCsv() {
    if (!canExport) return;
    const generation = exportGeneration.current + 1;
    exportGeneration.current = generation;
    setExportStatus("pending");
    try {
      const exported = await fetchAdminAnalyticsExport(window);
      if (exportGeneration.current !== generation) return;
      const objectUrl = URL.createObjectURL(exported.blob);
      try {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = exported.filename;
        link.click();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      setExportStatus("success");
    } catch (error) {
      if (isPlatformAdminAuthorityLossError(error)) {
        purgePlatformAdminState(queryClient);
        setExportStatus("idle");
        return;
      }
      if (exportGeneration.current !== generation) return;
      setExportStatus("error");
    }
  }

  return (
    <AdminAnalyticsOverviewView
      overview={overview}
      window={window}
      loading={loading}
      error={error}
      canView={canView}
      canExport={canExport}
      onWindowChange={onWindowChange}
      exportStatus={exportStatus}
      onExport={exportCsv}
    />
  );
}
