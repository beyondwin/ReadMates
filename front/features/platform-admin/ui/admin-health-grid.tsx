import type { ReactNode } from "react";
import { AdminHealthCard } from "./admin-health-card";
import { AdminHealthDeployStrip } from "./admin-health-deploy-strip";
import { AdminEvidenceLedger } from "./admin-evidence-ledger";
import { AdminPageContext } from "./admin-page-context";
import type { AdminPageState } from "./admin-state-panel";
import {
  DEPLOY_ATTEMPTS_CARD_ID,
  HEALTH_PAGE_DESCRIPTION,
  HEALTH_PAGE_HEADING,
  aggregateHealthPageState,
  canRetryHealthCard,
  formatGeneratedAtLabel,
  formatHealthTimestamp,
  formatLastEvidenceLabel,
  formatLastSuccessfulLabel,
  formatRefreshStateLabel,
  healthCardEvidenceState,
  healthCardsForPage,
  healthEvidenceLabel,
  healthFailedSources,
  healthFreshnessLabel,
  healthSourceLabel,
  isLastKnownHealthEvidence,
  missingDeployCard,
  type HealthCard,
  type PlatformHealthSnapshot,
} from "@/features/platform-admin/model/platform-admin-health-model";

export type AdminHealthGridProps = {
  snapshot: PlatformHealthSnapshot | null;
  loading: boolean;
  error: boolean;
  fetching: boolean;
  onRefresh: () => void;
  onRetryCard?: (cardId: string) => void;
};

const SKELETON_CARD_COUNT = 6;
const EVIDENCE_LEDGER_LABEL = "서비스 신호";

export function AdminHealthGrid({
  snapshot,
  loading,
  error,
  fetching,
  onRefresh,
  onRetryCard,
}: AdminHealthGridProps) {
  if (loading) {
    return (
      <div className="admin-health-grid">
        <HealthPage>
          <AdminEvidenceLedger
            label={EVIDENCE_LEDGER_LABEL}
            state="loading"
            title="서비스 건강을 불러오는 중입니다."
            description=""
          >
            <div
              className="admin-health-grid__cards"
              data-testid="admin-health-skeleton"
              aria-hidden="true"
            >
              {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
                <div key={index} className="admin-health-card admin-health-card--skeleton" />
              ))}
            </div>
          </AdminEvidenceLedger>
        </HealthPage>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="admin-health-grid">
        <HealthPage>
          <AdminEvidenceLedger
            label={EVIDENCE_LEDGER_LABEL}
            state="unavailable"
            title="스냅샷을 불러오지 못했습니다"
            description="잠시 후 다시 시도해 주세요."
            action={
              <button type="button" className="btn btn-primary" onClick={onRefresh}>
                다시 시도
              </button>
            }
          />
        </HealthPage>
      </div>
    );
  }

  const cards = healthCardsForPage(snapshot);
  const pageState = aggregateHealthPageState(cards);
  const serviceCards = cards.filter((card) => card.id !== DEPLOY_ATTEMPTS_CARD_ID);
  const deployCard = cards.find((card) => card.id === DEPLOY_ATTEMPTS_CARD_ID) ?? missingDeployCard();
  const failedSources = healthFailedSources(cards);
  const ledgerState = ledgerStateFor(pageState);
  const staleWarn =
    snapshot.refreshState === "STALE" || snapshot.refreshState === "UNAVAILABLE";
  const retryCard = (cardId: string) => {
    if (onRetryCard) onRetryCard(cardId);
    else onRefresh();
  };

  return (
    <div className="admin-health-grid" data-testid="admin-health-grid" data-page-state={pageState}>
      <HealthPage
        freshness={
          <span
            aria-live="polite"
            className={
              staleWarn
                ? "admin-health-grid__stale admin-health-grid__stale--warn"
                : "admin-health-grid__stale"
            }
          >
            {formatRefreshStateLabel(snapshot)}
          </span>
        }
        scope={<HealthScope snapshot={snapshot} />}
        action={
          <button
            type="button"
            className="admin-health-grid__refresh"
            disabled={fetching}
            onClick={onRefresh}
          >
            {fetching ? "요청 중" : "새로고침"}
          </button>
        }
      >
        <AdminEvidenceLedger
          label={EVIDENCE_LEDGER_LABEL}
          state={ledgerState}
          title={
            pageState === "unavailable"
              ? "지금은 확인할 수 없습니다"
              : undefined
          }
          description={
            pageState === "unavailable"
              ? "모든 원천을 확인하지 못했습니다. 카드별 근거는 아래에 남아 있습니다."
              : undefined
          }
          sources={pageState === "partial" || pageState === "unavailable" ? failedSources : undefined}
        >
          {pageState === "disabled" ? (
            <div className="admin-health-grid__notice" role="status">
              <h2 className="admin-health-grid__notice-title">비활성 구성</h2>
              <p>설정된 원천이 꺼져 있습니다. 장애가 아닙니다.</p>
            </div>
          ) : null}
          <div className="admin-health-grid__cards">
            {serviceCards.map((card) => (
              <AdminHealthCard
                key={card.id}
                card={card}
                refreshState={snapshot.refreshState}
                onRetry={canRetryHealthCard(card) ? retryCard : undefined}
              />
            ))}
          </div>
          <DeployEvidence
            card={deployCard}
            refreshState={snapshot.refreshState}
            onRetry={canRetryHealthCard(deployCard) ? retryCard : undefined}
          />
        </AdminEvidenceLedger>
      </HealthPage>
    </div>
  );
}

