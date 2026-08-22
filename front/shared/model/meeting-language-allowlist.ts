export type MeetingLanguageAllowlistKind =
  | "technical-login-session"
  | "wire-storage-compatibility"
  | "historical-fixture";

export type MeetingLanguageAllowlistEntry = {
  kind: MeetingLanguageAllowlistKind;
  relativePath: string;
  needle: string;
  owner: string;
  removalCondition: string;
};

export const MEETING_LANGUAGE_ALLOWLIST: readonly MeetingLanguageAllowlistEntry[] = [
  {
    kind: "technical-login-session",
    relativePath: "features/club-selection/ui/club-selection-page.tsx",
    needle: "로그인 세션",
    owner: "auth",
    removalCondition: "Remove when club switching copy no longer refers to a technical login session",
  },
  {
    kind: "technical-login-session",
    relativePath: "features/auth/ui/session-expiry-recovery.tsx",
    needle: "로그인 세션 만료",
    owner: "auth",
    removalCondition: "Remove when login-session recovery copy no longer uses 세션",
  },
  {
    kind: "technical-login-session",
    relativePath: "features/auth/ui/password-reset-card.tsx",
    needle: "서버 세션",
    owner: "auth",
    removalCondition: "Remove when password-reset copy no longer names the technical server session",
  },
  {
    kind: "technical-login-session",
    relativePath: "shared/ui/route-error.tsx",
    needle: "현재 세션을 확인할 수 없습니다",
    owner: "auth",
    removalCondition: "Remove when OAuth route-error copy no longer names the login session",
  },
  {
    kind: "technical-login-session",
    relativePath: "shared/auth/oauth-error.ts",
    needle: "현재 세션을 확인할 수 없습니다",
    owner: "auth",
    removalCondition: "Remove when OAuth error copy no longer names the login session",
  },
  {
    kind: "wire-storage-compatibility",
    relativePath: "features/member-home/model/member-home-view-model.ts",
    needle: 'return "RSVP"',
    owner: "member-home",
    removalCondition: "Remove when ReadingLoopMissingWork is renamed away from RSVP",
  },
  {
    kind: "wire-storage-compatibility",
    relativePath: "features/member-home/model/member-home-view-model.ts",
    needle: 'missing === "RSVP"',
    owner: "member-home",
    removalCondition: "Remove when ReadingLoopMissingWork is renamed away from RSVP",
  },
  {
    kind: "wire-storage-compatibility",
    relativePath: "shared/model/reading-loop.ts",
    needle: '| "RSVP"',
    owner: "reading-loop",
    removalCondition: "Remove when ReadingLoopMissingWork is renamed away from RSVP",
  },
  {
    kind: "wire-storage-compatibility",
    relativePath: "shared/model/reading-loop.ts",
    needle: 'case "RSVP"',
    owner: "reading-loop",
    removalCondition: "Remove when ReadingLoopMissingWork is renamed away from RSVP",
  },
  {
    kind: "wire-storage-compatibility",
    relativePath: "features/platform-admin/model/platform-admin-analytics-model.ts",
    needle: "RSVP_RATE",
    owner: "platform-admin.analytics",
    removalCondition: "Remove when the analytics KPI key is renamed away from RSVP",
  },
  {
    kind: "wire-storage-compatibility",
    relativePath: "features/platform-admin/api/platform-admin-analytics-contracts.ts",
    needle: "RSVP_RATE",
    owner: "platform-admin.analytics",
    removalCondition: "Remove when the analytics KPI contract key is renamed away from RSVP",
  },
];
