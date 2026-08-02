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
  normalizeBookClubAvatarKey,
} from "./book-club-avatar";

const assetDirectory = resolve(process.cwd(), "public/assets/avatars/book-club");
const sourceOrder = [
  "starfish-notebook", "teacup-notebook", "banana-green-book",
  "cherries-notebook", "pudding-notebook", "snowglobe-green-book",
  "peach-green-book", "radish-notebook", "balloon-green-book",
  "palette-green-book", "lemon-green-book", "sailboat-green-book",
  "sheep-notebook", "globe-notebook", "apple-green-book",
  "cheese-green-book", "milk-green-book", "bell-notebook",
  "sun-green-book", "tulip-notebook", "teapot-green-book",
  "envelope-notebook", "candle-green-book", "cloud-green-book",
  "star-notebook", "moon-green-book", "mushroom-green-book",
  "dumpling-notebook", "teacup-green-book", "toast-brown-book",
] as const;
const APPROVED_KEY_SET = new Set<string>(sourceOrder);

describe("book-club avatar manifest", () => {
  it("exposes the approved catalog once in a fixed non-source order", () => {
    expect(BOOK_CLUB_AVATARS).toHaveLength(30);
    expect(new Set(BOOK_CLUB_AVATAR_KEYS).size).toBe(30);
    expect([...BOOK_CLUB_AVATAR_KEYS].sort()).toEqual([...sourceOrder].sort());
    expect(BOOK_CLUB_AVATAR_KEYS).not.toEqual(sourceOrder);
    expect(DEFAULT_BOOK_CLUB_AVATAR_KEY).toBe("cloud-green-book");
  });

  it("keeps labels and local files aligned with the allowlist", () => {
    expect(readdirSync(assetDirectory).filter((name) => name.endsWith(".webp")).sort())
      .toEqual(BOOK_CLUB_AVATAR_KEYS.map((key) => `${key}.webp`).sort());
    for (const { key, label } of BOOK_CLUB_AVATARS) {
      const file = resolve(assetDirectory, `${key}.webp`);
      expect(APPROVED_KEY_SET.has(key)).toBe(true);
      expect(label.trim().length).toBeGreaterThan(0);
      expect(label).toMatch(/[\uac00-\ud7a3]/);
      expect(bookClubAvatarLabel(key)).toBe(label);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).subarray(0, 4).toString("ascii")).toBe("RIFF");
    }
  });

  it("falls back without allowing arbitrary paths or key variants", () => {
    expect(isBookClubAvatarKey("banana-green-book")).toBe(true);
    expect(isBookClubAvatarKey("BANANA-GREEN-BOOK")).toBe(false);
    expect(isBookClubAvatarKey("../../member-id")).toBe(false);
    expect(normalizeBookClubAvatarKey("unknown-avatar")).toBe("cloud-green-book");
    expect(normalizeBookClubAvatarKey("BANANA-GREEN-BOOK")).toBe("cloud-green-book");
    expect(bookClubAvatarLabel("unknown-avatar")).toBe("초록 책을 읽는 구름");
    expect(bookClubAvatarSrc("../../member-id"))
      .toBe("/assets/avatars/book-club/cloud-green-book.webp");
  });
});
