import { Link } from "react-router";
import {
  canRetryHealthCard,
  formatLastEvidenceLabel,
  formatHealthTimestamp,
  healthCardEvidenceState,
  healthCardOperatorView,
  healthDrillLabel,
  healthEvidenceLabel,
  healthFreshnessLabel,
  healthPrimaryReading,
  isLastKnownHealthEvidence,
  type HealthCard,
  type PlatformHealthRefreshState,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { AdminTechnicalDisclosure } from "@/features/platform-admin/ui/admin-technical-disclosure";

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
  const view = healthCardOperatorView(card);
  const drillLabel = healthDrillLabel(card);
  const lastEvidence = formatLastEvidenceLabel(card.lastCheckedAt);
  const lastEvidenceStamp = formatHealthTimestamp(card.lastCheckedAt);
  const lastKnown = isLastKnownHealthEvidence(evidence, refreshState);
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
        <div>
          <h3 id={`health-${card.id}`}>{view.label}</h3>
          <p className="admin-health-card__state-sentence">{view.stateSentence}</p>
        </div>
        <span
          className={`admin-health-card__pill admin-health-card__pill--${lastKnown ? "last-known" : evidence}`}
        >
          {lastKnown ? healthFreshnessLabel(refreshState) : healthEvidenceLabel(evidence)}
        </span>
      </header>
      <div className="admin-health-card__body">
        <dl className="admin-health-card__narrative">
          <div>
            <dt>이유</dt>
            <dd>{view.reason}</dd>
          </div>
          <div>
            <dt>확인 시각</dt>
            <dd>
              <time
                dateTime={lastEvidenceStamp ? card.lastCheckedAt : undefined}
                className="admin-health-card__time"
              >
                {lastEvidence}
              </time>
            </dd>
          </div>
          {view.impact && evidence !== "ok" && evidence !== "disabled" ? (
            <div>
              <dt>영향</dt>
              <dd>{view.impact}</dd>
            </div>
          ) : null}
          {view.nextAction && evidence !== "ok" && evidence !== "disabled" ? (
            <div>
              <dt>다음 확인</dt>
              <dd>{view.nextAction}</dd>
            </div>
          ) : null}
        </dl>
        <AdminTechnicalDisclosure
          items={[
            { label: "원천 ID", value: card.id },
            { label: "원천 제목", value: card.title },
            { label: "상태 코드", value: card.status },
            { label: "관측값", value: healthPrimaryReading(card) },
            { label: "관측 라벨", value: card.metric?.label },
            { label: "주의 기준", value: formatThreshold(card.thresholds?.warn) },
            { label: "위험 기준", value: formatThreshold(card.thresholds?.crit) },
            { label: "자료 원천", value: card.source },
            { label: "상태 사유", value: card.reason },
          ]}
        />
      </div>
      <footer className="admin-health-card__footer">
        {retry ? (
          <button
            type="button"
            className="admin-health-card__retry"
            onClick={() => onRetry(card.id)}
          >
            {`${view.label} 다시 확인`}
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

function formatThreshold(value: number | null | undefined): string | null {
  return value == null || Number.isNaN(value) ? null : String(value);
}