function HealthPage({
  freshness,
  scope,
  action,
  children,
}: {
  freshness?: ReactNode;
  scope?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminPageContext
      eyebrow="서비스"
      heading={HEALTH_PAGE_HEADING}
      description={HEALTH_PAGE_DESCRIPTION}
      freshness={freshness}
      scope={scope}
      action={action}
    >
      {children}
    </AdminPageContext>
  );
}

function HealthScope({ snapshot }: { snapshot: PlatformHealthSnapshot }) {
  return (
    <>
      <time dateTime={snapshot.generatedAt}>{formatGeneratedAtLabel(snapshot.generatedAt)}</time>
      {snapshot.lastSuccessfulAt ? (
        <>
          <span aria-hidden="true"> · </span>
          <time dateTime={snapshot.lastSuccessfulAt}>
            {formatLastSuccessfulLabel(snapshot.lastSuccessfulAt)}
          </time>
        </>
      ) : (
        <span> · 마지막 정상 갱신 이력 없음</span>
      )}
    </>
  );
}

function ledgerStateFor(pageState: ReturnType<typeof aggregateHealthPageState>): AdminPageState {
  if (pageState === "partial" || pageState === "unavailable") return "partial";
  return "ready";
}

function DeployEvidence({
  card,
  refreshState,
  onRetry,
}: {
  card: HealthCard;
  refreshState: PlatformHealthSnapshot["refreshState"];
  onRetry?: (cardId: string) => void;
}) {
  const evidence = healthCardEvidenceState(card);
  const lastEvidenceStamp = formatHealthTimestamp(card.lastCheckedAt);
  const lastKnown = isLastKnownHealthEvidence(evidence, refreshState);

  return (
    <section
      className={`admin-health-grid__strip admin-health-grid__strip--${evidence}`}
      data-evidence={evidence}
      aria-labelledby="admin-health-deploy-heading"
    >
      <header className="admin-health-grid__strip-header">
        <div>
          <h2 id="admin-health-deploy-heading">최근 deploy</h2>
          <p className="admin-health-grid__strip-reading">
            {evidence === "ok" && card.deployStrip ? `${card.deployStrip.length}건` : healthEvidenceLabel(evidence)}
          </p>
        </div>
        <span className={`admin-health-card__pill admin-health-card__pill--${lastKnown ? "last-known" : evidence}`}>
          {healthEvidenceLabel(evidence)}
        </span>
      </header>
      <dl className="admin-health-card__meta">
        <div>
          <dt>원천</dt>
          <dd>{healthSourceLabel(card.source)}</dd>
        </div>
        <div>
          <dt>최근 근거</dt>
          <dd>
            <time dateTime={lastEvidenceStamp ? card.lastCheckedAt : undefined}>
              {formatLastEvidenceLabel(card.lastCheckedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>최신성</dt>
          <dd>{healthFreshnessLabel(refreshState)}</dd>
        </div>
      </dl>
      {card.reason && evidence === "unavailable" ? <p>{card.reason}</p> : null}
      <AdminHealthDeployStrip entries={card.deployStrip} evidenceState={evidence} lastKnown={lastKnown} />
      {onRetry ? (
        <button type="button" className="admin-health-card__retry" onClick={() => onRetry(card.id)}>
          최근 deploy 다시 확인
        </button>
      ) : null}
    </section>
  );
}
