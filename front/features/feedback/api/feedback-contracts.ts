export type FeedbackDocumentResponse = {
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
  participants: Array<{
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
