import type {
  SessionImportCommitResponse,
  SessionImportPreviewResponse,
  SessionImportRequest,
  SessionImportRecordPreview,
  SessionRecordVisibility,
} from "./host-view-types";

type SessionImportFileRequest = Omit<SessionImportRequest, "recordVisibility" | "expectedDraftRevision">;

export type SessionImportAuthorSummary = {
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  unmatchedAuthors: string[];
};

export type SessionImportReview = {
  canCommit: boolean;
  statusLabel: "저장 가능" | "확인 필요";
  statusTone: "success" | "danger";
  sessionLabel: string;
  replacementItems: string[];
  authorSummary: SessionImportAuthorSummary;
  authorStatusLabel: string;
  feedbackDocumentLabel: string;
  feedbackDocumentStatusLabel: string;
  blockingMessages: string[];
};

export type SessionImportCommitResult = {
  tone: "success";
  title: "초안 저장 완료";
  message: string;
  visibilityLabel: string;
  items: string[];
  nextAction: string;
};

export type SessionImportFailureStage =
  | "preview"
  | "commit-revalidation"
  | "commit-permission"
  | "commit-network"
  | "refresh";

export function buildSessionImportRequest(
  sourceJson: string,
  recordVisibility: SessionRecordVisibility,
  expectedDraftRevision: number | null = null,
): SessionImportRequest {
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
    expectedDraftRevision,
  };
}

export function sessionImportCanCommit(
  preview: SessionImportPreviewResponse | null,
  recordVisibility: SessionRecordVisibility = "MEMBER",
): boolean {
  return preview?.valid === true && preview.issues.length === 0 && isSaveableVisibility(recordVisibility);
}

export function sessionImportReplacementWarning(): string {
  return "가져오면 공유 초안의 요약, 하이라이트, 한줄평, 피드백 문서를 JSON 내용으로 교체합니다. live 기록은 바뀌지 않습니다.";
}

export function summarizeAuthorMatches(records: SessionImportRecordPreview[]): SessionImportAuthorSummary {
  const unmatchedAuthors = new Set<string>();
  let matchedCount = 0;

  for (const record of records) {
    if (record.authorMatched) {
      matchedCount += 1;
    } else {
      unmatchedAuthors.add(record.authorName);
    }
  }

  return {
    totalCount: records.length,
    matchedCount,
    unmatchedCount: records.length - matchedCount,
    unmatchedAuthors: Array.from(unmatchedAuthors),
  };
}

export function sessionImportReplacementSummary(preview: SessionImportPreviewResponse): string[] {
  return [
    "공개 요약 교체",
    `하이라이트 ${preview.highlights.length}개`,
    `한줄평 ${preview.oneLineReviews.length}개`,
    preview.feedbackDocument.title ?? preview.feedbackDocument.fileName,
  ];
}

export function buildSessionImportCommitResult(
  committed: SessionImportCommitResponse,
  preview: SessionImportPreviewResponse,
  recordVisibility: SessionRecordVisibility,
): SessionImportCommitResult {
  const feedbackDocumentLabel = preview.feedbackDocument.title?.trim() || "피드백 문서";

  return {
    tone: "success",
    title: "초안 저장 완료",
    message: committed.liveApplied
      ? "가져온 세션 기록의 적용 상태를 다시 확인해 주세요."
      : "가져온 세션 기록을 공유 초안으로 저장했습니다.",
    visibilityLabel: recordVisibilityLabel(recordVisibility),
    items: [
      "공개 요약 초안 교체",
      `하이라이트 ${preview.highlights.length}개 초안 저장`,
      `한줄평 ${preview.oneLineReviews.length}개 초안 저장`,
      `피드백 문서 초안 저장: ${feedbackDocumentLabel}`,
    ],
    nextAction: "검토 후 변경사항을 반영하기 전까지 멤버와 공개 화면은 바뀌지 않습니다.",
  };
}

export function sessionImportFailureMessage(stage: SessionImportFailureStage): string {
  if (stage === "preview") {
    return "가져온 JSON에서 수정할 항목이 있습니다.";
  }

  if (stage === "commit-revalidation") {
    return "저장 전 검증 상태가 바뀌었습니다. 미리보기를 다시 실행한 뒤 저장해 주세요.";
  }

  if (stage === "commit-permission") {
    return "가져온 세션 기록 저장에 실패했습니다. 현재 클럽과 호스트 권한을 확인해 주세요.";
  }

  if (stage === "refresh") {
    return "저장은 완료되었을 수 있습니다. 세션 문서를 새로 불러와 저장 결과를 확인해 주세요.";
  }

  return "가져온 세션 기록 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
}

export function buildSessionImportReview(
  preview: SessionImportPreviewResponse,
  recordVisibility: SessionRecordVisibility,
): SessionImportReview {
  const canCommit = sessionImportCanCommit(preview, recordVisibility);
  const authorSummary = summarizeAuthorMatches([...preview.highlights, ...preview.oneLineReviews]);
  const blockingMessages = buildSessionImportBlockingMessages(preview, recordVisibility);

  return {
    canCommit,
    statusLabel: canCommit ? "저장 가능" : "확인 필요",
    statusTone: buildSessionImportStatusTone(canCommit),
    sessionLabel: buildSessionLabel(preview),
    replacementItems: sessionImportReplacementSummary(preview),
    authorSummary,
    authorStatusLabel:
      authorSummary.unmatchedCount === 0 ? "작성자 매칭 완료" : `작성자 ${authorSummary.unmatchedCount}개 확인 필요`,
    feedbackDocumentLabel: preview.feedbackDocument.title ?? preview.feedbackDocument.fileName,
    feedbackDocumentStatusLabel: preview.feedbackDocument.valid
      ? "피드백 문서 구조 확인 완료"
      : "피드백 문서 구조 확인 필요",
    blockingMessages,
  };
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

function isSaveableVisibility(recordVisibility: SessionRecordVisibility): boolean {
  return recordVisibility === "MEMBER" || recordVisibility === "PUBLIC";
}

function recordVisibilityLabel(recordVisibility: SessionRecordVisibility): string {
  if (recordVisibility === "PUBLIC") {
    return "외부 공개";
  }

  if (recordVisibility === "MEMBER") {
    return "멤버 공개";
  }

  return "호스트 전용";
}

function buildSessionImportStatusTone(canCommit: boolean): SessionImportReview["statusTone"] {
  return canCommit ? "success" : "danger";
}

function buildSessionLabel(preview: SessionImportPreviewResponse): string {
  const sessionNumber = preview.session.sessionNumber === null ? "회차 확인 필요" : `${preview.session.sessionNumber}회차`;
  const bookTitle = preview.session.bookTitle ?? "책 제목 확인 필요";
  const meetingDate = preview.session.meetingDate ?? "날짜 확인 필요";

  return `${sessionNumber} · ${bookTitle} · ${meetingDate}`;
}

function buildSessionImportBlockingMessages(
  preview: SessionImportPreviewResponse,
  recordVisibility: SessionRecordVisibility,
): string[] {
  const messages: string[] = [];

  if (!isSaveableVisibility(recordVisibility)) {
    messages.push("기록 공개 범위를 MEMBER 또는 PUBLIC으로 바꾼 뒤 저장할 수 있습니다.");
  }
  if (!preview.feedbackDocument.valid) {
    messages.push("피드백 문서 구조를 확인해 주세요.");
  }

  for (const issue of preview.issues) {
    messages.push(issue.message);
  }

  return Array.from(new Set(messages));
}
