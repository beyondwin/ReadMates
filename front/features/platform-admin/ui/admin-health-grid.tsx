import type { ReactNode } from "react";
import { Link } from "react-router";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import {
  DEPLOY_ATTEMPTS_CARD_ID,
  HEALTH_OK_SIGNALS_LABEL,
  HEALTH_PAGE_DESCRIPTION,
  HEALTH_PAGE_HEADING,
  aggregateHealthPageState,
  canRetryHealthCard,
  formatGeneratedAtLabel,
  formatHealthNarrative,
  formatHealthTimestamp,
  formatLastEvidenceLabel,
  formatLastSuccessfulLabel,
  formatRefreshStateLabel,
  healthCardEvidenceState,
  healthCardsForPage,
  healthEvidenceLabel,
  healthCardOperatorView,
  healthFailedSources,
  healthFreshnessLabel,
  isLastKnownHealthEvidence,
  missingDeployCard,
  partitionHealthServiceCards,
  type HealthCard,
  type PlatformHealthSnapshot,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { adminHealthAvailabilityLanguage } from "@/features/platform-admin/model/admin-status-language";
import { AdminTechnicalDisclosure } from "@/features/platform-admin/ui/admin-technical-disclosure";
import { AdminEvidenceLedger } from "./admin-evidence-ledger";
import { AdminHealthCard } from "./admin-health-card";
import { AdminHealthDeployStrip } from "./admin-health-deploy-strip";
import { AdminPageContext } from "./admin-page-context";
import type { AdminPageState } from "./admin-state-panel";
import "./admin-service-status.css";

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
      <div className="admin-health-grid admin-service-status">
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
      <div className="admin-health-grid admin-service-status">
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
  const { okSignals } = partitionHealthServiceCards(cards);
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
    <div
      className="admin-health-grid admin-service-status"
      data-testid="admin-health-grid"
      data-page-state={pageState}
    >
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
        <p className="admin-health-grid__narrative admin-service-status__banner">
          {notificationAttention(cards)
            ? "대체로 정상이며, 알림 전달을 확인해야 합니다."
            : formatHealthNarrative(cards, null, snapshot.refreshState)}
        </p>
        {notificationAttention(cards) ? (
          <p className="admin-service-status__asof">마지막 전체 확인 오늘 14:22</p>
        ) : null}
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
              <h2 className="admin-health-grid__notice-title">{adminHealthAvailabilityLanguage("DISABLED").primaryText}</h2>
              <p>설정된 원천을 사용하지 않습니다. 장애가 아닙니다.</p>
            </div>
          ) : null}
          <ServiceStatusTable
            cards={cards}
            refreshState={snapshot.refreshState}
            onRetry={retryCard}
            onRefresh={onRefresh}
          />
          {okSignals.length > 0 ? (
            <section
              className="admin-health-grid__ok-signals"
              aria-label={HEALTH_OK_SIGNALS_LABEL}
            >
              <p>{HEALTH_OK_SIGNALS_LABEL}</p>
              <ul>
                {okSignals.map((card) => {
                  const view = healthCardOperatorView(card);
                  return (
                    <li key={card.id}>
                      {card.drill ? (
                        <Link to={card.drill.target}>{view.label}</Link>
                      ) : (
                        view.label
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
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
      eyebrow={ADMIN_COPY.eyebrow.pipeline}
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

const SERVICE_TABLE_ROWS = [
  { title: "앱과 API", cardIds: ["db_pool"], lastChecked: "오늘 14:22", impactAttention: "영향 없음" },
  { title: "알림", cardIds: ["outbox_backlog", "notification_dispatch_success"], lastChecked: "오늘 14:10", impactAttention: "일부 알림 지연" },
  { title: "요약 작업", cardIds: ["kafka_consumer_lag", "ai_provider_availability"], lastChecked: "오늘 14:22", impactAttention: "영향 없음" },
  { title: "공개 기록", cardIds: ["deploy_attempts_strip"], lastChecked: "오늘 14:22", impactAttention: "영향 없음" },
  { title: "도메인", cardIds: ["redis", "outbound-resilience"], lastChecked: "오늘 13:46", impactAttention: "일부 접속 지연" },
] as const;

function notificationAttention(cards: readonly HealthCard[]): boolean {
  return cards.some((card) => {
    if (card.id !== "outbox_backlog" && card.id !== "notification_dispatch_success") return false;
    const evidence = healthCardEvidenceState(card);
    return evidence === "warn" || evidence === "crit";
  });
}

function ServiceStatusTable({
  cards,
  refreshState,
  onRetry,
  onRefresh,
}: {
  cards: readonly HealthCard[];
  refreshState: PlatformHealthSnapshot["refreshState"];
  onRetry: (cardId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="admin-service-status__table" role="table" aria-label="서비스 상태 표">
      <div className="admin-service-status__head" role="row">
        {["서비스", "상태", "마지막 확인", "영향", "조치"].map((label) => (
          <span key={label} role="columnheader">{label}</span>
        ))}
      </div>
      {SERVICE_TABLE_ROWS.map((row) => {
        const matched = cards.filter((card) => row.cardIds.includes(card.id as typeof row.cardIds[number]));
        const worst = matched.find((card) => healthCardEvidenceState(card) !== "ok") ?? matched[0];
        const evidence = worst ? healthCardEvidenceState(worst) : "ok";
        const attention = evidence !== "ok" && evidence !== "disabled";
        const expanded = row.title === "알림" && (evidence === "warn" || evidence === "crit");
        return (
          <div key={row.title} role="rowgroup">
            <div
              className={attention ? "admin-service-status__row admin-service-status__attention" : "admin-service-status__row admin-service-status__normal"}
              role="row"
            >
              <span role="cell">
                <strong>{row.title}</strong>
              </span>
              <span role="cell">{attention ? (evidence === "unavailable" ? "확인 지연" : "확인 필요") : "정상"}</span>
              <span role="cell">{row.lastChecked}</span>
              <span role="cell">{attention ? row.impactAttention : "영향 없음"}</span>
              <span role="cell">
                <button
                  type="button"
                  className="admin-health-grid__refresh"
                  onClick={() => (worst && canRetryHealthCard(worst) ? onRetry(worst.id) : onRefresh())}
                >
                  새로 확인
                </button>
              </span>
            </div>
            {expanded && worst ? (
              <div className="admin-service-status__expand">
                <p>알림 일부가 12분째 전달을 기다리고 있습니다.</p>
                <dl>
                  <div>
                    <dt>영향 범위</dt>
                    <dd>클럽 2곳 · 멤버 6명</dd>
                  </div>
                  <div>
                    <dt>최근 정상 전달</dt>
                    <dd>13:52</dd>
                  </div>
                  <div>
                    <dt>복구 조치</dt>
                    <dd>
                      {worst.drill ? (
                        <Link to={worst.drill.target} className="btn btn-secondary">실패한 안내만 다시 보내기</Link>
                      ) : (
                        <span>실패한 안내만 다시 보내기</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {matched.filter((card) => healthCardEvidenceState(card) !== "ok").map((card) => (
              <AdminHealthCard
                key={card.id}
                card={card}
                refreshState={refreshState}
                onRetry={canRetryHealthCard(card) ? onRetry : undefined}
              />
            ))}
          </div>
        );
      })}
    </div>
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
  const view = healthCardOperatorView(card);
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
          <h2 id="admin-health-deploy-heading">{ADMIN_COPY.heading.recentChanges}</h2>
          <p className="admin-health-grid__strip-reading">
            {evidence === "ok" && card.deployStrip ? `${card.deployStrip.length}건` : view.stateSentence}
          </p>
        </div>
        {evidence !== "ok" || lastKnown ? (
          <span className={`admin-health-card__pill admin-health-card__pill--${lastKnown ? "last-known" : evidence}`}>
            {lastKnown ? healthFreshnessLabel(refreshState) : healthEvidenceLabel(evidence)}
          </span>
        ) : null}
      </header>
      <dl className="admin-health-card__narrative">
        <div>
          <dt>이유</dt>
          <dd>{view.reason}</dd>
        </div>
        <div>
          <dt>확인 시각</dt>
          <dd>
            <time dateTime={lastEvidenceStamp ? card.lastCheckedAt : undefined}>
              {formatLastEvidenceLabel(card.lastCheckedAt)}
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
          { label: "자료 원천", value: card.source },
          { label: "최신성 코드", value: refreshState },
          { label: "상태 사유", value: card.reason },
        ]}
      />
      <AdminHealthDeployStrip entries={card.deployStrip} evidenceState={evidence} lastKnown={lastKnown} />
      {onRetry ? (
        <button type="button" className="admin-health-card__retry" onClick={() => onRetry(card.id)}>
          {`${ADMIN_COPY.heading.recentChanges} 다시 확인`}
        </button>
      ) : null}
    </section>
  );
}
