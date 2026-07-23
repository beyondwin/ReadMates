import {
  type CSSProperties,
  type FormEvent,
  useState,
} from "react";
import type { ManualNotificationMemberOption } from "@/features/host/model/host-view-types";

export type NotificationRecipientPickerProps = {
  members: ManualNotificationMemberOption[];
  selectedMembershipIds: string[];
  hasMore: boolean;
  busy: boolean;
  onSelectedMembershipIdsChange: (ids: string[]) => void;
  onSearch: (search: string) => Promise<unknown>;
  onLoadMore: () => Promise<unknown>;
};

export function NotificationRecipientPicker({
  members,
  selectedMembershipIds,
  hasMore,
  busy,
  onSelectedMembershipIdsChange,
  onSearch,
  onLoadMore,
}: NotificationRecipientPickerProps) {
  const [search, setSearch] = useState("");
  const [knownMembers, setKnownMembers] = useState(
    () => new Map(members.map((member) => [member.membershipId, member])),
  );

  const selectedMembers = selectedMembershipIds.flatMap((membershipId) => {
    const member = knownMembers.get(membershipId);
    return member ? [member] : [];
  });

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSearch(search.trim());
  };

  const toggle = (membershipId: string) => {
    const member = members.find((item) => item.membershipId === membershipId);
    if (member && !knownMembers.has(membershipId)) {
      setKnownMembers((current) => new Map(current).set(membershipId, member));
    }
    onSelectedMembershipIdsChange(
      selectedMembershipIds.includes(membershipId)
        ? selectedMembershipIds.filter((id) => id !== membershipId)
        : [...selectedMembershipIds, membershipId],
    );
  };

  return (
    <section
      aria-labelledby="notification-recipient-picker-title"
      className="stack"
      style={{ "--stack": "12px" } as CSSProperties}
    >
      <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
        <h3 id="notification-recipient-picker-title" className="label" style={{ margin: 0 }}>
          멤버 선택
        </h3>
        <span aria-live="polite" className="small">
          {selectedMembershipIds.length}명 선택됨
        </span>
      </div>

      {selectedMembers.length > 0 ? (
        <section
          role="region"
          aria-label="선택한 멤버"
          className="surface-subtle stack"
          style={{ "--stack": "8px", padding: 12 } as CSSProperties}
        >
          <div className="row-between" style={{ gap: 8, flexWrap: "wrap" }}>
            <strong className="small">선택한 멤버 {selectedMembershipIds.length}명</strong>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => onSelectedMembershipIdsChange([])}
            >
              전체 해제
            </button>
          </div>
          {selectedMembers.map((member) => (
            <div
              key={member.membershipId}
              className="row-between"
              style={{ gap: 8, flexWrap: "wrap", overflowWrap: "anywhere" }}
            >
              <span>
                <strong>{member.displayName}</strong>
                <span className="tiny muted" style={{ display: "block" }}>
                  {member.maskedEmail}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={`${member.displayName} 선택 해제`}
                disabled={busy}
                onClick={() => toggle(member.membershipId)}
              >
                선택 해제
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <form role="search" className="row wrap" style={{ gap: 8 }} onSubmit={handleSearch}>
        <input
          type="search"
          className="input"
          aria-label="멤버 검색"
          placeholder="이름 또는 이메일 검색"
          value={search}
          disabled={busy}
          onChange={(event) => setSearch(event.currentTarget.value)}
          style={{ minWidth: 200, flex: "1 1 200px" }}
        />
        <button type="submit" className="btn btn-quiet btn-sm" disabled={busy}>
          검색
        </button>
      </form>

      {members.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          표시할 멤버가 없습니다.
        </p>
      ) : (
        <div className="stack" style={{ "--stack": "8px" } as CSSProperties}>
          {members.map((member) => {
            const checked = selectedMembershipIds.includes(member.membershipId);
            return (
              <label
                key={member.membershipId}
                className="surface-subtle row"
                style={{
                  padding: 12,
                  gap: 10,
                  alignItems: "flex-start",
                  overflowWrap: "anywhere",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={() => toggle(member.membershipId)}
                />
                <span>
                  <strong>{member.displayName}</strong>
                  <span className="tiny muted" style={{ display: "block" }}>
                    {member.maskedEmail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={() => void onLoadMore()}
        >
          멤버 더 보기
        </button>
      ) : null}
    </section>
  );
}
