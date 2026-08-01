import { describe, expect, it } from "vitest";
import {
  BOOK_CLUB_AVATAR_KEYS,
  DEFAULT_BOOK_CLUB_AVATAR_KEY,
  bookClubAvatarSrc,
  isBookClubAvatarKey,
} from "./book-club-avatar";

describe("book-club avatar manifest", () => {
  it("contains exactly 20 unique stable keys", () => {
    expect(BOOK_CLUB_AVATAR_KEYS).toHaveLength(20);
    expect(new Set(BOOK_CLUB_AVATAR_KEYS)).toHaveLength(20);
    expect(BOOK_CLUB_AVATAR_KEYS[0]).toBe("reading-lamp");
    expect(BOOK_CLUB_AVATAR_KEYS[8]).toBe("archive-box");
    expect(BOOK_CLUB_AVATAR_KEYS[19]).toBe("discussion-circle");
  });

  it("maps only allowlisted values to public static paths", () => {
    expect(isBookClubAvatarKey("book-tote")).toBe(true);
    expect(isBookClubAvatarKey("../../member-id")).toBe(false);
    expect(bookClubAvatarSrc("book-tote")).toBe("/assets/avatars/book-club/book-tote.webp");
    expect(bookClubAvatarSrc("../../member-id")).toBe(
      `/assets/avatars/book-club/${DEFAULT_BOOK_CLUB_AVATAR_KEY}.webp`,
    );
    expect(bookClubAvatarSrc(null)).toBe("/assets/avatars/book-club/archive-box.webp");
  });
});
