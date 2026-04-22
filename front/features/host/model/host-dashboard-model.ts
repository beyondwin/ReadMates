export type HostDashboardRsvpStatus = "NO_RESPONSE" | "GOING" | "DECLINED" | "MAYBE";
export type HostDashboardAlertTone = "warn" | "default" | "accent" | "ok";
export type HostChecklistState = "complete" | "pending" | "guidance";

export type HostDashboardCurrentSession = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  date: string;
  startTime: string;
  locationLabel: string;
  meetingUrl: string | null;
  attendees: Array<{
    rsvpStatus: HostDashboardRsvpStatus;
  }>;
  board: {
    questions: unknown[];
    checkins: unknown[];
  };
};

export type HostDashboardData = {
  rsvpPending: number;
  checkinMissing: number;
  publishPending: number;
  feedbackPending: number;
  currentSessionMissingMemberCount?: number;
  currentSessionMissingMembers?: HostDashboardMissingMember[];
};

export type HostDashboardMissingMember = {
  membershipId: string;
  displayName: string;
  email: string;
};

export type MissingCurrentSessionMembersSummary = {
  count: number;
  members: HostDashboardMissingMember[];
};

export type HostDashboardSessionPhase = {
  eyebrow: string;
  title: string;
  status: string;
  helper: string;
  tone: HostDashboardAlertTone;
};

export type HostDashboardSessionMetric = readonly [label: string, value: string];

export type HostDashboardPublicationFeedbackRow = {
  label: string;
  value: string;
  helper: string;
  tone: "accent" | "warn" | "ok";
};

export type HostDashboardNextOperationAction = {
  title: string;
  helper: string;
  href: string | null;
  label?: string;
  unavailableReason?: string;
};

export type HostChecklistItem = {
  id: string;
  when: string;
  title: string;
  helper: string;
  state: HostChecklistState;
  statusLabel: string;
  action?: {
    label: string;
    unavailableReason: string;
  };
};

export const HOST_DASHBOARD_REMINDER_UNAVAILABLE_REASON =
  "리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다.";

const questionLimitPerMember = 5;

export function hostSessionEditHref(sessionId: string) {
  return `/app/host/sessions/${encodeURIComponent(sessionId)}/edit`;
}

export function nonNegativeDashboardCount(value: number) {
  return Math.max(0, value);
}

export function formatHostSessionDday(sessionDate: string, now: Date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return "D-day";
  }

  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}

export function getHostDashboardSessionPhase(
  session: HostDashboardCurrentSession | null,
  now = new Date(),
): HostDashboardSessionPhase {
  if (!session) {
    return {
      eyebrow: "EMPTY",
      title: "열린 세션 없음",
      status: "세션 필요",
      helper: "새 세션 문서를 만들면 멤버 홈, RSVP, 질문 작성 흐름이 열립니다.",
      tone: "default",
    };
  }

  const dday = formatHostSessionDday(session.date, now);

  if (dday === "D-day") {
    return {
      eyebrow: `No.${String(session.sessionNumber).padStart(2, "0")} · D-day`,
      title: "오늘 진행 세션",
      status: "진행 중",
      helper: "참석 응답, 체크인, 미팅 링크를 바로 확인해야 합니다.",
      tone: "warn",
    };
  }

  if (dday?.startsWith("D-")) {
    return {
      eyebrow: `No.${String(session.sessionNumber).padStart(2, "0")} · ${dday}`,
      title: "다가오는 세션",
      status: "준비 중",
      helper: "책 정보, 일정, 참석 응답, 질문 작성 현황을 준비합니다.",
      tone: "accent",
    };
  }

  return {
    eyebrow: `No.${String(session.sessionNumber).padStart(2, "0")} · ${dday ?? "일정 확인"}`,
    title: "종료일이 지난 열린 세션",
    status: "마감 필요",
    helper: "출석 확정, 공개 요약, 피드백 문서 등록을 마무리해야 합니다.",
    tone: "warn",
  };
}

export function getHostDashboardSessionMetrics(
  session: HostDashboardCurrentSession,
  statusLabel: string,
): HostDashboardSessionMetric[] {
  const attendeeCount = session.attendees.length;
  const goingCount = session.attendees.filter((attendee) => attendee.rsvpStatus === "GOING").length;
  const checkinCount = session.board.checkins.length;
  const questionCount = session.board.questions.length;
  const questionCapacity = attendeeCount * questionLimitPerMember;

  return [
    ["참석", `${goingCount}/${session.attendees.length}`],
    ["체크인", `${checkinCount}/${attendeeCount}`],
    ["질문", `${questionCount}/${questionCapacity}`],
    ["상태", statusLabel],
  ];
}

