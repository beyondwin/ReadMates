import { Link } from "react-router";
import {
  canRetryHealthCard,
  formatLastEvidenceLabel,
  formatHealthTimestamp,
  healthCardEvidenceState,
  healthDrillLabel,
  healthEvidenceLabel,
  healthFreshnessLabel,
  healthPrimaryReading,
  healthSourceLabel,
  type HealthCard,
  type PlatformHealthRefreshState,
} from "@/features/platform-admin/model/platform-admin-health-model";

export type AdminHealthCardProps = {
  card: HealthCard;
  refreshState?: PlatformHealthRefreshState;
  onRetry?: (cardId: string) => void;
};

export function AdminHealthCard({
  card,
  refreshState = "FRESH",
  onRetry,
}: AdminHealthCardProps) {
  const evidence = healthCardEvidenceState(card);
  const drillLabel = healthDrillLabel(card);
  const lastEvidence = formatLastEvidenceLabel(card.lastCheckedAt);
  const lastEvidenceStamp = formatHealthTimestamp(card.lastCheckedAt);
  const retry = canRetryHealthCard(card) && onRetry;

  return (
    <article
      className={`admin-health-card admin-health-card--${evidence} ${
        evidence === "warn" || evidence === "crit" || evidence === "unavailable"
          ? "admin-health-card--attention"
          : "admin-health-card--compact"
      }`}
      data-evidence={evidence}
      aria-labelledby={`health-${card.id}`}
    >
      <header className="admin-health-card__header">
        <h3 id={`health-${card.id}`}>{card.title}</h3>
        <span className={`admin-health-card__pill admin-health-card__pill--${evidence}`}>
          {healthEvidenceLabel(evidence)}
        </span>
      </header>
      <div className="admin-health-card__body">
        <p className="admin-health-card__metric">
          <span className="admin-health-card__metric-value">{healthPrimaryReading(card)}</span>
          {evidence === "ok" && card.metric?.label ? (
            <span className="admin-health-card__metric-label">{card.metric.label}</span>
          ) : null}
        </p>
        {card.thresholds && evidence !== "disabled" && evidence !== "unavailable" ? (
          <p className="admin-health-card__thresholds">
            경고 ≥ {card.thresholds.warn ?? "—"} · 위험 ≥ {card.thresholds.crit ?? "—"}
          </p>
        ) : null}
        {card.reason && evidence === "unavailable" ? (
          <p className="admin-health-card__reason">{card.reason}</p>
        ) : null}
        <dl className="admin-health-card__meta">
          <div>
            <dt>원천</dt>
            <dd>{healthSourceLabel(card.source)}</dd>
          </div>
          <div>
            <dt>최근 근거</dt>
            <dd>
              <time
                dateTime={lastEvidenceStamp ? card.lastCheckedAt : undefined}
                className="admin-health-card__time"
              >
                {lastEvidence}
              </time>
            </dd>
          </div>
          <div>
            <dt>최신성</dt>
            <dd>{healthFreshnessLabel(refreshState)}</dd>
          </div>
        </dl>
      </div>
      <footer className="admin-health-card__footer">
        {retry ? (
          <button
            type="button"
            className="admin-health-card__retry"
            onClick={() => onRetry(card.id)}
          >
            {`${card.title} 다시 확인`}
          </button>
        ) : null}
        {card.drill && drillLabel ? (
          <Link to={card.drill.target} className="admin-health-card__drill">
            {drillLabel}
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
