import type { PagedResponse } from "@/shared/model/paging";

export type FeedbackDocumentListItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor?: string | null;
  bookImageUrl?: string | null;
  date: string;
  fileName: string;
  uploadedAt: string;
};

export type FeedbackDocumentListPage = PagedResponse<FeedbackDocumentListItem>;

export type FeedbackHighlightLine = {
  speaker: string;
  time: string | null;
  text: string;
};

export type FeedbackHighlight = {
  title: string;
  lines: FeedbackHighlightLine[];
  why: string;
};

export type FeedbackGroupPoint = {
  title: string;
  evidence: string;
  interpretation: string;
};

export type FeedbackGroupFeedback = {
  strengths: FeedbackGroupPoint[];
  improvements: FeedbackGroupPoint[];
  speakingShares: Array<{ name: string; percent: number }>;
  speakingNote: string | null;
  nextSteps: string[];
};

export type FeedbackTrend = {
  attendance: Array<{ label: string; count: number }>;
  phases: Array<{ label: string; text: string }>;
  repeatedTasks: Array<{ task: string; detail: string; status: string }>;
};

export type FeedbackSessionQuote = {
  time: string | null;
  quote: string;
  note: string;
};

// readmates-feedback:v2 optional sections (ADR-0072). v1 documents return empty lists or null.
export type FeedbackDocumentV2Fields = {
  templateVersion?: number;
  overview?: Array<{ label: string; value: string }>;
  highlights?: FeedbackHighlight[];
  groupFeedback?: FeedbackGroupFeedback | null;
  trend?: FeedbackTrend | null;
  followUpQuestions?: string[];
};

export type FeedbackParticipantV2Fields = {
  badges?: string[];
  journey?: Array<{ label: string; text: string }>;
  achievements?: string[];
  baseline?: string[];
  sessionQuotes?: FeedbackSessionQuote[];
};

export type FeedbackDocumentResponse = FeedbackDocumentV2Fields & {
  sessionId: string;
  sessionNumber: number;
  title: string;
  subtitle: string;
  bookTitle: string;
  date: string;
  fileName: string;
  uploadedAt: string;
  metadata: Array<{
    label: string;
    value: string;
  }>;
  observerNotes: string[];
  participants: Array<FeedbackParticipantV2Fields & {
    number: number;
    name: string;
    role: string;
    style: string[];
    contributions: string[];
    problems: Array<{
      title: string;
      core: string;
      evidence: string;
      interpretation: string;
    }>;
    actionItems: string[];
    revealingQuote: {
      quote: string;
      context: string;
      note: string;
    };
  }>;
};
