import { useEffect, useState, type CSSProperties } from "react";
import type { RsvpStatus } from "@/shared/model/readmates-types";
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
  rsvpStatus,
  size = 24,
}: {
  avatarKey?: unknown;
  name: string | null | undefined;
  label?: string;
  rsvpStatus?: RsvpStatus;
  size?: number;
}) {
  const requestedKey = normalizeBookClubAvatarKey(avatarKey);
  const [renderedKey, setRenderedKey] = useState<BookClubAvatarKey | null>(requestedKey);
  const safeLabel = displayText(label, displayText(name, ""));

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
      className="rm-avatar-chip"
      data-rsvp-status={rsvpStatus}
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
