import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOK_CLUB_AVATARS,
  BOOK_CLUB_AVATAR_KEYS,
  DEFAULT_BOOK_CLUB_AVATAR_KEY,
  bookClubAvatarDescription,
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
const approvedCopyByKey = new Map([
  ["globe-notebook", ["세계를 펼치는 지구본", "노트와 연필을 든 지구본"]],
  ["mushroom-green-book", ["문장을 줍는 버섯", "초록 책을 읽는 버섯"]],
  ["lemon-green-book", ["여백에 머문 레몬", "초록 책을 읽는 레몬"]],
  ["pudding-notebook", ["생각을 받아 적는 푸딩", "노트와 연필을 든 푸딩"]],
  ["peach-green-book", ["이야기를 품은 복숭아", "초록 책을 읽는 복숭아"]],
  ["radish-notebook", ["질문을 적는 무", "노트와 연필을 든 무"]],
  ["apple-green-book", ["책갈피를 건네는 사과", "초록 책을 읽는 사과"]],
  ["sailboat-green-book", ["다음 장으로 가는 돛단배", "초록 책을 읽는 돛단배"]],
  ["palette-green-book", ["생각을 칠하는 팔레트", "초록 책과 붓을 든 팔레트"]],
  ["balloon-green-book", ["이야기를 띄우는 열기구", "초록 책을 읽는 열기구"]],
  ["dumpling-notebook", ["기록을 빚는 만두", "노트와 연필을 든 만두"]],
  ["tulip-notebook", ["여백에 피어난 튤립", "노트와 연필을 든 튤립"]],
  ["cheese-green-book", ["문장을 숙성하는 치즈", "초록 책을 읽는 치즈"]],
  ["starfish-notebook", ["밑줄을 모으는 불가사리", "노트를 든 불가사리"]],
  ["banana-green-book", ["한 장 더 읽는 바나나", "초록 책을 읽는 바나나"]],
  ["milk-green-book", ["아침을 읽는 우유 팩", "초록 책을 읽는 우유 팩"]],
  ["cloud-green-book", ["문장 사이의 구름", "초록 책을 읽는 구름"]],
  ["teacup-green-book", ["책 곁에 머문 찻잔", "초록 책을 읽는 찻잔"]],
  ["toast-brown-book", ["오래 읽는 식빵", "갈색 책을 읽는 식빵"]],
  ["snowglobe-green-book", ["기억을 간직한 스노우볼", "초록 책을 읽는 스노우볼"]],
  ["cherries-notebook", ["문장을 나누는 체리", "노트와 연필을 든 체리"]],
  ["envelope-notebook", ["다음 책을 전하는 편지봉투", "노트와 연필을 든 편지봉투"]],
  ["bell-notebook", ["모임을 여는 종", "노트와 연필을 든 종"]],
  ["teacup-notebook", ["대화를 기록하는 찻잔", "노트와 연필을 든 찻잔"]],
  ["candle-green-book", ["늦은 독서를 밝히는 촛불", "초록 책을 읽는 촛불"]],
  ["sun-green-book", ["다음 장을 밝히는 해", "초록 책을 읽는 해"]],
  ["teapot-green-book", ["대화를 끓이는 찻주전자", "초록 책을 읽는 찻주전자"]],
  ["sheep-notebook", ["조용히 듣는 양", "노트와 연필을 든 양"]],
  ["moon-green-book", ["밤의 페이지를 지키는 초승달", "초록 책을 읽는 초승달"]],
  ["star-notebook", ["질문을 남기는 별", "노트를 든 별"]],
] as const);

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
    const labels = new Set<string>();
    for (const { key, label, description } of BOOK_CLUB_AVATARS) {
      const file = resolve(assetDirectory, `${key}.webp`);
      expect(APPROVED_KEY_SET.has(key)).toBe(true);
      expect([label, description]).toEqual(approvedCopyByKey.get(key));
      expect(label.trim()).not.toBe("");
      expect(description.trim()).not.toBe("");
      expect(label).toMatch(/[\uac00-\ud7a3]/);
      expect(description).toMatch(/[\uac00-\ud7a3]/);
      expect(bookClubAvatarLabel(key)).toBe(label);
      expect(bookClubAvatarDescription(key)).toBe(description);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).subarray(0, 4).toString("ascii")).toBe("RIFF");
      labels.add(label);
    }
    expect(labels.size).toBe(30);
  });

  it("falls back without allowing arbitrary paths or key variants", () => {
    expect(isBookClubAvatarKey("banana-green-book")).toBe(true);
    expect(isBookClubAvatarKey("BANANA-GREEN-BOOK")).toBe(false);
    expect(isBookClubAvatarKey("../../member-id")).toBe(false);
    expect(normalizeBookClubAvatarKey("unknown-avatar")).toBe("cloud-green-book");
    expect(normalizeBookClubAvatarKey("BANANA-GREEN-BOOK")).toBe("cloud-green-book");
    expect(bookClubAvatarLabel("unknown-avatar")).toBe("문장 사이의 구름");
    expect(bookClubAvatarDescription("unknown-avatar")).toBe("초록 책을 읽는 구름");
    expect(bookClubAvatarSrc("../../member-id"))
      .toBe("/assets/avatars/book-club/cloud-green-book.webp");
  });
});
