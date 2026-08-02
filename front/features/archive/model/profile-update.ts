import type { MemberProfileErrorCode } from "@/features/archive/api/archive-contracts";
import type { BookClubAvatarKey } from "@/shared/ui/book-club-avatar";

export type { MemberProfileErrorCode };

export type EditableMemberProfile = {
  displayName: string;
  avatarKey: BookClubAvatarKey;
};

export type ProfileFailureField = "displayName" | "avatarKey" | "form";

export class ProfileUpdateFailure extends Error {
  constructor(
    message: string,
    readonly code: MemberProfileErrorCode | null,
    readonly field: ProfileFailureField,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProfileUpdateFailure";
  }
}

export function profileFailureField(code: MemberProfileErrorCode | null): ProfileFailureField {
  if (code?.startsWith("DISPLAY_NAME_")) return "displayName";
  if (code?.startsWith("AVATAR_KEY_")) return "avatarKey";
  return "form";
}
