import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import {
  DEPLOY_ATTEMPTS_CARD_ID,
  HEALTH_OK_SIGNALS_LABEL,
  HEALTH_PAGE_DESCRIPTION,
  aggregateHealthPageState,
  buildAdminServiceStatusView,
  canRetryHealthCard,
  formatGeneratedAtLabel,
  formatHealthNarrative,
  formatLastEvidenceLabel,
  formatLastSuccessfulLabel,
  formatRefreshStateLabel,
  healthCardEvidenceState,
  healthCardOperatorView,
  healthCardsForPage,
  healthEvidenceLabel,
  healthFailedSources,
  healthFreshnessLabel,
  isLastKnownHealthEvidence,
  missingDeployCard,
  partitionHealthServiceCards,
  type AdminServiceStatusRow,
  type AdminServiceStatusView,
  type HealthCard,
  type PlatformHealthSnapshot,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { adminHealthAvailabilityLanguage } from "@/features/platform-admin/model/admin-status-language";
import { AdminTechnicalDisclosure } from "@/features/platform-admin/ui/admin-technical-disclosure";
import { ReadmatesIcon } from "@/shared/ui/icon";
import { AdminEvidenceLedger } from "./admin-evidence-ledger";
import { AdminHealthCard, AdminHealthStatusMark } from "./admin-health-card";
import { AdminHealthDeployStrip } from "./admin-health-deploy-strip";
import { AdminPageContext } from "./admin-page-context";
import type { AdminPageState } from "./admin-state-panel";
import "./admin-service-status.css";

export type { AdminServiceStatusRow, AdminServiceStatusView };

export type AdminHealthGridProps = {
  snapshot: PlatformHealthSnapshot | null;
  loading: boolean;
  error: boolean;
  fetching: boolean;
  onRefresh: () => void;
  onRetryCard?: (cardId: string) => void;
  statusView?: AdminServiceStatusView;
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
  statusView,
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
  const view = statusView ?? buildAdminServiceStatusView(snapshot);

  return (
    <section
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
      >
        <p className="admin-health-grid__narrative">{formatHealthNarrative(cards, null, snapshot.refreshState)}</p>
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
            view={view}
            cards={cards}
            refreshState={snapshot.refreshState}
            fetching={fetching}
            onRecheck={onRefresh}
            onRetry={retryCard}
          />
          {okSignals.length > 0 ? (
            <section
              className="admin-health-grid__ok-signals"
              aria-label={HEALTH_OK_SIGNALS_LABEL}
            >
              <p>{HEALTH_OK_SIGNALS_LABEL}</p>
              <ul>
                {okSignals.map((card) => {
                  const operator = healthCardOperatorView(card);
                  return (
                    <li key={card.id}>
                      {card.drill ? (
                        <Link to={card.drill.target}>{operator.label}</Link>
                      ) : (
                        operator.label
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <DeployTechnicalFooter
            card={deployCard}
            refreshState={snapshot.refreshState}
            onRetry={canRetryHealthCard(deployCard) ? retryCard : undefined}
          />
        </AdminEvidenceLedger>
      </HealthPage>
    </section>
  );
}

function HealthPage({
  freshness,
  scope,
  children,
}: {
  freshness?: ReactNode;
  scope?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminPageContext
      eyebrow={ADMIN_COPY.eyebrow.pipeline}
      description={HEALTH_PAGE_DESCRIPTION}
      freshness={freshness}
      scope={scope}
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

function ServiceStatusTable({
  view,
  cards,
  refreshState,
  fetching,
  onRecheck,
  onRetry,
}: {
  view: AdminServiceStatusView;
  cards: readonly HealthCard[];
  refreshState: PlatformHealthSnapshot["refreshState"];
  fetching: boolean;
  onRecheck: () => void;
  onRetry: (cardId: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null | undefined>(undefined);
  const openId = expandedId === undefined ? view.defaultExpandedId : expandedId;

  return (
    <table>
      <caption className="rm-sr-only">서비스 상태</caption>
      <thead>
        <tr>
          <th scope="col">서비스</th>
          <th scope="col">상태</th>
          <th scope="col">마지막 확인</th>
          <th scope="col">영향</th>
          <th scope="col">조치</th>
          <th scope="col" />
        </tr>
      </thead>
      <tbody>
        {view.rows.map((row) => {
          const expanded = openId === row.id;
          const matched = cards.filter((card) => row.cardIds.includes(card.id));
          return (
            <ServiceStatusRowGroup
              key={row.id}
              row={row}
              expanded={expanded}
              matched={matched}
              refreshState={refreshState}
              fetching={fetching}
              onRecheck={onRecheck}
              onRetry={onRetry}
              onToggle={() => {
                setExpandedId((current) => {
                  const open = current === undefined ? view.defaultExpandedId : current;
                  return open === row.id ? null : row.id;
                });
              }}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function ServiceStatusRowGroup({
  row,
  expanded,
  matched,
  refreshState,
  fetching,
  onRecheck,
  onRetry,
  onToggle,
}: {
  row: AdminServiceStatusRow;
  expanded: boolean;
  matched: readonly HealthCard[];
  refreshState: PlatformHealthSnapshot["refreshState"];
  fetching: boolean;
  onRecheck: () => void;
  onRetry: (cardId: string) => void;
  onToggle: () => void;
}) {
  const deviationCards = matched.filter((card) => healthCardEvidenceState(card) !== "ok");
  return (
    <>
      <tr
        className={
          row.attention
            ? "admin-service-status__row admin-service-status__attention"
            : "admin-service-status__row admin-service-status__normal"
        }
        tabIndex={0}
      >
        <td>{row.title}</td>
        <td>
          <AdminHealthStatusMark attention={row.attention} label={row.statusLabel} />
        </td>
        <td>{row.lastChecked}</td>
        <td>{row.impactLabel}</td>
        <td>
          <button
            type="button"
            className="admin-service-status__recheck"
            disabled={fetching}
            onClick={onRecheck}
          >
            {fetching ? "요청 중" : "새로 확인"}
          </button>
        </td>
        <td>
          <button
            type="button"
            className="admin-service-status__toggle"
            aria-expanded={expanded}
            aria-label={expanded ? `${row.title} 상세 접기` : `${row.title} 상세 펼치기`}
            onClick={onToggle}
          >
            <ReadmatesIcon name="chevron-down" size={16} />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="admin-service-status__expanded">
          <td colSpan={6}>
            <div>
              <p>
                {row.attention ? <ReadmatesIcon name="alert-circle-filled" size={20} /> : null}
                {row.summary}
              </p>
              <dl className="admin-service-status__facts">
                <div>
                  <dt>영향 범위</dt>
                  <dd>{row.impactScope}</dd>
                </div>
                <div>
                  <dt>최근 정상 전달</dt>
                  <dd>{row.lastOkDelivery}</dd>
                </div>
                {row.recoveryLabel ? (
                  <div>
                    <dt>복구 조치</dt>
                    <dd>
                      {row.recoveryHref ? (
                        <Link to={row.recoveryHref} className="btn btn-secondary">{row.recoveryLabel}</Link>
                      ) : (
                        <span>{row.recoveryLabel}</span>
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {deviationCards.map((card) => (
                <AdminHealthCard
                  key={card.id}
                  card={card}
                  refreshState={refreshState}
                  onRetry={canRetryHealthCard(card) ? onRetry : undefined}
                />
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ledgerStateFor(pageState: ReturnType<typeof aggregateHealthPageState>): AdminPageState {
  if (pageState === "partial" || pageState === "unavailable") return "partial";
  return "ready";
}

function DeployTechnicalFooter({
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
  const lastKnown = isLastKnownHealthEvidence(evidence, refreshState);

  return (
    <footer className={`admin-health-grid__strip admin-health-grid__strip--${evidence}`} data-evidence={evidence}>
      <AdminTechnicalDisclosure
        summary="기술 정보 펼치기"
        items={[
          { label: "원천 ID", value: card.id },
          { label: "원천 제목", value: card.title },
          { label: "상태 코드", value: card.status },
          { label: "자료 원천", value: card.source },
          { label: "최신성 코드", value: refreshState },
          { label: "상태 사유", value: card.reason },
          { label: "이유", value: view.reason },
          { label: "확인 시각", value: formatLastEvidenceLabel(card.lastCheckedAt) },
          { label: "영향", value: evidence !== "ok" && evidence !== "disabled" ? view.impact : null },
          { label: "다음 확인", value: evidence !== "ok" && evidence !== "disabled" ? view.nextAction : null },
          { label: "배포 건수", value: evidence === "ok" && card.deployStrip ? `${card.deployStrip.length}건` : view.stateSentence },
        ]}
      >
        {evidence !== "ok" || lastKnown ? (
          <span className={`admin-health-card__pill admin-health-card__pill--${lastKnown ? "last-known" : evidence}`}>
            {lastKnown ? healthFreshnessLabel(refreshState) : healthEvidenceLabel(evidence)}
          </span>
        ) : null}
        <AdminHealthDeployStrip entries={card.deployStrip} evidenceState={evidence} lastKnown={lastKnown} />
        {onRetry ? (
          <button type="button" className="admin-health-card__retry" onClick={() => onRetry(card.id)}>
            {`${view.label} 다시 확인`}
          </button>
        ) : null}
      </AdminTechnicalDisclosure>
    </footer>
  );
}
