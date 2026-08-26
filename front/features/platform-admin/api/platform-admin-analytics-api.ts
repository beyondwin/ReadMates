import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import { parseAdminAnalyticsOverview } from "@/features/platform-admin/api/platform-admin-analytics-contracts";
import {
  analyticsSearchFromWindow,
  type AdminAnalyticsOverview,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";

export function fetchAdminAnalyticsOverview(window: AnalyticsWindow) {
  return readmatesFetch<AdminAnalyticsOverview>(
    `/api/admin/analytics/overview?${analyticsSearchFromWindow(window).toString()}`,
    undefined,
    { clubSlug: undefined },
  ).then(parseAdminAnalyticsOverview);
}

export type AdminAnalyticsExport = {
  blob: Blob;
  filename: string;
};

export async function fetchAdminAnalyticsExport(window: AnalyticsWindow): Promise<AdminAnalyticsExport> {
  const response = await readmatesFetchResponse(
    `/api/admin/analytics/export.csv?${analyticsSearchFromWindow(window).toString()}`,
    undefined,
    { clubSlug: undefined },
  );
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return {
    blob: await response.blob(),
    filename: attachmentFilename(response.headers.get("Content-Disposition"))
      ?? `readmates-admin-analytics-${window}.csv`,
  };
}

function attachmentFilename(contentDisposition: string | null): string | null {
  const match = contentDisposition?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? null;
}
