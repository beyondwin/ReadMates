import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminHealthCard } from "@/features/platform-admin/ui/admin-health-card";
import { AdminHealthDeployStrip } from "@/features/platform-admin/ui/admin-health-deploy-strip";

const STALE_AFTER_MS = 30_000;

export function AdminHealthGrid() {
  const query = useQuery(platformAdminHealthSnapshotQuery());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (query.isLoading) return <p className="admin-health-grid__loading">로딩 중...</p>;
  if (query.isError || !query.data) {
    return <p className="admin-health-grid__error">스냅샷을 불러오지 못했습니다.</p>;
  }
  const stripCard = query.data.cards.find((c) => c.id === "deploy_attempts_strip");
  const rest = query.data.cards.filter((c) => c.id !== "deploy_attempts_strip");
  const isStale = query.dataUpdatedAt > 0 && now - query.dataUpdatedAt > STALE_AFTER_MS;

  return (
    <div className="admin-health-grid">
      <div className="admin-health-grid__toolbar" aria-label="Health snapshot controls">
        <div>
          <p className="eyebrow">Snapshot</p>
          <p className="admin-health-grid__timestamp">
            {query.data.schema} · 생성 {formatTimestamp(query.data.generatedAt)}
          </p>
        </div>
        <div className="admin-health-grid__toolbar-actions">
          <span
            className={
              isStale ? "admin-health-grid__stale admin-health-grid__stale--warn" : "admin-health-grid__stale"
            }
          >
            {query.isFetching ? "갱신 중" : isStale ? "30초 이상 경과" : "최신"}
          </span>
          <button
            type="button"
            className="admin-health-grid__refresh"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
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
