import { useQuery } from "@tanstack/react-query";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";

export function AdminHealthRoute() {
  const query = useQuery(platformAdminHealthSnapshotQuery());

  return (
    <AdminHealthGrid
      snapshot={query.data ?? null}
      loading={query.isLoading}
      error={query.isError}
      fetching={query.isFetching}
      onRefresh={() => void query.refetch()}
      onRetryCard={() => void query.refetch()}
    />
  );
}
