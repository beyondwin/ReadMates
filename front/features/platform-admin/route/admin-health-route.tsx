import { useQuery } from "@tanstack/react-query";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";

export function AdminHealthRoute() {
  const query = useQuery(platformAdminHealthSnapshotQuery());

  return (
    <section className="admin-health" aria-labelledby="admin-health-title">
      <header className="admin-health__header">
        <h1 id="admin-health-title" className="h1 editorial">Platform Health</h1>
        <p className="admin-health__lede">서비스·큐·AI 가용성·outbox·배포 신호를 한 화면에서 봅니다.</p>
      </header>
      <AdminHealthGrid
        snapshot={query.data ?? null}
        loading={query.isLoading}
        error={query.isError}
        fetching={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
    </section>
  );
}
