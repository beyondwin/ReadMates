import { useEffect, useState, type CSSProperties } from "react";
import {
  bookClubAvatarSrc,
  DEFAULT_BOOK_CLUB_AVATAR_KEY,
  normalizeBookClubAvatarKey,
  type BookClubAvatarKey,
} from "@/shared/ui/book-club-avatar";
import { displayText } from "@/shared/ui/readmates-display";

// eslint-disable-next-line react-refresh/only-export-components
export const AVATAR_SIZE_ROLES = {
  navigation: { desktop: 36, mobile: 36 },
  dense: { desktop: 30, mobile: 30 },
  author: { desktop: 36, mobile: 36 },
  member: { desktop: 38, mobile: 34 },
  roster: { desktop: 32, mobile: 38 },
  profile: { desktop: 88, mobile: 64 },
  editor: { desktop: 72, mobile: 72 },
  picker: { desktop: 64, mobile: 58 },
} as const;

export type AvatarSizeRole = keyof typeof AVATAR_SIZE_ROLES;

export function AvatarChip({
  avatarKey,
  name,
  label,
  size = 24,
  sizeRole,
  className,
}: {
  avatarKey?: unknown;
  name: string | null | undefined;
  label?: string;
  size?: number;
  sizeRole?: AvatarSizeRole;
  className?: string;
}) {
  const requestedKey = normalizeBookClubAvatarKey(avatarKey);
  const [renderedKey, setRenderedKey] = useState<BookClubAvatarKey | null>(requestedKey);
  const safeLabel = label === undefined ? displayText(name, "") : displayText(label, "");
  const resolvedSize = sizeRole
    ? AVATAR_SIZE_ROLES[sizeRole]
    : { desktop: size, mobile: size };

  useEffect(() => {
    // Resetting the local failure state is required when a caller requests a new asset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderedKey(requestedKey);
  }, [requestedKey]);

  function handleImageError() {
    setRenderedKey((current) =>
      current === DEFAULT_BOOK_CLUB_AVATAR_KEY ? null : DEFAULT_BOOK_CLUB_AVATAR_KEY,
    );
  }

  return (
    <span
      className={["rm-avatar-chip", "rm-avatar-chip--artwork", className].filter(Boolean).join(" ")}
      title={safeLabel || undefined}
      data-avatar-size-role={sizeRole}
      style={{
        "--avatar-size": resolvedSize.desktop + "px",
        "--avatar-mobile-size": resolvedSize.mobile + "px",
      } as CSSProperties}
    >
      {renderedKey ? (
        <img
          src={bookClubAvatarSrc(renderedKey)}
          alt=""
          aria-hidden="true"
          onError={handleImageError}
        />
      ) : null}
    </span>
  );
}
