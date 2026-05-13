import type { CSSProperties } from "react";
import type { ManualNotificationMemberOption } from "@/features/host/model/host-view-types";

export function ManualNotificationMemberPicker({
  members,
  excludedIds,
  includedIds,
  disabled,
  onExcludedIdsChange,
  onIncludedIdsChange,
}: {
  members: ManualNotificationMemberOption[];
  excludedIds: string[];
  includedIds: string[];
  disabled: boolean;
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
    </section>
  );
}
