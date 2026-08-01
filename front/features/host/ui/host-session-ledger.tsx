import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import {
  hostSessionLedgerActionLabel,
  hostSessionLedgerBadges,
  hostSessionLedgerModifiedAtLabel,
  type HostSessionAttentionData,
  type HostSessionLedgerFilters,
  type HostSessionLedgerItem,
} from "@/features/host/model/host-session-ledger-model";
import { resolvedSessionExposure, sessionExposureCopy } from "@/features/host/model/session-exposure-model";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

type LedgerLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
};

export type HostSessionLedgerLinkComponent = ComponentType<LedgerLinkProps>;

export type HostSessionLedgerProps = {
  items: HostSessionLedgerItem[];
  filters: HostSessionLedgerFilters;
  nextCursor: string | null;
  loadingMore: boolean;
  onFiltersChange: (filters: HostSessionLedgerFilters) => void;
  onLoadMore: () => void;
  LinkComponent?: HostSessionLedgerLinkComponent;
  loading?: boolean;
  errorMessage?: string | null;
  loadMoreError?: string | null;
  onRetry?: () => void;
  newSessionHref?: string;
};

function DefaultLink({ to, children, ...props }: LedgerLinkProps) {
  return <a {...props} href={to}>{children}</a>;
}

function sessionRecordHref(sessionId: string) {
  return `/app/host/sessions/${encodeURIComponent(sessionId)}/edit`;
}

function stateLabel(state: HostSessionLedgerItem["state"]) {
  return {
    DRAFT: "예정",
    OPEN: "진행 중",
    CLOSED: "종료",
    PUBLISHED: "공개됨",
  }[state];
}

function exposureLabel(item: HostSessionLedgerItem) {
  const exposure = resolvedSessionExposure(item);
  const copy = sessionExposureCopy(exposure.accessScope, exposure.siteVisibility);
  return `${copy.accessLabel} · ${copy.siteLabel}`;
}

