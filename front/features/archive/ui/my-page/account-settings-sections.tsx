import type { MyPageProfile } from "@/features/archive/model/archive-model";
import {
  clubDisplayName,
  formatJoinedMonth,
  membershipIdentityLabel,
} from "@/features/archive/model/archive-model";

export function AccountInformation({ data }: { data: MyPageProfile }): JSX.Element {
  return (
    <section
      className="rm-account-settings-page__summary"
      aria-labelledby="account-information-heading"
    >
      <h2 id="account-information-heading">계정 정보</h2>
      <dl>
        <div>
          <dt>이메일</dt>
          <dd>{data.email}</dd>
        </div>
        <div>
          <dt>표시 이름</dt>
          <dd>{data.displayName}</dd>
        </div>
      </dl>
    </section>
  );
}

export function MembershipIdentity({ data }: { data: MyPageProfile }): JSX.Element {
  return (
    <section
      className="rm-account-settings-page__summary"
      aria-labelledby="club-membership-heading"
    >
      <h2 id="club-membership-heading">클럽 멤버십</h2>
      <dl>
        <div>
          <dt>클럽</dt>
          <dd>{clubDisplayName(data)}</dd>
        </div>
        <div>
          <dt>멤버 상태</dt>
          <dd>{membershipIdentityLabel(data)}</dd>
        </div>
        <div>
          <dt>합류</dt>
          <dd>{formatJoinedMonth(data.joinedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}
