export type BookClubAvatarDefinition = {
  key: string;
  label: string;
  description: string;
};

export const BOOK_CLUB_AVATARS = [
  { key: "globe-notebook", label: "세계를 펼치는 지구본", description: "노트와 연필을 든 지구본" },
  { key: "mushroom-green-book", label: "문장을 줍는 버섯", description: "초록 책을 읽는 버섯" },
  { key: "lemon-green-book", label: "여백에 머문 레몬", description: "초록 책을 읽는 레몬" },
  { key: "pudding-notebook", label: "생각을 받아 적는 푸딩", description: "노트와 연필을 든 푸딩" },
  { key: "peach-green-book", label: "이야기를 품은 복숭아", description: "초록 책을 읽는 복숭아" },
  { key: "radish-notebook", label: "질문을 적는 무", description: "노트와 연필을 든 무" },
  { key: "apple-green-book", label: "책갈피를 건네는 사과", description: "초록 책을 읽는 사과" },
  { key: "sailboat-green-book", label: "다음 장으로 가는 돛단배", description: "초록 책을 읽는 돛단배" },
  { key: "palette-green-book", label: "생각을 칠하는 팔레트", description: "초록 책과 붓을 든 팔레트" },
  { key: "balloon-green-book", label: "이야기를 띄우는 열기구", description: "초록 책을 읽는 열기구" },
  { key: "dumpling-notebook", label: "기록을 빚는 만두", description: "노트와 연필을 든 만두" },
  { key: "tulip-notebook", label: "여백에 피어난 튤립", description: "노트와 연필을 든 튤립" },
  { key: "cheese-green-book", label: "문장을 숙성하는 치즈", description: "초록 책을 읽는 치즈" },
  { key: "starfish-notebook", label: "밑줄을 모으는 불가사리", description: "노트를 든 불가사리" },
  { key: "banana-green-book", label: "한 장 더 읽는 바나나", description: "초록 책을 읽는 바나나" },
  { key: "milk-green-book", label: "아침을 읽는 우유 팩", description: "초록 책을 읽는 우유 팩" },
  { key: "cloud-green-book", label: "문장 사이의 구름", description: "초록 책을 읽는 구름" },
  { key: "teacup-green-book", label: "책 곁에 머문 찻잔", description: "초록 책을 읽는 찻잔" },
  { key: "toast-brown-book", label: "오래 읽는 식빵", description: "갈색 책을 읽는 식빵" },
  { key: "snowglobe-green-book", label: "기억을 간직한 스노우볼", description: "초록 책을 읽는 스노우볼" },
  { key: "cherries-notebook", label: "문장을 나누는 체리", description: "노트와 연필을 든 체리" },
  { key: "envelope-notebook", label: "다음 책을 전하는 편지봉투", description: "노트와 연필을 든 편지봉투" },
  { key: "bell-notebook", label: "모임을 여는 종", description: "노트와 연필을 든 종" },
  { key: "teacup-notebook", label: "대화를 기록하는 찻잔", description: "노트와 연필을 든 찻잔" },
  { key: "candle-green-book", label: "늦은 독서를 밝히는 촛불", description: "초록 책을 읽는 촛불" },
  { key: "sun-green-book", label: "다음 장을 밝히는 해", description: "초록 책을 읽는 해" },
  { key: "teapot-green-book", label: "대화를 끓이는 찻주전자", description: "초록 책을 읽는 찻주전자" },
  { key: "sheep-notebook", label: "조용히 듣는 양", description: "노트와 연필을 든 양" },
  { key: "moon-green-book", label: "밤의 페이지를 지키는 초승달", description: "초록 책을 읽는 초승달" },
  { key: "star-notebook", label: "질문을 남기는 별", description: "노트를 든 별" },
] as const satisfies readonly BookClubAvatarDefinition[];

export type BookClubAvatarKey = (typeof BOOK_CLUB_AVATARS)[number]["key"];

export const BOOK_CLUB_AVATAR_KEYS = BOOK_CLUB_AVATARS.map(({ key }) => key);

export const DEFAULT_BOOK_CLUB_AVATAR_KEY: BookClubAvatarKey = "cloud-green-book";

const keySet = new Set<string>(BOOK_CLUB_AVATAR_KEYS);
const labelByKey = new Map<string, string>(
  BOOK_CLUB_AVATARS.map(({ key, label }) => [key, label]),
);
const descriptionByKey = new Map<string, string>(
  BOOK_CLUB_AVATARS.map(({ key, description }) => [key, description]),
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

export function bookClubAvatarDescription(value: unknown) {
  return descriptionByKey.get(normalizeBookClubAvatarKey(value))!;
}

export function bookClubAvatarSrc(value: unknown) {
  return `/assets/avatars/book-club/${normalizeBookClubAvatarKey(value)}.webp`;
}
