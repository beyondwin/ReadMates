import type { BookClubAvatarKey } from "@/shared/ui/book-club-avatar";

export type MemberProfileErrorCode =
  | "DISPLAY_NAME_DUPLICATE"
  | "DISPLAY_NAME_REQUIRED"
  | "DISPLAY_NAME_TOO_LONG"
  | "DISPLAY_NAME_INVALID"
  | "DISPLAY_NAME_RESERVED"
  | "AVATAR_KEY_REQUIRED"
  | "AVATAR_KEY_INVALID"
  | "AUTHENTICATION_REQUIRED"
  | "MEMBER_NOT_FOUND"
  | "MEMBERSHIP_NOT_ALLOWED";

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
