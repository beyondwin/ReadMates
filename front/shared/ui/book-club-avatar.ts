export type BookClubAvatarDefinition = {
  key: string;
  label: string;
};

export const BOOK_CLUB_AVATARS = [
  { key: "globe-notebook", label: "노트와 연필을 든 지구본" },
  { key: "mushroom-green-book", label: "초록 책을 읽는 버섯" },
  { key: "lemon-green-book", label: "초록 책을 읽는 레몬" },
  { key: "pudding-notebook", label: "노트와 연필을 든 푸딩" },
  { key: "peach-green-book", label: "초록 책을 읽는 복숭아" },
  { key: "radish-notebook", label: "노트와 연필을 든 무" },
  { key: "apple-green-book", label: "초록 책을 읽는 사과" },
  { key: "sailboat-green-book", label: "초록 책을 읽는 돛단배" },
  { key: "palette-green-book", label: "초록 책과 붓을 든 팔레트" },
  { key: "balloon-green-book", label: "초록 책을 읽는 열기구" },
  { key: "dumpling-notebook", label: "노트와 연필을 든 만두" },
  { key: "tulip-notebook", label: "노트와 연필을 든 튤립" },
  { key: "cheese-green-book", label: "초록 책을 읽는 치즈" },
  { key: "starfish-notebook", label: "노트를 든 불가사리" },
  { key: "banana-green-book", label: "초록 책을 읽는 바나나" },
  { key: "milk-green-book", label: "초록 책을 읽는 우유 팩" },
  { key: "cloud-green-book", label: "초록 책을 읽는 구름" },
  { key: "teacup-green-book", label: "초록 책을 읽는 찻잔" },
  { key: "toast-brown-book", label: "갈색 책을 읽는 식빵" },
  { key: "snowglobe-green-book", label: "초록 책을 읽는 스노우볼" },
  { key: "cherries-notebook", label: "노트와 연필을 든 체리" },
  { key: "envelope-notebook", label: "노트와 연필을 든 편지봉투" },
  { key: "bell-notebook", label: "노트와 연필을 든 종" },
  { key: "teacup-notebook", label: "노트와 연필을 든 찻잔" },
  { key: "candle-green-book", label: "초록 책을 읽는 촛불" },
  { key: "sun-green-book", label: "초록 책을 읽는 해" },
  { key: "teapot-green-book", label: "초록 책을 읽는 찻주전자" },
  { key: "sheep-notebook", label: "노트와 연필을 든 양" },
  { key: "moon-green-book", label: "초록 책을 읽는 초승달" },
  { key: "star-notebook", label: "노트를 든 별" },
] as const;

export type BookClubAvatarKey = (typeof BOOK_CLUB_AVATARS)[number]["key"];

export const BOOK_CLUB_AVATAR_KEYS = BOOK_CLUB_AVATARS.map(({ key }) => key);

export const DEFAULT_BOOK_CLUB_AVATAR_KEY: BookClubAvatarKey = "cloud-green-book";

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
