export const BOOK_CLUB_AVATAR_KEYS = [
  "reading-lamp", "open-book-pencil", "book-spines", "bookmark-page",
  "notebook-pen", "library-stamp", "books-glasses", "index-cards",
  "archive-box", "round-table-books", "paired-bookmarks", "book-dialogue",
  "question-card", "calendar-book", "feedback-sheet", "reading-notes",
  "banded-book", "desk-clock-book", "book-tote", "discussion-circle",
] as const;

export type BookClubAvatarKey = (typeof BOOK_CLUB_AVATAR_KEYS)[number];

export const DEFAULT_BOOK_CLUB_AVATAR_KEY: BookClubAvatarKey = "archive-box";

const keySet = new Set<string>(BOOK_CLUB_AVATAR_KEYS);

export function isBookClubAvatarKey(value: unknown): value is BookClubAvatarKey {
  return typeof value === "string" && keySet.has(value);
}

export function normalizeBookClubAvatarKey(value: unknown): BookClubAvatarKey {
  return isBookClubAvatarKey(value) ? value : DEFAULT_BOOK_CLUB_AVATAR_KEY;
}

export function bookClubAvatarSrc(value: unknown) {
  return `/assets/avatars/book-club/${normalizeBookClubAvatarKey(value)}.webp`;
}
