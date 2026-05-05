import {
  HOST_DASHBOARD_REMINDER_UNAVAILABLE_REASON as REMINDER_UNAVAILABLE_REASON,
} from "@/features/host/model/host-dashboard-model";

export const HOST_DASHBOARD_LABELS = {
  attention: "오늘의 운영 판단",
  upcoming: "세션 준비 문서",
  operationTimeline: "운영 일정",
  memberStatus: "멤버 참여",
  publishFeedback: "공개 · 피드백",
  invitePipeline: "멤버 초대 관리",
  nextActionSection: "우선 처리할 일",
  nextAction: "다음 운영 액션",
  quickActions: "운영 액션 목록",
  notifications: "알림 발송",
} as const;

export const SESSION_REQUIRED_REASON = "현재 세션을 먼저 만든 뒤 사용할 수 있습니다.";
const AGGREGATE_PUBLICATION_REASON =
  "공개 대기 건수는 여러 세션을 합산한 값이라 세션 기록에서 정확한 회차를 선택해야 합니다.";
const AGGREGATE_FEEDBACK_REASON =
  "피드백 문서 대기 건수는 여러 세션을 합산한 값이라 세션 기록에서 정확한 회차를 선택해야 합니다.";

export const quickActions = [
  {
    label: "질문 마감 리마인더 발송",
    target: "disabled",
    icon: "notes",
    unavailableReason: REMINDER_UNAVAILABLE_REASON,
    statusLabel: "준비 중",
  },
  {
    label: "공개 요약 편집",
    target: "aggregate-guidance",
    icon: "edit",
    unavailableReason: AGGREGATE_PUBLICATION_REASON,
    statusLabel: "회차 선택",
  },
  {
    label: "피드백 문서 등록",
    target: "aggregate-guidance",
    icon: "notes",
    unavailableReason: AGGREGATE_FEEDBACK_REASON,
    statusLabel: "회차 선택",
  },
  { label: "참석 확정 마감", target: "session-edit", icon: "check" },
] as const;

export const newSessionHref = "/app/host/sessions/new";
