import { useQuery } from "@tanstack/react-query";
import {
  HEALTH_PAGE_DESCRIPTION,
  HEALTH_PAGE_HEADING,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";
import { AdminPageFrame } from "@/features/platform-admin/ui/admin-page-frame";

export function AdminHealthRoute() {
  const query = useQuery(platformAdminHealthSnapshotQuery());

  return (
    <AdminPageFrame heading={HEALTH_PAGE_HEADING} description={HEALTH_PAGE_DESCRIPTION}>
      <AdminHealthGrid
        snapshot={query.data ?? null}
        loading={query.isLoading}
        error={query.isError}
        fetching={query.isFetching}
        onRefresh={() => void query.refetch()}
        onRetryCard={() => void query.refetch()}
      />
    </AdminPageFrame>
  );
}
