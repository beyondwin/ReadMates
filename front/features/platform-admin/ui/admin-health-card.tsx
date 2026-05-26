import { Link } from "react-router-dom";
import type { HealthCard } from "@/features/platform-admin/model/platform-admin-health-model";

const STATUS_LABEL: Record<HealthCard["status"], string> = {
  OK: "정상",
  WARN: "주의",
  CRIT: "위험",
  UNKNOWN: "확인 불가",
};

const STATUS_PILL_CLASS: Record<HealthCard["status"], string> = {
  OK: "admin-health-card__pill admin-health-card__pill--ok",
  WARN: "admin-health-card__pill admin-health-card__pill--warn",
  CRIT: "admin-health-card__pill admin-health-card__pill--crit",
  UNKNOWN: "admin-health-card__pill admin-health-card__pill--unknown",
};

export function AdminHealthCard({ card }: { card: HealthCard }) {
  return (
    <article className="admin-health-card" aria-labelledby={`health-${card.id}`}>
      <header className="admin-health-card__header">
        <h3 id={`health-${card.id}`}>{card.title}</h3>
        <span className={STATUS_PILL_CLASS[card.status]}>{STATUS_LABEL[card.status]}</span>
      </header>
      <div className="admin-health-card__body">
        {card.metric ? (
          <p className="admin-health-card__metric">
            <span className="admin-health-card__metric-value">{formatValue(card.metric.value, card.metric.unit)}</span>
            {card.metric.label ? (
              <span className="admin-health-card__metric-label">{card.metric.label}</span>
            ) : null}
          </p>
        ) : null}
        {card.thresholds ? (
          <p className="admin-health-card__thresholds">
            경고 ≥ {card.thresholds.warn ?? "—"} · 위험 ≥ {card.thresholds.crit ?? "—"}
          </p>
        ) : null}
        {card.reason ? <p className="admin-health-card__reason">{card.reason}</p> : null}
      </div>
      <footer className="admin-health-card__footer">
        <time dateTime={card.lastCheckedAt} className="admin-health-card__time">
          최근 확인 {relativeFromNow(card.lastCheckedAt)}
        </time>
        {card.drill ? (
          <Link to={card.drill.target} className="admin-health-card__drill">
            자세히 →
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (unit === "ratio") return `${(value * 100).toFixed(2)}%`;
  return `${value.toLocaleString()} ${unit}`;
}

function relativeFromNow(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "확인 시각 없음";

  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}분 전`;
  return `${Math.round(seconds / 3600)}시간 전`;
}
