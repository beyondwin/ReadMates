import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOK_CLUB_AVATARS,
  BOOK_CLUB_AVATAR_KEYS,
  DEFAULT_BOOK_CLUB_AVATAR_KEY,
  bookClubAvatarLabel,
  bookClubAvatarSrc,
  isBookClubAvatarKey,
} from "./book-club-avatar";

const assetDirectory = resolve(process.cwd(), "public/assets/avatars/book-club");

describe("book-club avatar manifest", () => {
  it("exposes exactly forty unique approved animal avatars", () => {
    expect(BOOK_CLUB_AVATARS).toHaveLength(40);
    expect(new Set(BOOK_CLUB_AVATAR_KEYS).size).toBe(40);
    expect(DEFAULT_BOOK_CLUB_AVATAR_KEY).toBe("hedgehog-green-book");
    expect(BOOK_CLUB_AVATAR_KEYS.at(-1)).toBe("hedgehog-green-mug");
  });

  it("keeps labels and local files aligned with the allowlist", () => {
    expect(readdirSync(assetDirectory).filter((name) => name.endsWith(".webp")).sort())
      .toEqual(BOOK_CLUB_AVATAR_KEYS.map((key) => `${key}.webp`).sort());
    for (const { key, label } of BOOK_CLUB_AVATARS) {
      const file = resolve(assetDirectory, `${key}.webp`);
      expect(label.trim().length).toBeGreaterThan(0);
      expect(bookClubAvatarLabel(key)).toBe(label);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).subarray(0, 4).toString("ascii")).toBe("RIFF");
    }
  });

  it("falls back without allowing arbitrary paths", () => {
    expect(isBookClubAvatarKey("squirrel-acorn")).toBe(true);
    expect(isBookClubAvatarKey("../../member-id")).toBe(false);
    expect(bookClubAvatarSrc("../../member-id"))
      .toBe("/assets/avatars/book-club/hedgehog-green-book.webp");
  });
});