export function getHostDashboardPublicationFeedbackRows(
  data: HostDashboardData,
): HostDashboardPublicationFeedbackRow[] {
  const publishPending = nonNegativeDashboardCount(data.publishPending);
  const feedbackPending = nonNegativeDashboardCount(data.feedbackPending);

  return [
    {
      label: "공개 기록",
      value: publishPending > 0 ? `${publishPending}개 대기` : "대기 없음",
      helper: publishPending > 0 ? "공개 요약과 하이라이트 편집이 필요합니다." : "공개 대기 중인 이전 세션이 없습니다.",
      tone: publishPending > 0 ? "accent" : "ok",
    },
    {
      label: "피드백 문서",
      value: feedbackPending > 0 ? `${feedbackPending}개 대기` : "대기 없음",
      helper: feedbackPending > 0 ? "회차 피드백 문서 업로드가 필요합니다." : "문서 등록 대기 중인 이전 세션이 없습니다.",
      tone: feedbackPending > 0 ? "warn" : "ok",
    },
  ];
}

export function getMissingCurrentSessionMembersSummary(
  data: HostDashboardData,
  resolvedMemberIds: Set<string>,
): MissingCurrentSessionMembersSummary | null {
  const members = (data.currentSessionMissingMembers ?? []).filter(
    (member) => !resolvedMemberIds.has(member.membershipId),
  );
  const count = data.currentSessionMissingMembers
    ? members.length
    : Math.max(0, (data.currentSessionMissingMemberCount ?? 0) - resolvedMemberIds.size);

  if (count <= 0) {
    return null;
  }

  return {
    count,
    members,
  };
}

export function getHostDashboardNextOperationAction(
  session: HostDashboardCurrentSession | null,
  data: HostDashboardData,
  missingMembers: MissingCurrentSessionMembersSummary | null,
): HostDashboardNextOperationAction {
  if (missingMembers) {
    return {
      title: "새 멤버의 이번 세션 참여 여부 결정",
      helper: "멤버 승인 직후 현재 세션 roster와 비교해 나온 항목입니다. 아래 알림에서 바로 처리할 수 있습니다.",
      href: null,
      label: "알림에서 처리",
      unavailableReason: "아래 멤버별 버튼으로 처리하면 이 알림에서 사라집니다.",
    };
  }

  if (!session) {
    return {
      title: "새 세션 문서 만들기",
      helper: "운영을 시작하려면 책, 일정, 장소 또는 링크를 먼저 확정해야 합니다.",
      href: null,
      unavailableReason: "아래 세션 준비 문서에서 새 세션 만들기를 사용하세요.",
    };
  }

  const rsvpPending = nonNegativeDashboardCount(data.rsvpPending);
  if (rsvpPending > 0) {
    return {
      title: "RSVP 미응답 확인",
      helper: `아직 ${rsvpPending}명이 응답하지 않았습니다. 리마인더 자동 발송은 연결되지 않았으므로 멤버 상태를 수동 확인하세요.`,
      href: hostSessionEditHref(session.sessionId),
      label: "세션 문서 열기",
    };
  }

  const checkinMissing = nonNegativeDashboardCount(data.checkinMissing);
  if (checkinMissing > 0) {
    return {
      title: "체크인과 질문 작성 현황 확인",
      helper: `체크인 미작성 ${checkinMissing}명이 있습니다. 참석 roster와 질문 수를 같이 확인하세요.`,
      href: hostSessionEditHref(session.sessionId),
      label: "세션 문서 열기",
    };
  }

  if (nonNegativeDashboardCount(data.publishPending) > 0) {
    return {
      title: "공개 요약 정리",
      helper: "공개 대기 건수는 여러 세션을 합산한 값입니다. 현재 열린 세션으로 바로 이동하지 말고 세션 기록에서 정확한 회차를 선택하세요.",
      href: null,
      label: "세션 기록에서 선택",
      unavailableReason: "대시보드는 집계 건수만 제공하므로 특정 세션 편집 화면을 바로 열 수 없습니다.",
    };
  }

  if (nonNegativeDashboardCount(data.feedbackPending) > 0) {
    return {
      title: "피드백 문서 등록",
      helper: "피드백 문서 대기 건수는 여러 세션을 합산한 값입니다. 현재 열린 세션으로 바로 이동하지 말고 세션 기록에서 정확한 회차를 선택하세요.",
      href: null,
      label: "세션 기록에서 선택",
      unavailableReason: "대시보드는 집계 건수만 제공하므로 특정 세션 편집 화면을 바로 열 수 없습니다.",
    };
  }

  return {
    title: "대기 중인 운영 항목 없음",
    helper: "현재 세션의 운영 흐름이 안정적입니다. 다음 변경은 세션 문서에서 기록하세요.",
    href: hostSessionEditHref(session.sessionId),
    label: "세션 문서 확인",
  };
}

