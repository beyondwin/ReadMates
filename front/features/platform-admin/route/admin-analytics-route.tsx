import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { fetchAdminAnalyticsExport } from "@/features/platform-admin/api/platform-admin-analytics-api";
import {
  analyticsSearchFromWindow,
  analyticsWindowFromSearchParams,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";
import { AdminAnalyticsOverviewView } from "@/features/platform-admin/ui/admin-analytics-overview";

const GENERIC_ERROR = "분석 데이터를 처리하지 못했습니다. 다시 시도해 주세요.";

export function AdminAnalyticsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const window = useMemo(() => analyticsWindowFromSearchParams(searchParams), [searchParams]);
  const query = useQuery(platformAdminAnalyticsOverviewQuery(window));
  const [exportStatus, setExportStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  function changeWindow(next: AnalyticsWindow) {
    setSearchParams(analyticsSearchFromWindow(next));
    setExportStatus("idle");
  }

  async function exportCsv() {
    setExportStatus("pending");
    try {
      const exported = await fetchAdminAnalyticsExport(window);
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
    } catch {
      setExportStatus("error");
    }
  }

  return (
    <AdminAnalyticsOverviewView
      overview={query.data ?? null}
      window={window}
      loading={query.isLoading}
      error={query.isError ? GENERIC_ERROR : null}
      onWindowChange={changeWindow}
      exportStatus={exportStatus}
      onExport={exportCsv}
    />
  );
}
