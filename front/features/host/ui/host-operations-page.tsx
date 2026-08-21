import { ClubAiDefaultsSection } from "@/features/host/club/ui/ClubAiDefaultsSection";
import type { HostNotificationSummary } from "@/features/host/model/host-view-types";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";
import { HostClubOperationsCard } from "@/features/host/ui/host-club-operations-card";
import { HostSessionAttentionSummary } from "@/features/host/ui/host-session-ledger";
import type { HostLinkComponent, HostLinkProps } from "@/features/host/ui/host-link-types";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { nonNegativeCount } from "@/shared/ui/readmates-display";

export type HostOperationsAttentionState = {
  items: HostSessionLedgerItem[];
  totalCount: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  isRefreshing: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
};

export type HostOperationsCardState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  isRefreshing: boolean;
  onRetry: () => void;
};

function DefaultLink({ to, children, ...props }: HostLinkProps) {
  return <a {...props} href={to}>{children}</a>;
}

function CardStatus({
  loadingLabel,
  error,
  isRefreshing,
  refreshingLabel,
  onRetry,
  retryLabel,
}: {
  loadingLabel?: string | null;
  error: string | null;
  isRefreshing: boolean;
  refreshingLabel: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <>
      {loadingLabel ? <p className="small" role="status">{loadingLabel}</p> : null}
      {isRefreshing ? <p className="small" role="status">{refreshingLabel}</p> : null}
      {error ? (
        <div className="rm-host-ledger__error" role="alert">
          <span>{error}</span>
          {onRetry && retryLabel ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              {retryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function HostOperationsPage({
  clubSlug,
  LinkComponent = DefaultLink,
  attention,
  clubReadiness,
  notifications,
}: {
  clubSlug: string;
  LinkComponent?: HostLinkComponent;
  attention: HostOperationsAttentionState;
  clubReadiness: HostOperationsCardState<HostClubOperationsSnapshot>;
  notifications: HostOperationsCardState<HostNotificationSummary>;
}) {
  return (
    <main className="rm-meeting-ledger">
      <header className="page-header-compact">
        <div className="container">
          <div className="eyebrow">운영 장부</div>
          <h1 className="h1 editorial" style={{ margin: "6px 0 0" }}>운영 허브</h1>
        </div>
      </header>
      <div
        className="container"
        style={{ display: "grid", gap: 28, minWidth: 0, paddingTop: 8, paddingBottom: 72 }}
      >
        <section aria-labelledby="host-operations-attention-title">
          <h2 id="host-operations-attention-title" style={{ margin: 0 }}>확인 필요</h2>
          {attention.totalCount > 0 ? (
            <p className="small" style={{ margin: "8px 0 12px", color: "var(--text-2)" }}>
              확인 필요 {attention.totalCount}건
            </p>
          ) : (
            <p className="small" style={{ margin: "8px 0 12px", color: "var(--text-2)" }}>
              지금 처리할 모임은 없습니다.
            </p>
          )}
          <CardStatus
            loadingLabel={attention.loading ? "확인 필요 목록을 불러오는 중" : null}
            error={attention.error}
            isRefreshing={attention.isRefreshing}
            refreshingLabel="확인 필요 목록을 다시 확인하는 중"
            onRetry={attention.onRetry}
            retryLabel="다시 시도"
          />
          {!attention.loading ? (
            <HostSessionAttentionSummary
              page={{
                items: attention.items,
                summary: {
                  needsAttentionCount: attention.totalCount,
                  incompletePublishedCount: 0,
                  draftCount: 0,
                },
              }}
              maxItems={Math.max(attention.items.length, 1)}
              hideEmpty
              LinkComponent={LinkComponent}
            />
          ) : null}
          {attention.hasMore ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={attention.loadingMore}
              onClick={attention.onLoadMore}
            >
              {attention.loadingMore ? "불러오는 중" : "더 보기"}
            </button>
          ) : null}
          {attention.loadMoreError ? (
            <p className="small" role="alert">{attention.loadMoreError}</p>
          ) : null}
        </section>

        {clubSlug ? <ClubAiDefaultsSection clubSlug={clubSlug} variant="compact" /> : null}

        <section aria-label="클럽 준비도">
          {clubReadiness.data ? (
            <>
              <CardStatus
                error={clubReadiness.error}
                isRefreshing={clubReadiness.isRefreshing}
                refreshingLabel="운영 신호를 다시 확인하는 중"
                onRetry={clubReadiness.onRetry}
                retryLabel="다시 시도"
              />
              <HostClubOperationsCard snapshot={clubReadiness.data} LinkComponent={LinkComponent} />
            </>
          ) : (
            <>
              <h2 style={{ margin: 0 }}>운영 신호</h2>
              <CardStatus
                loadingLabel={clubReadiness.loading ? "클럽 준비도를 불러오는 중" : null}
                error={clubReadiness.error}
                isRefreshing={clubReadiness.isRefreshing}
                refreshingLabel="운영 신호를 다시 확인하는 중"
                onRetry={clubReadiness.onRetry}
                retryLabel="다시 시도"
              />
            </>
          )}
        </section>

        <section aria-labelledby="host-operations-notifications-title">
          <div className="row-between" style={{ alignItems: "baseline", gap: 12 }}>
            <h2 id="host-operations-notifications-title" style={{ margin: 0 }}>알림 발송</h2>
            {notifications.data ? (
              <span className="tiny" style={{ color: "var(--text-3)" }}>
                최근 24시간 {nonNegativeCount(notifications.data.sentLast24h)}건
              </span>
            ) : null}
          </div>
          <CardStatus
            loadingLabel={notifications.loading ? "알림 상태를 불러오는 중" : null}
            error={notifications.error}
            isRefreshing={notifications.isRefreshing}
            refreshingLabel="알림 상태를 다시 확인하는 중"
            onRetry={notifications.data ? undefined : notifications.onRetry}
            retryLabel={notifications.data ? undefined : "다시 시도"}
          />
          {notifications.data ? (
            <>
              <p className="small" style={{ margin: "8px 0 12px" }}>
                대기 {nonNegativeCount(notifications.data.pending)} · 실패 {nonNegativeCount(notifications.data.failed)} · 중단 {nonNegativeCount(notifications.data.dead)}
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={notifications.onRetry}>
                  다시 불러오기
                </button>
                <LinkComponent to="/app/host/notifications" className="btn btn-quiet btn-sm">
                  알림 발송 장부 열기
                </LinkComponent>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
