import type { CSSProperties } from "react";
import type { ManualNotificationMemberOption } from "@/features/host/model/host-view-types";

export function ManualNotificationMemberPicker({
  members,
  excludedIds,
  includedIds,
  search,
  hasMore,
  loading,
  disabled,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  onLoadMore,
  onExcludedIdsChange,
  onIncludedIdsChange,
}: {
  members: ManualNotificationMemberOption[];
  excludedIds: string[];
  includedIds: string[];
  search: string;
  hasMore: boolean;
  loading: boolean;
  disabled: boolean;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => Promise<unknown>;
  onSearchClear: () => Promise<unknown>;
  onLoadMore: () => Promise<unknown>;
  onExcludedIdsChange: (ids: string[]) => void;
  onIncludedIdsChange: (ids: string[]) => void;
}) {
  const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);

  return (
    <section aria-labelledby="manual-notification-members-title">
      <div className="row-between" style={{ gap: 12, alignItems: "baseline", marginBottom: 8 }}>
        <h3 id="manual-notification-members-title" className="h4 editorial" style={{ margin: 0 }}>
          대상 조정
        </h3>
        <span className="tiny muted">
          제외 {excludedIds.length}명 · 추가 {includedIds.length}명
        </span>
      </div>
      <form
        className="row wrap"
        style={{ gap: 8, marginBottom: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          void onSearchSubmit();
        }}
      >
        <input
          type="search"
          className="input"
          aria-label="멤버 검색"
          placeholder="이름 또는 이메일 검색"
          value={search}
          disabled={disabled || loading}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          style={{ minWidth: 220, flex: "1 1 220px" }}
        />
        <button type="submit" className="btn btn-quiet btn-sm" disabled={disabled || loading}>
          검색
        </button>
        {search.trim() ? (
          <button type="button" className="btn btn-quiet btn-sm" disabled={disabled || loading} onClick={() => void onSearchClear()}>
            초기화
          </button>
        ) : null}
        {loading ? <span className="tiny muted">멤버를 불러오는 중</span> : null}
      </form>
      {members.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          표시할 멤버가 없습니다.
        </p>
      ) : (
        <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
          {members.map((member, index) => (
            <article
              key={member.membershipId}
              className="row-between"
              style={{
                gap: 12,
                padding: "12px 0",
                borderTop: index === 0 ? undefined : "1px solid var(--line-soft)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <strong className="body" style={{ display: "block" }}>
                  {member.displayName}
                </strong>
                <span className="tiny muted">{member.maskedEmail}</span>
              </span>
              <span className="row wrap" style={{ gap: 6 }}>
                <span className="badge">{member.emailEligibility === "ELIGIBLE" ? "이메일 가능" : "이메일 제외"}</span>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={disabled}
                  onClick={() => onExcludedIdsChange(toggle(excludedIds, member.membershipId))}
                >
                  {excludedIds.includes(member.membershipId) ? "제외 취소" : "제외"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={disabled}
                  onClick={() => onIncludedIdsChange(toggle(includedIds, member.membershipId))}
                >
                  {includedIds.includes(member.membershipId) ? "추가 취소" : "추가"}
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
      {hasMore ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={disabled || loading}
          style={{ marginTop: 12 }}
          onClick={() => void onLoadMore()}
        >
          {loading ? "불러오는 중" : "멤버 더 보기"}
        </button>
      ) : null}
    </section>
  );
}
