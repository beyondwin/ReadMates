import { useState } from "react";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { bookClubAvatarLabel, normalizeBookClubAvatarKey } from "@/shared/ui/book-club-avatar";
import { ProfileEditorDialog } from "./profile-editor-dialog";
import type { SaveProfile } from "./types";

export type MemberProfileSummaryProps = { profile: MyPageProfile; viewModel: MemberSpaceViewModel; canEditProfile: boolean; onSaveProfile: SaveProfile };

function profileMetaLines(label: string): string[] {
  const parts = label.split(" · ");
  const joinedLabel = parts.at(-1)?.endsWith("부터 함께") ? parts.pop() : null;
  return [parts.join(" · "), joinedLabel].filter((part): part is string => Boolean(part));
}

export function MemberProfileSummary({ profile, viewModel, canEditProfile, onSaveProfile }: MemberProfileSummaryProps) {
  const [editing, setEditing] = useState(false);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const avatarKey = normalizeBookClubAvatarKey(profile.avatarKey);
  const avatarLabel = bookClubAvatarLabel(avatarKey);
  const metaLines = profileMetaLines(viewModel.profileMetaLabel);
  return (
    <section className="rm-member-profile" aria-labelledby="member-profile-name">
      <figure className="rm-member-profile__avatar-figure">
        <AvatarChip className="rm-member-profile__avatar" avatarKey={avatarKey} label="" name={profile.displayName} sizeRole="profile" />
        <figcaption className="rm-member-profile__avatar-name">{avatarLabel}</figcaption>
      </figure>
      <div className="rm-member-profile__identity">
        <h1 id="member-profile-name">{profile.displayName}</h1>
        <p className="rm-member-profile__meta" aria-label={metaLines.join(", ")}>
          {metaLines.map((line) => <span className="rm-member-profile__meta-line" key={line}>{line}</span>)}
        </p>
        {canEditProfile ? <button type="button" className="rm-member-profile__edit" onClick={(event) => { setOpener(event.currentTarget); setEditing(true); }}>프로필 편집</button> : null}
      </div>
      {editing ? <ProfileEditorDialog profile={{ displayName: profile.displayName, avatarKey }} opener={opener} onClose={() => setEditing(false)} onSaveProfile={onSaveProfile} /> : null}
    </section>
  );
}
