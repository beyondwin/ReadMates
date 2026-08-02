import type {
  HostNotificationEventType,
  ManualNotificationAudience,
  ManualNotificationRequestedChannels,
} from "@/features/host/model/host-view-types";
import { compatibilityExposureLabel } from "@/features/host/model/session-exposure-model";

export const manualChannelLabels: Record<ManualNotificationRequestedChannels, string> = {
  BOTH: "앱 + 이메일",
  IN_APP: "앱 알림",
  EMAIL: "이메일",
};

export const manualChannelDescriptions: Record<ManualNotificationRequestedChannels, string> = {
  BOTH: "가능한 두 채널 모두 사용",
  IN_APP: "ReadMates 안에서만 안내",
  EMAIL: "수신 가능한 이메일로만 발송",
};

export const manualAudienceLabels: Record<ManualNotificationAudience, string> = {
  ALL_ACTIVE_MEMBERS: "전체 활성 멤버",
  SESSION_PARTICIPANTS: "세션 참가자",
  CONFIRMED_ATTENDEES: "참석 확정자",
  SELECTED_MEMBERS: "직접 선택",
};

export const manualAudienceDescriptions: Record<ManualNotificationAudience, string> = {
  ALL_ACTIVE_MEMBERS: "현재 모임에 참여 중인 활성 멤버 모두",
  SESSION_PARTICIPANTS: "이 회차에 참여 중인 멤버",
  CONFIRMED_ATTENDEES: "이 회차 참석을 확정한 멤버",
  SELECTED_MEMBERS: "검색해 한 명 이상 직접 지정",
};

export const manualTemplateDescriptions: Record<HostNotificationEventType, string> = {
  NEXT_BOOK_PUBLISHED: "다음 모임에서 읽을 책을 안내합니다.",
  SESSION_REMINDER_DUE: "일정과 참석 여부를 다시 안내합니다.",
  FEEDBACK_DOCUMENT_PUBLISHED: "정리된 피드백 문서를 멤버에게 안내합니다.",
  REVIEW_PUBLISHED: "새 독후감이 공개됐음을 안내합니다.",
  SESSION_RECORD_UPDATED: "수정된 모임 기록을 멤버에게 안내합니다.",
};

const sessionStateLabels: Record<string, string> = {
  DRAFT: "예정",
  OPEN: "진행 중",
  PUBLISHED: "공개됨",
  CLOSED: "종료",
};

export function manualSessionStateLabel(value: string): string {
  return sessionStateLabels[value] ?? "상태 확인 필요";
}

export function manualSessionVisibilityLabel(value: string): string {
  return compatibilityExposureLabel[value as keyof typeof compatibilityExposureLabel] ?? "공개 범위 확인 필요";
}
