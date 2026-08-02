import { useState } from "react";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { bookClubAvatarLabel, bookClubAvatarSrc, normalizeBookClubAvatarKey } from "@/shared/ui/book-club-avatar";
import { ProfileEditorDialog } from "./profile-editor-dialog";
import type { SaveProfile } from "./types";

export type MemberProfileSummaryProps = { profile: MyPageProfile; viewModel: MemberSpaceViewModel; canEditProfile: boolean; onSaveProfile: SaveProfile };

export function MemberProfileSummary({ profile, viewModel, canEditProfile, onSaveProfile }: MemberProfileSummaryProps) {
  const [editing, setEditing] = useState(false);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const avatarKey = normalizeBookClubAvatarKey(profile.avatarKey);
  return (
    <section className="rm-member-profile" aria-labelledby="member-profile-name">
      <img className="rm-member-profile__avatar" src={bookClubAvatarSrc(avatarKey)} alt={`${bookClubAvatarLabel(avatarKey)} 아바타`} width="72" height="72" />
      <div className="rm-member-profile__identity">
        <h1 id="member-profile-name">{profile.displayName}</h1>
        <p className="rm-member-profile__meta">{viewModel.profileMetaLabel}</p>
      </div>
      {canEditProfile ? <div className="rm-member-profile__actions"><button type="button" className="button button--secondary rm-member-profile__edit" onClick={(event) => { setOpener(event.currentTarget); setEditing(true); }}>프로필 편집</button></div> : null}
      {editing ? <ProfileEditorDialog profile={{ displayName: profile.displayName, avatarKey }} opener={opener} onClose={() => setEditing(false)} onSaveProfile={onSaveProfile} /> : null}
    </section>
  );
}
