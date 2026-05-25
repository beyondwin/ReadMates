import { useQuery } from "@tanstack/react-query";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminHealthCard } from "@/features/platform-admin/ui/admin-health-card";
import { AdminHealthDeployStrip } from "@/features/platform-admin/ui/admin-health-deploy-strip";

export function AdminHealthGrid() {
  const query = useQuery(platformAdminHealthSnapshotQuery());
  if (query.isLoading) return <p className="admin-health-grid__loading">로딩 중…</p>;
  if (query.isError || !query.data) {
    return <p className="admin-health-grid__error">스냅샷을 불러오지 못했습니다.</p>;
  }
  const stripCard = query.data.cards.find((c) => c.id === "deploy_attempts_strip");
  const rest = query.data.cards.filter((c) => c.id !== "deploy_attempts_strip");
  return (
    <div className="admin-health-grid">
      <div className="admin-health-grid__cards">
        {rest.map((card) => (
          <AdminHealthCard key={card.id} card={card} />
        ))}
      </div>
      {stripCard ? (
        <section className="admin-health-grid__strip" aria-label="최근 deploy">
          <header className="admin-health-grid__strip-header">
            <h2>최근 deploy</h2>
            {stripCard.reason ? <p>{stripCard.reason}</p> : null}
          </header>
          {stripCard.deploy_strip ? <AdminHealthDeployStrip entries={stripCard.deploy_strip} /> : null}
        </section>
      ) : null}
    </div>
  );
}