export function getHostDashboardChecklist(
  session: HostDashboardCurrentSession | null,
  data: HostDashboardData,
): HostChecklistItem[] {
  const rsvpPending = nonNegativeDashboardCount(data.rsvpPending);
  const publishPending = nonNegativeDashboardCount(data.publishPending);
  const feedbackPending = nonNegativeDashboardCount(data.feedbackPending);
  const hasSession = session !== null;
  const hasCoreSessionInfo = Boolean(
    session?.bookTitle.trim() && session.bookAuthor.trim() && session.date && session.startTime && session.locationLabel.trim(),
  );
  const hasMeetingUrl = Boolean(session?.meetingUrl?.trim());
  const rsvpAndMeetingReady = hasSession && rsvpPending === 0 && hasMeetingUrl;
  const rsvpMeetingHelper = !hasSession
    ? "세션을 만들면 RSVP와 미팅 URL을 확인할 수 있습니다."
    : rsvpAndMeetingReady
      ? "RSVP와 미팅 URL이 준비됐습니다."
      : [rsvpPending > 0 ? `RSVP 미응답 ${rsvpPending}명` : null, hasMeetingUrl ? null : "미팅 URL 없음"]
          .filter(Boolean)
          .join(" · ");

  return [
    {
      id: "session-basics",
      when: "7일 전",
      title: "책 정보와 일정 점검",
      helper: hasSession ? "현재 세션 정보 기준으로 계산합니다." : "세션을 만들면 상태를 확인할 수 있습니다.",
      state: !hasSession ? "guidance" : hasCoreSessionInfo ? "complete" : "pending",
      statusLabel: !hasSession ? "안내" : hasCoreSessionInfo ? "완료" : "확인 필요",
    },
    {
      id: "question-guide",
      when: "3일 전",
      title: "질문 작성 안내",
      helper: "안내 발송 여부를 확인하는 기능이 아직 연결되지 않아 운영 가이드로 표시합니다.",
      state: "guidance",
      statusLabel: "안내",
    },
    {
      id: "question-reminder",
      when: "1일 전",
      title: "질문 제출 마감 리마인더",
      helper: HOST_DASHBOARD_REMINDER_UNAVAILABLE_REASON,
      state: "guidance",
      statusLabel: "안내",
      action: {
        label: "지금 발송",
        unavailableReason: HOST_DASHBOARD_REMINDER_UNAVAILABLE_REASON,
      },
    },
    {
      id: "rsvp-meeting",
      when: "당일",
      title: "참석 응답과 미팅 URL 점검",
      helper: rsvpMeetingHelper,
      state: !hasSession ? "guidance" : rsvpAndMeetingReady ? "complete" : "pending",
      statusLabel: !hasSession ? "안내" : rsvpAndMeetingReady ? "완료" : "확인 필요",
    },
    {
      id: "publication",
      when: "1일 후",
      title: "공개 요약과 하이라이트 편집",
      helper: publishPending > 0 ? `공개 대기 세션 ${publishPending}개` : "공개 대기 중인 이전 세션이 없습니다.",
      state: publishPending > 0 ? "pending" : "guidance",
      statusLabel: publishPending > 0 ? "확인 필요" : "안내",
    },
    {
      id: "feedback",
      when: "3~5일 후",
      title: "피드백 문서 등록",
      helper: feedbackPending > 0 ? `피드백 문서 등록 대기 ${feedbackPending}개` : "피드백 문서 등록 대기 중인 이전 세션이 없습니다.",
      state: feedbackPending > 0 ? "pending" : "guidance",
      statusLabel: feedbackPending > 0 ? "확인 필요" : "안내",
    },
  ];
}
