import { AdminHealthCard } from "@/features/platform-admin/ui/admin-health-card";
import { AdminHealthDeployStrip } from "@/features/platform-admin/ui/admin-health-deploy-strip";
import type { PlatformHealthSnapshot } from "@/features/platform-admin/model/platform-admin-health-model";

export type AdminHealthGridProps = {
  snapshot: PlatformHealthSnapshot | null;
  loading: boolean;
  error: boolean;
  fetching: boolean;
  stale: boolean;
  onRefresh: () => void;
};

export function AdminHealthGrid({
  snapshot,
  loading,
  error,
  fetching,
  stale,
  onRefresh,
}: AdminHealthGridProps) {
  if (loading) return <p className="admin-health-grid__loading">로딩 중...</p>;
  if (error || !snapshot) {
    return <p className="admin-health-grid__error">스냅샷을 불러오지 못했습니다.</p>;
  }
  const stripCard = snapshot.cards.find((c) => c.id === "deploy_attempts_strip");
  const rest = snapshot.cards.filter((c) => c.id !== "deploy_attempts_strip");

  return (
    <div className="admin-health-grid">
      <div className="admin-health-grid__toolbar" aria-label="Health snapshot controls">
        <div>
          <p className="eyebrow">Snapshot</p>
          <p className="admin-health-grid__timestamp">
            {snapshot.schema} · 생성 {formatTimestamp(snapshot.generatedAt)}
          </p>
        </div>
        <div className="admin-health-grid__toolbar-actions">
          <span
            className={
              stale ? "admin-health-grid__stale admin-health-grid__stale--warn" : "admin-health-grid__stale"
            }
          >
            {fetching ? "갱신 중" : stale ? "30초 이상 경과" : "최신"}
          </span>
          <button
            type="button"
            className="admin-health-grid__refresh"
            disabled={fetching}
            onClick={onRefresh}
          >
            새로고침
          </button>
        </div>
      </div>
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
          {stripCard.deployStrip ? <AdminHealthDeployStrip entries={stripCard.deployStrip} /> : null}
        </section>
      ) : null}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "생성 시각 없음";
  return new Date(timestamp).toLocaleString();
}
