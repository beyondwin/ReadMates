export const READMATES_NAV_LABELS = {
  public: {
    intro: "소개",
    club: "클럽",
    publicRecords: "공개 기록",
    login: "로그인",
  },
  member: {
    home: "홈",
    currentSession: "이번 세션",
    clubNotes: "클럽 노트",
    archive: "아카이브",
    mySpace: "내 공간",
  },
  host: {
    operations: "운영",
    sessionEditor: "세션 편집",
    invitations: "멤버 초대",
    memberApproval: "멤버 승인",
  },
} as const;

export const READMATES_WORKSPACE_LABELS = {
  hostWorkspace: "호스트 화면",
  memberWorkspace: "멤버 화면",
  memberWorkspaceReturn: "멤버 화면으로",
} as const;
