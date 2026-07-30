import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { clubDisplayName, formatJoinedMonth, membershipIdentityLabel } from "@/features/archive/model/archive-model";
import { ProfileNameEditor } from "./profile-name-editor";

type ProfileUpdateResult = Pick<MyPageProfile, "displayName" | "accountName">;

export function PreferencesSection({
  data,
  canEditProfile,
  onUpdateProfile,
}: {
  data: MyPageProfile;
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
}) {
  return (
    <section aria-labelledby="my-page-profile-heading">
      <h3 id="my-page-profile-heading">프로필</h3>
      <div className="surface" style={{ padding: "4px" }}>
        <ProfileNameEditor
          data={data}
          canEditProfile={canEditProfile}
          onUpdateProfile={onUpdateProfile}
          headingId="account-settings-profile-name"
        />
      </div>
    </section>
  );
}

export function MembershipIdentity({ data }: { data: MyPageProfile }) {
  return (
    <section className="rm-account-settings-page__membership" aria-labelledby="my-page-membership-heading">
      <h3 id="my-page-membership-heading">멤버십</h3>
      <dl>
        <div>
          <dt>이메일</dt>
          <dd>{data.email}</dd>
        </div>
        <div>
          <dt>멤버 상태</dt>
          <dd>{membershipIdentityLabel(data)}</dd>
        </div>
        <div>
          <dt>클럽</dt>
          <dd>{clubDisplayName(data)}</dd>
        </div>
        <div>
          <dt>합류</dt>
          <dd>{formatJoinedMonth(data.joinedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}
