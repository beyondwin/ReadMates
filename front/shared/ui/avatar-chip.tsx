import { useEffect, useState, type CSSProperties } from "react";
import {
  bookClubAvatarSrc,
  DEFAULT_BOOK_CLUB_AVATAR_KEY,
  normalizeBookClubAvatarKey,
  type BookClubAvatarKey,
} from "@/shared/ui/book-club-avatar";
import { displayText } from "@/shared/ui/readmates-display";

export function AvatarChip({
  avatarKey,
  name,
  label,
  size = 24,
}: {
  avatarKey?: unknown;
  name: string | null | undefined;
  label?: string;
  size?: number;
}) {
  const requestedKey = normalizeBookClubAvatarKey(avatarKey);
  const [renderedKey, setRenderedKey] = useState<BookClubAvatarKey | null>(requestedKey);
  const safeLabel = label === undefined ? displayText(name, "") : displayText(label, "");

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
      className="rm-avatar-chip rm-avatar-chip--artwork"
      title={safeLabel || undefined}
      style={{ "--avatar-size": `${size}px` } as CSSProperties}
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
