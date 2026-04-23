export type PublicSessionListItem = {
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

export type PublicClubResponse = {
  clubName: string;
  tagline: string;
  about: string;
  stats: {
    sessions: number;
    books: number;
    members: number;
  };
  recentSessions: PublicSessionListItem[];
};

export type PublicOneLiner = {
  authorName: string;
  authorShortName: string;
  text: string;
};

export type PublicHighlight = {
  text: string;
  sortOrder: number;
  authorName: string | null;
  authorShortName: string | null;
};

export type PublicSessionDetailResponse = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  summary: string;
  highlights: PublicHighlight[];
  oneLiners: PublicOneLiner[];
};
