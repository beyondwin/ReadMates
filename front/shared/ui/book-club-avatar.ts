export type BookClubAvatarDefinition = {
  key: string;
  label: string;
};

export const BOOK_CLUB_AVATARS = [
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
] as const;

export type BookClubAvatarKey = (typeof BOOK_CLUB_AVATARS)[number]["key"];

export const BOOK_CLUB_AVATAR_KEYS = BOOK_CLUB_AVATARS.map(({ key }) => key);

export const DEFAULT_BOOK_CLUB_AVATAR_KEY: BookClubAvatarKey = "hedgehog-green-book";

const keySet = new Set<string>(BOOK_CLUB_AVATAR_KEYS);
const labelByKey = new Map<string, string>(
  BOOK_CLUB_AVATARS.map(({ key, label }) => [key, label]),
);

export function isBookClubAvatarKey(value: unknown): value is BookClubAvatarKey {
  return typeof value === "string" && keySet.has(value);
}

export function normalizeBookClubAvatarKey(value: unknown): BookClubAvatarKey {
  return isBookClubAvatarKey(value) ? value : DEFAULT_BOOK_CLUB_AVATAR_KEY;
}

export function bookClubAvatarLabel(value: unknown) {
  return labelByKey.get(normalizeBookClubAvatarKey(value))!;
}

export function bookClubAvatarSrc(value: unknown) {
  return `/assets/avatars/book-club/${normalizeBookClubAvatarKey(value)}.webp`;
}
