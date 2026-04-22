import { PUBLIC_INTRODUCTION_FALLBACK, PUBLIC_TAGLINE_FALLBACK } from "@/features/public/model/public-copy";

export type PublicSessionListItemView = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  summary: string;
  highlightCount: number;
  oneLinerCount: number;
};

export type PublicClubView = {
  clubName: string;
  tagline: string;
  about: string;
  stats: {
    sessions: number;
    books: number;
    members: number;
  };
  recentSessions: PublicSessionListItemView[];
};

export type PublicOneLinerView = {
  authorName: string;
  authorShortName: string;
  text: string;
};

export type PublicSessionDetailView = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  summary: string;
  highlights: string[];
  oneLiners: PublicOneLinerView[];
};

export function displayText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function nonNegativeCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

export function formatDateLabel(value: string | null | undefined, fallback = "미정") {
  const text = displayText(value, fallback);
  if (text === fallback) {
    return fallback;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    return text;
  }

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return text;
  }

  return `${year}.${month}.${day}`;
}

export function getPublicSessionListItemDisplay(session: PublicSessionListItemView) {
  return {
    title: displayText(session.bookTitle, "도서 제목 미정"),
    author: displayText(session.bookAuthor, "저자 미상"),
    date: formatDateLabel(session.date),
    summary: displayText(session.summary, "공개 요약이 아직 준비되지 않았습니다."),
    highlightCount: nonNegativeCount(session.highlightCount),
    oneLinerCount: nonNegativeCount(session.oneLinerCount),
  };
}

export function getPublicClubDisplay(data: PublicClubView) {
  return {
    clubName: displayText(data.clubName, "읽는사이"),
    tagline: displayText(data.tagline, PUBLIC_TAGLINE_FALLBACK),
    about: displayText(data.about, PUBLIC_INTRODUCTION_FALLBACK),
    stats: {
      sessions: nonNegativeCount(data.stats.sessions),
      books: nonNegativeCount(data.stats.books),
      members: nonNegativeCount(data.stats.members),
    },
  };
}

export function getPublicRecordsDisplay(data: PublicClubView) {
  const club = getPublicClubDisplay(data);
  const recentCount = data.recentSessions.length;
  const publicSessionCount = nonNegativeCount(data.stats.sessions);
  const showsRecentSubset = publicSessionCount > recentCount;

  return {
    ...club,
    recentCount,
    publicSessionCount,
    showsRecentSubset,
    countLabel: showsRecentSubset ? `최근 ${recentCount}개 공개 기록` : `공개 기록 ${recentCount}개`,
  };
}

export function getPublicSessionDetailDisplay(session: PublicSessionDetailView) {
  return {
    bookTitle: displayText(session.bookTitle, "도서 제목 미정"),
    bookAuthor: displayText(session.bookAuthor, "저자 미상"),
    dateLabel: formatDateLabel(session.date),
    summary: displayText(session.summary, "공개 요약이 아직 준비되지 않았습니다."),
  };
}
