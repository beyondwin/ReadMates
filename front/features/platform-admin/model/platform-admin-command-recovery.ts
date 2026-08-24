export type AdminCommandRecoveryKind =
  | "RESTART_PREVIEW"
  | "REFRESH_STATE"
  | "RESTART_INTENT"
  | "CORRECT_DRAFT"
  | "RETRY_SAME_INTENT";

export type AdminCommandRecovery = {
  kind: AdminCommandRecoveryKind;
  message: string;
};

const PREVIEW_RESTART_CODES = new Set([
  "PREVIEW_NOT_FOUND",
  "PREVIEW_EXPIRED",
  "PREVIEW_CONSUMED",
  "PREVIEW_MISMATCH",
]);
const DRAFT_CORRECTION_CODES = new Set([
  "CLUB_SLUG_CONFLICT",
  "CLUB_DOMAIN_CONFLICT",
  "CLUB_PUBLISH_NOT_ALLOWED",
  "CLUB_HOST_REQUIRED",
  "EXISTING_USER_CONFIRMATION_REQUIRED",
  "INVALID_IDEMPOTENCY_KEY",
  "INVALID_CLUB",
  "INVALID_DOMAIN",
]);

export function adminCommandRecovery(error: unknown): AdminCommandRecovery {
  const code = errorCode(error);
  if (PREVIEW_RESTART_CODES.has(code)) {
    return {
      kind: "RESTART_PREVIEW",
      message:
        "미리보기가 만료되었거나 달라졌습니다. 새 미리보기를 만들어 다시 확인해 주세요.",
    };
  }
  if (code === "REVISION_CONFLICT") {
    return {
      kind: "REFRESH_STATE",
      message:
        "다른 변경이 먼저 반영되었습니다. 최신 상태를 불러온 뒤 다시 확인해 주세요.",
    };
  }
  if (code === "IDEMPOTENCY_CONFLICT") {
    return {
      kind: "RESTART_INTENT",
      message:
        "같은 명령 키에 다른 요청이 연결되었습니다. 새 명령으로 다시 시작해 주세요.",
    };
  }
  if (DRAFT_CORRECTION_CODES.has(code)) {
    return {
      kind: "CORRECT_DRAFT",
      message:
        "입력 또는 사전 조건을 바로잡은 뒤 새 미리보기로 다시 확인해 주세요.",
    };
  }
  if (code === "COMMAND_IN_PROGRESS") {
    return {
      kind: "RETRY_SAME_INTENT",
      message:
        "명령이 아직 처리 중입니다. 잠시 후 같은 명령으로 다시 확인해 주세요.",
    };
  }
  return {
    kind: "RETRY_SAME_INTENT",
    message:
      "명령 응답을 확인하지 못했습니다. 같은 명령으로 다시 시도할 수 있습니다.",
  };
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}
