import { Link } from "react-router-dom";
import type { AdminStripMetrics } from "@/features/platform-admin/model/admin-status-strip-model";

export type AdminStatusStripProps = {
  metrics: AdminStripMetrics;
  error?: boolean;
};

export function AdminStatusStrip({ metrics, error = false }: AdminStatusStripProps) {
  if (error) {
    return (
      <div className="admin-status-strip admin-status-strip--error" role="alert">
        <span className="admin-status-strip__card">상태를 확인할 수 없습니다 · 재시도</span>
      </div>
    );
  }
  return (
    <div className="admin-status-strip">
      <div className="admin-status-strip__card admin-status-strip__card--role">
        <span className="admin-status-strip__label">플랫폼 역할</span>
        <span className="admin-status-strip__value">{metrics.platformRole}</span>
      </div>
      <CountCard label="조치 필요 클럽" count={metrics.setupRequiredCount} to="/admin/today?filter=setup_required" />
      <CountCard label="공개 준비" count={metrics.readyToPublishCount} to="/admin/today?filter=ready_to_publish" />
      <CountCard label="도메인 조치" count={metrics.domainActionRequiredCount} to="/admin/today?filter=domain_action" />
    </div>
  );
}

function CountCard({ label, count, to }: { label: string; count: number; to: string }) {
  const className = "admin-status-strip__card" + (count >= 1 ? " admin-status-strip__card--highlight" : "");
  return (
    <Link to={to} className={className} aria-label={`${label} ${count}건`}>
      <span className="admin-status-strip__label">{label}</span>
      <span className="admin-status-strip__value">{count}</span>
    </Link>
  );
}
