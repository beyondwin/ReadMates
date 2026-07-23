import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import {
  hostSessionLedgerBadges,
  type HostSessionLedgerFilters,
  type HostSessionLedgerItem,
} from "@/features/host/model/host-session-ledger-model";
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

function visibilityLabel(visibility: HostSessionLedgerItem["visibility"]) {
  return {
    HOST_ONLY: "호스트 전용",
    MEMBER: "멤버 공개",
    PUBLIC: "전체 공개",
  }[visibility];
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
            {["회차", "책과 세션", "일정", "상태", "기록", "공개 범위", ""].map((label) => (
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
              <td className="small" style={{ padding: 16, verticalAlign: "top" }}>{visibilityLabel(item.visibility)}</td>
              <td style={{ padding: 16, verticalAlign: "top" }}>
                <LinkComponent
                  to={sessionRecordHref(item.sessionId)}
                  className="btn btn-ghost btn-sm"
                  aria-label={`${item.sessionNumber}회차 기록 열기`}
                >
                  열기
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
            <span className="badge">{visibilityLabel(item.visibility)}</span>
          </div>
          <div className="tiny" style={{ marginTop: 10 }}>
            {formatDateOnlyLabel(item.date)} · {item.startTime}–{item.endTime} · {item.locationLabel}
          </div>
          <div style={{ marginTop: 12 }}><LedgerBadges item={item} /></div>
          <LinkComponent
            to={sessionRecordHref(item.sessionId)}
            className="btn btn-primary"
            aria-label={`${item.sessionNumber}회차 기록 열기`}
          >
            기록 열기
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
}: HostSessionLedgerProps) {
  return (
    <div className="stack" style={{ "--stack": "16px", minWidth: 0 } as React.CSSProperties}>
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
  items,
  LinkComponent = DefaultLink,
}: {
  items: HostSessionLedgerItem[] | null;
  LinkComponent?: HostSessionLedgerLinkComponent;
}) {
  if (items === null) {
    return (
      <div className="surface-quiet small" role="status" style={{ padding: 14 }}>
        기록 확인 항목을 불러오지 못했습니다. 다른 운영 영역은 계속 사용할 수 있습니다.
      </div>
    );
  }

  const visibleItems = items.slice(0, 3);
  if (visibleItems.length === 0) {
    return <div className="surface-quiet small" style={{ padding: 14 }}>확인 필요한 세션 기록이 없습니다.</div>;
  }

  return (
    <div className="stack" style={{ "--stack": "8px", minWidth: 0 } as React.CSSProperties}>
      {visibleItems.map((item) => (
        <LinkComponent
          key={item.sessionId}
          to={sessionRecordHref(item.sessionId)}
          className="rm-ledger-row"
          aria-label={`${item.sessionNumber}회차 기록 열기`}
        >
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <strong className="body">{item.bookTitle}</strong>
            <span className="tiny" style={{ display: "block", marginTop: 2 }}>
              No.{item.sessionNumber} · {hostSessionLedgerBadges(item)[0]?.label ?? "기록 확인"}
            </span>
          </span>
        </LinkComponent>
      ))}
    </div>
  );
}
