import type { HostMemberProfileErrorCode } from "@/features/host/ui/host-ui-types";

const hostProfileNotEditableMessage = "수정할 수 없는 멤버입니다.";
const hostProfileUnknownErrorMessage = "이름 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
const hostProfileFailureMessages = new Set([
  "이름을 입력해 주세요.",
  "이름은 20자 이하로 입력해 주세요.",
  "이름으로 쓸 수 없는 형식입니다.",
  "시스템에서 쓰는 이름은 사용할 수 없습니다.",
  "같은 클럽에서 이미 쓰고 있는 이름입니다.",
  hostProfileNotEditableMessage,
  hostProfileUnknownErrorMessage,
]);

export function hostProfileErrorMessage(status: number, code: HostMemberProfileErrorCode | null) {
  if (status === 403 || status === 404) {
    return hostProfileNotEditableMessage;
  }

  switch (code) {
    case "DISPLAY_NAME_REQUIRED":
      return "이름을 입력해 주세요.";
    case "DISPLAY_NAME_TOO_LONG":
      return "이름은 20자 이하로 입력해 주세요.";
    case "DISPLAY_NAME_INVALID":
      return "이름으로 쓸 수 없는 형식입니다.";
    case "DISPLAY_NAME_RESERVED":
      return "시스템에서 쓰는 이름은 사용할 수 없습니다.";
    case "DISPLAY_NAME_DUPLICATE":
      return "같은 클럽에서 이미 쓰고 있는 이름입니다.";
    case "HOST_ROLE_REQUIRED":
    case "MEMBER_NOT_FOUND":
    case "MEMBERSHIP_NOT_ALLOWED":
      return hostProfileNotEditableMessage;
    default:
      return hostProfileUnknownErrorMessage;
  }
}

export function profileFailureMessage(error: unknown) {
  if (error instanceof Error && hostProfileFailureMessages.has(error.message)) {
    return error.message;
  }

  return hostProfileUnknownErrorMessage;
}
