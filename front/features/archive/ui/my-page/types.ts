import type { CSSProperties, ReactNode } from "react";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { EditableMemberProfile, ProfileSaveResult } from "@/features/archive/model/profile-update";

export type ProfileUpdateResult = Pick<MyPageProfile, "displayName" | "accountName">;
export type AvatarUpdateResult = Pick<MyPageProfile, "avatarKey">;
export type SaveProfile = (profile: EditableMemberProfile) => Promise<ProfileSaveResult>;

export type LogoutControlComponent = (props: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) => ReactNode;