function LedgerBadges({ item }: { item: HostSessionLedgerItem }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {hostSessionLedgerBadges(item).map((badge) => (
        <span
          key={badge.label}
          className={`badge${badge.tone === "default" ? "" : ` badge-${badge.tone}`}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function LedgerFilters({
  filters,
  onFiltersChange,
}: Pick<HostSessionLedgerProps, "filters" | "onFiltersChange">) {
  const [search, setSearch] = useState(filters.search);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onFiltersChange({ ...filters, search: search.trim().replace(/\s+/g, " ") });
  };

  return (
    <form
      role="search"
      onSubmit={submit}
      className="rm-document-panel"
      style={{
        padding: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
        gap: 10,
        alignItems: "end",
      }}
    >
      <label className="stack" style={{ "--stack": "6px", minWidth: 0 } as React.CSSProperties}>
        <span className="tiny">세션 기록 검색</span>
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <input
            className="input"
            type="search"
            aria-label="세션 기록 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ minWidth: 0 }}
          />
          <button className="btn btn-primary btn-sm" type="submit">검색</button>
        </span>
      </label>
      <label className="stack" style={{ "--stack": "6px" } as React.CSSProperties}>
        <span className="tiny">세션 상태</span>
        <select
          className="input"
          aria-label="세션 상태"
          value={filters.state ?? ""}
          onChange={(event) => onFiltersChange({
            ...filters,
            state: (event.target.value || null) as HostSessionLedgerFilters["state"],
          })}
        >
          <option value="">전체</option>
          <option value="DRAFT">예정</option>
          <option value="OPEN">진행 중</option>
          <option value="CLOSED">종료</option>
          <option value="PUBLISHED">공개됨</option>
        </select>
      </label>
      <label className="stack" style={{ "--stack": "6px" } as React.CSSProperties}>
        <span className="tiny">기록 상태</span>
        <select
          className="input"
          aria-label="기록 상태"
          value={filters.recordStatus ?? ""}
          onChange={(event) => onFiltersChange({
            ...filters,
            recordStatus: (event.target.value || null) as HostSessionLedgerFilters["recordStatus"],
          })}
        >
          <option value="">전체</option>
          <option value="NOT_STARTED">시작 전</option>
          <option value="INCOMPLETE">미완료</option>
          <option value="COMPLETE">완료</option>
        </select>
      </label>
      <label className="stack" style={{ "--stack": "6px" } as React.CSSProperties}>
        <span className="tiny">확인 필요</span>
        <select
          className="input"
          aria-label="확인 필요"
          value={filters.needsAttention === null ? "" : String(filters.needsAttention)}
          onChange={(event) => onFiltersChange({
            ...filters,
            needsAttention: event.target.value === "" ? null : event.target.value === "true",
          })}
        >
          <option value="">전체</option>
          <option value="true">확인 필요</option>
          <option value="false">확인 완료</option>
        </select>
      </label>
    </form>
  );
}

function DesktopLedger({
  items,
  LinkComponent,
}: {
  items: HostSessionLedgerItem[];
  LinkComponent: HostSessionLedgerLinkComponent;
}) {
  return (
    <div className="desktop-only rm-document-panel" style={{ overflowX: "auto" }}>
      <table
        aria-label="세션 기록 장부"
        style={{ width: "100%", minWidth: 820, borderCollapse: "collapse", textAlign: "left" }}
      >
        <thead>
          <tr>
            {["회차", "책과 세션", "일정", "상태", "기록", "공개 범위", "마지막 수정", ""].map((label) => (
              <th key={label} scope="col" className="tiny" style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sessionId}>
              <td className="mono small" style={{ padding: 16, verticalAlign: "top" }}>No.{item.sessionNumber}</td>
              <td style={{ padding: 16, minWidth: 220, verticalAlign: "top", overflowWrap: "anywhere" }}>
                <strong className="body">{item.bookTitle}</strong>
                <div className="tiny" style={{ marginTop: 3 }}>{item.bookAuthor} · {item.title}</div>
              </td>
              <td className="small" style={{ padding: 16, verticalAlign: "top" }}>
                {formatDateOnlyLabel(item.date)}
                <div className="tiny">{item.startTime}–{item.endTime} · {item.locationLabel}</div>
              </td>
              <td className="small" style={{ padding: 16, verticalAlign: "top" }}>{stateLabel(item.state)}</td>
              <td style={{ padding: 16, verticalAlign: "top" }}><LedgerBadges item={item} /></td>
              <td className="small" style={{ padding: 16, verticalAlign: "top" }}>{exposureLabel(item)}</td>
              <td className="tiny" style={{ padding: 16, verticalAlign: "top", whiteSpace: "nowrap" }}>
                {hostSessionLedgerModifiedAtLabel(item.lastModifiedAt)}
              </td>
              <td style={{ padding: 16, verticalAlign: "top" }}>
                <LinkComponent
                  to={sessionRecordHref(item.sessionId)}
                  className="btn btn-ghost btn-sm"
                  aria-label={`${item.sessionNumber}회차 ${hostSessionLedgerActionLabel(item)}`}
                >
                  {hostSessionLedgerActionLabel(item)}
                </LinkComponent>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileLedger({
  items,
  LinkComponent,
}: {
  items: HostSessionLedgerItem[];
  LinkComponent: HostSessionLedgerLinkComponent;
}) {
  return (
    <div className="mobile-only stack" style={{ "--stack": "10px", minWidth: 0 } as React.CSSProperties}>
      {items.map((item) => (
        <article
          key={item.sessionId}
          data-session-id={item.sessionId}
          className="m-card"
          style={{ minWidth: 0, overflowWrap: "anywhere" }}
        >
          <div className="row-between" style={{ gap: 10, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">No.{item.sessionNumber} · {stateLabel(item.state)}</div>
              <h2 className="h4 editorial" style={{ margin: "5px 0 2px", overflowWrap: "anywhere" }}>{item.bookTitle}</h2>
              <div className="tiny">{item.bookAuthor}</div>
            </div>
            <span className="badge">{exposureLabel(item)}</span>
          </div>
          <div className="tiny" style={{ marginTop: 10 }}>
            {formatDateOnlyLabel(item.date)} · {item.startTime}–{item.endTime} · {item.locationLabel}
          </div>
          <div className="tiny" style={{ marginTop: 4 }}>
            {hostSessionLedgerModifiedAtLabel(item.lastModifiedAt)}
          </div>
          <div style={{ marginTop: 12 }}><LedgerBadges item={item} /></div>
          <LinkComponent
            to={sessionRecordHref(item.sessionId)}
            className="btn btn-primary"
            aria-label={`${item.sessionNumber}회차 ${hostSessionLedgerActionLabel(item)}`}
          >
            {hostSessionLedgerActionLabel(item)}
          </LinkComponent>
        </article>
      ))}
    </div>
  );
}

export function HostSessionLedger({
  items,
  filters,
  nextCursor,
  loadingMore,
  onFiltersChange,
  onLoadMore,
  LinkComponent = DefaultLink,
  loading = false,
  errorMessage = null,
  loadMoreError = null,
  onRetry,
  newSessionHref = "/app/host/sessions/new",
}: HostSessionLedgerProps) {
  return (
    <div className="stack" style={{ "--stack": "16px", minWidth: 0 } as React.CSSProperties}>
      <div className="row-between" style={{ gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        <span className="small" style={{ color: "var(--text-2)" }}>
          회차별 기록과 저장된 초안을 확인합니다.
        </span>
        <LinkComponent to={newSessionHref} className="btn btn-primary btn-sm">
          새 세션 만들기
        </LinkComponent>
      </div>
      <LedgerFilters key={filters.search} filters={filters} onFiltersChange={onFiltersChange} />
      {errorMessage ? (
        <div className="surface-quiet" role="alert" style={{ padding: 18 }}>
          <p className="small" style={{ margin: 0 }}>{errorMessage}</p>
          {onRetry ? <button className="btn btn-ghost btn-sm" type="button" onClick={onRetry}>다시 시도</button> : null}
        </div>
      ) : loading ? (
        <div className="surface-quiet small" role="status" style={{ padding: 18 }}>세션 기록을 불러오는 중입니다.</div>
      ) : items.length === 0 ? (
        <div className="surface-quiet small" style={{ padding: 18 }}>조건에 맞는 세션 기록이 없습니다.</div>
      ) : (
        <>
          <DesktopLedger items={items} LinkComponent={LinkComponent} />
          <MobileLedger items={items} LinkComponent={LinkComponent} />
        </>
      )}
      {nextCursor ? (
        <button className="btn btn-ghost" type="button" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "불러오는 중" : "더 보기"}
        </button>
      ) : null}
      {loadMoreError ? <p className="small" role="alert">{loadMoreError}</p> : null}
    </div>
  );
}

export function HostSessionAttentionSummary({
  page,
  LinkComponent = DefaultLink,
}: {
  page: HostSessionAttentionData;
  LinkComponent?: HostSessionLedgerLinkComponent;
}) {
  const visibleItems = page.items.slice(0, 3);

  if (visibleItems.length === 0) {
    return <p className="rm-host-attention__empty">확인 필요한 세션 기록이 없습니다.</p>;
  }

  return (
    <ol className="rm-host-attention" aria-label="확인 필요한 세션 기록">
      {visibleItems.map((item) => {
        const status = hostSessionLedgerBadges(item)[0] ?? {
          label: "기록 확인",
          tone: "default",
        };

        return (
          <li key={item.sessionId} className="rm-host-attention__item">
            <LinkComponent
              to={sessionRecordHref(item.sessionId)}
              className="rm-host-attention__row"
              aria-label={`${item.sessionNumber}회차 기록 열기`}
            >
              <span className="rm-host-attention__number ledger-number">No.{item.sessionNumber}</span>
              <span className="rm-host-attention__copy">
                <strong>{item.bookTitle}</strong>
                <span>{item.bookAuthor}</span>
              </span>
              <span
                className={`rm-host-attention__status badge${
                  status.tone === "default" ? "" : ` badge-${status.tone}`
                } badge-dot`}
              >
                {status.label}
              </span>
              <span className="rm-host-attention__action">
                기록 열기
                <span aria-hidden="true">→</span>
              </span>
            </LinkComponent>
          </li>
        );
      })}
    </ol>
  );
}
