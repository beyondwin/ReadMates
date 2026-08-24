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
    <main style={{ minWidth: 0 }}>
      <section className="page-header-compact">
        <div className="container">
          <div className="eyebrow">호스트 · 예정과 진행</div>
          <h1 ref={headingRef} tabIndex={-1} className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            모임
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            준비 중이거나 진행 중인 모임과 다음 행동을 확인합니다.
          </p>
        </div>
      </section>
      <section className="container" style={{ paddingTop: 16, paddingBottom: 72, minWidth: 0 }}>
        <div className="stack" style={{ "--stack": "16px" } as React.CSSProperties}>
          <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
            <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>서버가 정한 순서대로 표시합니다.</p>
            {rows.length > 0 ? (
              <LinkComponent to="/app/host/sessions/new" className="btn btn-primary btn-sm">새 모임 만들기</LinkComponent>
            ) : null}
          </div>
          <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
          {errorMessage ? (
            <div className="rm-empty-state" role="alert">
              <h2 className="h3 editorial">모임을 불러오지 못했습니다</h2>
              <p className="small">{errorMessage}</p>
              <button type="button" className="btn btn-primary" onClick={onRetry}>다시 시도</button>
            </div>
          ) : loading ? (
            <div className="rm-empty-state" role="status">모임을 불러오는 중</div>
          ) : rows.length === 0 ? (
            <div className="rm-empty-state">
              <h2 className="h3 editorial">첫 모임을 준비해 보세요</h2>
              <LinkComponent to="/app/host/sessions/new" className="btn btn-primary">첫 모임 만들기</LinkComponent>
            </div>
          ) : (
            <ol className="stack" aria-label="예정 및 진행 모임" style={{ "--stack": "10px", listStyle: "none", padding: 0, margin: 0 } as React.CSSProperties}>
              {rows.map((row) => (
                <li key={row.id} className="rm-document-panel" style={{ padding: 18 }}>
                  <article className="row-between" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div className="stack" style={{ "--stack": "6px", minWidth: 0, flex: "1 1 280px" } as React.CSSProperties}>
                      <div className="eyebrow">{formatMeetingOrdinal(row.ordinal, "folio")} · {row.lifecycleLabel}</div>
                      <h2 className="h4 editorial" style={{ margin: 0, overflowWrap: "anywhere" }}>{row.title}</h2>
                      <p className="small" style={{ margin: 0 }}>{formatDateOnlyLabel(row.meetingDate)}</p>
                      <p className="tiny" style={{ margin: 0, color: "var(--text-2)" }}>{row.readerProjection}</p>
                      {row.attention.map((label) => <span className="badge badge-warn" key={label}>{label}</span>)}
                    </div>
                    <LinkComponent
                      to={row.nextAction.href}
                      state={readmatesReturnState({ href: "/app/host/sessions", label: "모임으로" })}
                      className="btn btn-primary btn-sm"
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
