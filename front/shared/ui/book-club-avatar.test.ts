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
  it("keeps the exact approved key and label order", () => {
    expect(BOOK_CLUB_AVATARS).toEqual([
      { key: "hedgehog-green-book", label: "초록 책을 읽는 고슴도치" },
      { key: "squirrel-acorn", label: "도토리를 든 다람쥐" },
      { key: "deer-brown-book", label: "갈색 책을 읽는 사슴" },
      { key: "fox-glasses-mug", label: "안경 쓰고 찻잔을 든 여우" },
      { key: "koala-book-sprig", label: "책과 나뭇가지를 든 코알라" },
      { key: "polar-bear-snowflake-mug", label: "눈꽃 찻잔을 든 북극곰" },
      { key: "penguin-beret-book", label: "베레모를 쓰고 책을 읽는 펭귄" },
      { key: "cat-flower-mug", label: "꽃무늬 찻잔을 든 고양이" },
      { key: "alpaca-winter-sprig", label: "목도리를 하고 나뭇가지를 든 알파카" },
      { key: "squirrel-green-book", label: "초록 책을 읽는 붉은 다람쥐" },
      { key: "penguin-orange-mug", label: "주황 찻잔을 든 펭귄" },
      { key: "panda-green-book", label: "초록 책을 읽는 판다" },
      { key: "mouse-blue-book", label: "파란 책을 읽는 생쥐" },
      { key: "turtle-winter-book", label: "겨울 모자를 쓰고 책을 읽는 거북이" },
      { key: "ladybug-green-book", label: "초록 책을 읽는 무당벌레" },
      { key: "snail-green-book", label: "초록 책을 읽는 달팽이" },
      { key: "sloth-orange-mug", label: "주황 찻잔을 든 나무늘보" },
      { key: "alpaca-brown-book", label: "갈색 책을 읽는 알파카" },
      { key: "fennec-heart-mug", label: "하트 찻잔을 든 사막여우" },
      { key: "hedgehog-glasses-book", label: "안경 쓰고 책을 읽는 고슴도치" },
      { key: "squirrel-autumn-book", label: "가을 숲에서 책을 읽는 다람쥐" },
      { key: "penguin-heart-mug", label: "하트 찻잔을 든 펭귄" },
      { key: "deer-plaid-book", label: "체크 목도리를 하고 책을 읽는 사슴" },
      { key: "alpaca-heart-mug", label: "하트 찻잔을 든 알파카" },
      { key: "turtle-glasses-book", label: "안경 쓰고 책을 읽는 거북이" },
      { key: "owl-beret-book", label: "베레모를 쓰고 책을 읽는 부엉이" },
      { key: "bear-green-book", label: "초록 책을 읽는 곰" },
      { key: "rabbit-brown-book", label: "갈색 책을 읽는 토끼" },
      { key: "cat-heart-mug", label: "하트 찻잔을 든 고양이" },
      { key: "dog-green-book", label: "초록 책을 읽는 강아지" },
      { key: "chick-beret-book", label: "베레모를 쓰고 책을 읽는 병아리" },
      { key: "duck-green-mug", label: "초록 찻잔을 든 흰 오리" },
      { key: "hamster-green-book", label: "초록 책을 든 햄스터" },
      { key: "red-panda-orange-mug", label: "주황 찻잔을 든 레서판다" },
      { key: "sheep-brown-book", label: "갈색 책을 읽는 양" },
      { key: "fox-side-book", label: "옆을 보며 책을 읽는 여우" },
      { key: "winter-bird", label: "목도리를 두른 겨울 새" },
      { key: "mallard-orange-mug", label: "주황 찻잔을 든 청둥오리" },
      { key: "owl-glasses-book", label: "안경 쓰고 책을 읽는 부엉이" },
      { key: "hedgehog-green-mug", label: "초록 찻잔을 든 고슴도치" },
    ]);
  });

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
