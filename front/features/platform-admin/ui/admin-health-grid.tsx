import { AdminHealthCard } from "@/features/platform-admin/ui/admin-health-card";
import { AdminHealthDeployStrip } from "@/features/platform-admin/ui/admin-health-deploy-strip";
import type { PlatformHealthSnapshot } from "@/features/platform-admin/model/platform-admin-health-model";

export type AdminHealthGridProps = {
  snapshot: PlatformHealthSnapshot | null;
  loading: boolean;
  error: boolean;
  fetching: boolean;
  onRefresh: () => void;
};

export function AdminHealthGrid({
  snapshot,
  loading,
  error,
  fetching,
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
            {snapshot.lastSuccessfulAt
              ? ` · 정상 갱신 ${formatTimestamp(snapshot.lastSuccessfulAt)}`
              : null}
          </p>
        </div>
        <div className="admin-health-grid__toolbar-actions">
          <span
            aria-live="polite"
            className={
              snapshot.refreshState === "STALE" || snapshot.refreshState === "UNAVAILABLE"
                ? "admin-health-grid__stale admin-health-grid__stale--warn"
                : "admin-health-grid__stale"
            }
          >
            {formatRefreshState(snapshot)}
          </span>
          <button
            type="button"
            className="admin-health-grid__refresh"
            disabled={fetching}
            onClick={onRefresh}
          >
            {fetching ? "요청 중" : "새로고침"}
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

function formatRefreshState(snapshot: PlatformHealthSnapshot): string {
  switch (snapshot.refreshState) {
    case "FRESH":
      return "정상 갱신 완료";
    case "REFRESHING":
      return "서버에서 갱신 중";
    case "STALE":
      return `마지막 정상 갱신 ${formatAge(snapshot.staleAgeSeconds)} 전`;
    case "UNAVAILABLE":
      return "정상 갱신 이력 없음";
  }
}

function formatAge(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes === 0) return `${remainingSeconds}초`;
  if (remainingSeconds === 0) return `${minutes}분`;
  return `${minutes}분 ${remainingSeconds}초`;
}

function formatTimestamp(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "생성 시각 없음";
  return new Date(timestamp).toLocaleString();
}
