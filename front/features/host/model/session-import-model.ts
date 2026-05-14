import type {
  SessionImportPreviewResponse,
  SessionImportRequest,
  SessionRecordVisibility,
} from "./host-view-types";

type SessionImportFileRequest = Omit<SessionImportRequest, "recordVisibility">;

export function buildSessionImportRequest(sourceJson: string, recordVisibility: SessionRecordVisibility): SessionImportRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceJson);
  } catch {
    throw new Error("JSON 파일을 읽을 수 없습니다.");
  }

  const fileRequest = parseSessionImportFileRequest(parsed);
  return {
    ...fileRequest,
    recordVisibility,
  };
}

export function sessionImportCanCommit(preview: SessionImportPreviewResponse | null): boolean {
  return preview?.valid === true && preview.issues.length === 0;
}

export function sessionImportReplacementWarning(): string {
  return "저장하면 이 회차의 요약, 하이라이트, 한줄평, 피드백 문서를 가져온 JSON 내용으로 교체합니다.";
}

function parseSessionImportFileRequest(value: unknown): SessionImportFileRequest {
  if (!isRecord(value) || value.format !== "readmates-session-import:v1") {
    throw new Error("readmates-session-import:v1 형식의 JSON 파일을 선택해 주세요.");
  }
  const session = requiredRecord(value.session, "session");
  const publication = requiredRecord(value.publication, "publication");
  const feedbackDocument = requiredRecord(value.feedbackDocument, "feedbackDocument");

  return {
    format: "readmates-session-import:v1",
    session: {
      number: requiredNumber(session.number, "session.number"),
      bookTitle: requiredString(session.bookTitle, "session.bookTitle"),
      meetingDate: requiredString(session.meetingDate, "session.meetingDate"),
    },
    publication: {
      summary: requiredString(publication.summary, "publication.summary"),
    },
    highlights: requiredRecords(value.highlights, "highlights").map(parseImportRecord),
    oneLineReviews: requiredRecords(value.oneLineReviews, "oneLineReviews").map(parseImportRecord),
    feedbackDocument: {
      fileName: requiredString(feedbackDocument.fileName, "feedbackDocument.fileName"),
      markdown: requiredString(feedbackDocument.markdown, "feedbackDocument.markdown"),
    },
  };
}

function parseImportRecord(value: Record<string, unknown>) {
  return {
    authorName: requiredString(value.authorName, "authorName"),
    text: requiredString(value.text, "text"),
  };
}

function requiredRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} 값을 확인해 주세요.`);
  }
  return value;
}

function requiredRecords(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error(`${fieldName} 목록을 확인해 주세요.`);
  }
  return value as Array<Record<string, unknown>>;
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} 값을 확인해 주세요.`);
  }
  return value;
}

function requiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} 값을 확인해 주세요.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
