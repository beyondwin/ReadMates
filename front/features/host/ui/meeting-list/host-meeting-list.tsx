import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import type { HostMeetingListRow } from "@/features/host/model/host-meeting-list-model";
import { formatMeetingOrdinal } from "@/shared/model/meeting-language";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { readmatesReturnState } from "@/shared/routing/readmates-route-state";

type LinkProps = { to: string; className?: string; children: ReactNode; state?: unknown };
export type HostMeetingListLinkComponent = ComponentType<LinkProps>;

function DefaultLink({ to, children, state: _state, ...props }: LinkProps) {
  void _state;
  return <a {...props} href={to}>{children}</a>;
}

export function HostMeetingList({
  rows,
  nextCursor,
  loadingMore,
  onLoadMore,
  LinkComponent = DefaultLink,
  announcement = null,
  focusHeadingRevision = 0,
  loading = false,
  errorMessage = null,
  onRetry,
}: {
  rows: readonly HostMeetingListRow[];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  LinkComponent?: HostMeetingListLinkComponent;
  announcement?: string | null;
  focusHeadingRevision?: number;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRevision = useRef(focusHeadingRevision);

  useEffect(() => {
    if (focusHeadingRevision > previousFocusRevision.current) {
      headingRef.current?.focus();
    }
    previousFocusRevision.current = focusHeadingRevision;
  }, [focusHeadingRevision]);

  return (
    <main className="rm-host-editorial-ledger">
      <section className="page-header-compact">
        <div className="container rm-host-editorial-ledger__context">
          <div className="eyebrow rm-host-editorial-ledger__eyebrow">호스트 · 예정과 진행</div>
          <h1 ref={headingRef} tabIndex={-1} className="h1 editorial rm-host-editorial-ledger__heading">
            모임
          </h1>
          <p className="small rm-host-editorial-ledger__lede">
            준비 중이거나 진행 중인 모임과 다음 행동을 확인합니다.
          </p>
        </div>
      </section>
      <section className="container rm-host-editorial-ledger__body">
        <div className="rm-host-editorial-ledger__stack">
          <div className="rm-host-editorial-ledger__toolbar">
            <p className="small rm-host-editorial-ledger__lede">서버가 정한 순서대로 표시합니다.</p>
            {rows.length > 0 ? (
              <LinkComponent to="/app/host/sessions/new" className="btn btn-primary rm-host-editorial-ledger__action">
                새 모임 만들기
              </LinkComponent>
            ) : null}
          </div>
          <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
          {errorMessage ? (
            <div className="rm-empty-state rm-host-editorial-ledger__state" role="alert">
              <h2 className="h3 editorial rm-host-editorial-ledger__state-title">모임을 불러오지 못했습니다</h2>
              <p className="small">{errorMessage}</p>
              <button type="button" className="btn btn-primary" onClick={onRetry}>다시 시도</button>
            </div>
          ) : loading ? (
            <div className="rm-empty-state rm-host-editorial-ledger__state" role="status">모임을 불러오는 중</div>
          ) : rows.length === 0 ? (
            <div className="rm-empty-state rm-host-editorial-ledger__state">
              <h2 className="h3 editorial rm-host-editorial-ledger__state-title">첫 모임을 준비해 보세요</h2>
              <LinkComponent to="/app/host/sessions/new" className="btn btn-primary rm-host-editorial-ledger__action">
                첫 모임 만들기
              </LinkComponent>
            </div>
          ) : (
            <ol className="rm-host-editorial-ledger__list" aria-label="예정 및 진행 모임">
              {rows.map((row) => (
                <li key={row.id}>
                  <article className="rm-host-editorial-ledger__row">
                    <div className="rm-host-editorial-ledger__row-copy">
                      <div className="eyebrow">{formatMeetingOrdinal(row.ordinal, "folio")} · {row.lifecycleLabel}</div>
                      <h2 className="h4 editorial">{row.title}</h2>
                      <p className="small">{formatDateOnlyLabel(row.meetingDate)}</p>
                      <p className="tiny rm-host-editorial-ledger__lede">{row.readerProjection}</p>
                      {row.attention.map((label) => (
                        <p className="rm-host-editorial-ledger__fact" key={label}>{label}</p>
                      ))}
                    </div>
                    <LinkComponent
                      to={row.nextAction.href}
                      state={readmatesReturnState({ href: "/app/host/sessions", label: "모임으로" })}
                      className="btn btn-primary"
                    >
                      {row.nextAction.label}
                    </LinkComponent>
                  </article>
                </li>
              ))}
            </ol>
          )}
          {nextCursor ? (
            <button type="button" className="btn btn-ghost" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "불러오는 중" : "더 보기"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
