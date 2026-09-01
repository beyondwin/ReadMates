export type ApprovedMockupEntry = {
  id: string;
  role: "admin" | "host";
  referencePath: string;
  sha256: string;
  referenceSize: { width: number; height: number };
  cssViewport: { width: number; height: number };
  dependencyPaths: readonly string[];
  ownerTest: string;
  maxDiffPixelRatio: 0.02;
  maxChannelDelta: 51;
  majorRegionToleranceCssPx: 4;
  repeatedAlignmentToleranceCssPx: 2;
};

const CONTRACT_DEFAULTS = {
  maxDiffPixelRatio: 0.02,
  maxChannelDelta: 51,
  majorRegionToleranceCssPx: 4,
  repeatedAlignmentToleranceCssPx: 2,
} as const;

const ADMIN_DESKTOP_SIZE = { width: 1672, height: 941 } as const;
const ADMIN_MOBILE_REFERENCE_SIZE = { width: 853, height: 1844 } as const;
const ADMIN_MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const HOST_DESKTOP_SIZE = { width: 1536, height: 1024 } as const;
const HOST_MOBILE_REFERENCE_SIZE = { width: 866, height: 1846 } as const;
const HOST_MOBILE_VIEWPORT = { width: 390, height: 832 } as const;

const TYPOGRAPHY_TOKEN_PATHS = [
  "src/styles/globals.css",
  "design/system/src/styles/tokens.css",
] as const;

const ADMIN_SHARED_DEPENDENCIES = [
  "features/platform-admin/ui/admin-shell.css",
  "features/platform-admin/ui/admin-page-patterns.css",
  "features/platform-admin/ui/admin-editorial-ledger.css",
  "features/platform-admin/route/admin-shell-layout.tsx",
  ...TYPOGRAPHY_TOKEN_PATHS,
] as const;

const ADMIN_TODAY_DEPENDENCIES = [
  "features/platform-admin/ui/admin-today-ledger.tsx",
  "features/platform-admin/ui/admin-today-controls.tsx",
  "features/platform-admin/ui/admin-operations-queue.tsx",
  "features/platform-admin/ui/admin-case-docket.tsx",
  "features/platform-admin/ui/admin-operation-mobile-detail.tsx",
  "features/platform-admin/ui/admin-editorial-ledger.fixtures.ts",
  "features/platform-admin/ui/admin-editorial-ledger.ct.tsx",
  "features/platform-admin/route/admin-today-route.tsx",
] as const;

const ADMIN_CLUBS_DEPENDENCIES = [
  "features/platform-admin/ui/admin-club-management.css",
  "features/platform-admin/ui/admin-clubs-ledger.tsx",
  "features/platform-admin/route/admin-clubs-route.tsx",
] as const;

const ADMIN_SERVICE_DEPENDENCIES = [
  "features/platform-admin/ui/admin-service-status.css",
  "features/platform-admin/ui/admin-health-grid.tsx",
  "features/platform-admin/route/admin-health-route.tsx",
] as const;

const ADMIN_RECORDS_DEPENDENCIES = [
  "features/platform-admin/ui/admin-processing-records.css",
  "features/platform-admin/ui/admin-audit-ledger.tsx",
  "features/platform-admin/route/admin-audit-route.tsx",
] as const;

const ADMIN_SPACE_SWITCHER_DEPENDENCIES = [
  "shared/ui/global-space-switcher.tsx",
  "features/platform-admin/route/admin-shell-layout.ct.tsx",
] as const;

const HOST_SHARED_DEPENDENCIES = [
  "shared/ui/app-club-shell.tsx",
  "features/host/ui/shell/host-shell.css",
  "features/host/ui/shell/host-primary-navigation.tsx",
  "features/host/ui/shell/host-shell.ct.tsx",
  "features/host/ui/host-editorial-ledger.css",
  ...TYPOGRAPHY_TOKEN_PATHS,
] as const;

const HOST_OPERATING_ROOM_DEPENDENCIES = [
  "features/host/ui/operating-room/host-operating-room-page.tsx",
  "features/host/ui/operating-room/operating-room.css",
  "features/host/ui/operating-room/host-operating-room-responsive.ct.tsx",
  "features/host/ui/workbox/host-workbox.css",
  "features/host/ui/workbox/host-workbox.tsx",
  "features/host/ui/workbox/host-work-item.tsx",
  "features/host/ui/session-closing-board.tsx",
  "features/host/ui/session-closing-board.css",
] as const;

const HOST_MEETINGS_DEPENDENCIES = [
  "features/host/ui/meeting-list/host-meeting-list.tsx",
  "features/host/ui/meeting-list/meeting-toc.css",
  "features/host/route/host-meeting-list-route.tsx",
] as const;

const HOST_PEOPLE_DEPENDENCIES = [
  "features/host/ui/members/member-list.tsx",
  "features/host/ui/members/member-ledger.css",
  "features/host/ui/host-members.tsx",
  "features/host/route/host-members-route.tsx",
] as const;

const HOST_RECORDS_DEPENDENCIES = [
  "features/host/ui/host-session-ledger.tsx",
  "features/host/route/host-session-ledger-route.tsx",
] as const;

const HOST_SETTINGS_DEPENDENCIES = [
  "features/host/ui/settings/host-club-settings.tsx",
  "features/host/ui/settings/host-invitation-links.tsx",
  "features/host/ui/host-invitations.tsx",
  "features/host/route/host-settings-route.tsx",
  "features/host/route/host-invitations-route.tsx",
] as const;

const HOST_SCHEDULE_REVIEW_DEPENDENCIES = [
  "features/host/ui/schedule-review/host-schedule-review-header.tsx",
  "features/host/route/host-schedule-review-route.tsx",
] as const;

const HOST_PERSON_DEPENDENCIES = [
  "features/host/ui/person/host-person-detail.tsx",
  "features/host/ui/person/host-person-detail.css",
  "features/host/route/host-person-detail-route.tsx",
] as const;

function entry(
  partial: Omit<
    ApprovedMockupEntry,
    "maxDiffPixelRatio" | "maxChannelDelta" | "majorRegionToleranceCssPx" | "repeatedAlignmentToleranceCssPx"
  >,
): ApprovedMockupEntry {
  return {
    ...partial,
    ...CONTRACT_DEFAULTS,
  };
}

export const APPROVED_MOCKUPS: readonly ApprovedMockupEntry[] = [
  entry({
    id: "admin-today-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/01-today-desktop.png",
    sha256: "5d4d778850e45bce7449002c186ccea6fa7f830d1cee76ff38a904b1971ea76b",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_TODAY_DEPENDENCIES],
    ownerTest: "admin-editorial-ledger.ct.tsx",
  }),
  entry({
    id: "admin-clubs-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/02-clubs-desktop.png",
    sha256: "273f2fbfc4df955ce837b0120cb9b518f10991be546c218d707ded9a32d67c91",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_CLUBS_DEPENDENCIES],
    ownerTest: "admin-editorial-ledger.ct.tsx",
  }),
  entry({
    id: "admin-service-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/03-service-status-desktop.png",
    sha256: "6b6af23ba5eb6b25437d5ff2bdbe50f9d9dcbf8e62092705ed28485a1a584b2b",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_SERVICE_DEPENDENCIES],
    ownerTest: "admin-editorial-ledger.ct.tsx",
  }),
  entry({
    id: "admin-records-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/04-processing-records-desktop.png",
    sha256: "0d318e14a7757e279cb4595a3bfc299335a6262a95edf23ed5c719b62940cbd3",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_RECORDS_DEPENDENCIES],
    ownerTest: "admin-editorial-ledger.ct.tsx",
  }),
  entry({
    id: "admin-space-switcher-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/05-space-switcher-desktop.png",
    sha256: "dfc9222888cf41cdd4f0e3c03c260be349f5fe3120068486f0151fc1a07578a8",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_SPACE_SWITCHER_DEPENDENCIES],
    ownerTest: "admin-shell-layout.ct.tsx",
  }),
  entry({
    id: "admin-today-mobile",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/06-today-mobile.png",
    sha256: "c3171752bfd56d7957dea6cfb06f4031692113024a0bf3b2bcc452f61b6d9aeb",
    referenceSize: ADMIN_MOBILE_REFERENCE_SIZE,
    cssViewport: ADMIN_MOBILE_VIEWPORT,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_TODAY_DEPENDENCIES],
    ownerTest: "admin-editorial-ledger.ct.tsx",
  }),
  entry({
    id: "admin-work-detail-mobile",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/07-work-detail-mobile.png",
    sha256: "a6098cbb77c991197e7e03e2b803438342a66daad3d83c46b2dc74b90de16291",
    referenceSize: ADMIN_MOBILE_REFERENCE_SIZE,
    cssViewport: ADMIN_MOBILE_VIEWPORT,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_TODAY_DEPENDENCIES],
    ownerTest: "admin-editorial-ledger.ct.tsx",
  }),
  entry({
    id: "host-prep-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/07-host-lifecycle-operating-room-approved.png",
    sha256: "fc5f8fd00301d90f3616c335306ca9cf99c59293589841ca3601afdbb04c25a9",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: "host-operating-room-responsive.ct.tsx",
  }),
  entry({
    id: "host-live-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/08-host-operating-room-live-approved.png",
    sha256: "9a0b50081506f266eccff15606e2e74da0b926b699166d9ce56020c8b263ff15",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: "host-operating-room-responsive.ct.tsx",
  }),
  entry({
    id: "host-closing-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/09-host-operating-room-closing-approved.png",
    sha256: "be94c7e1adc587d27c6f5e37b2a2f61f658d47e067b44961f8bb6e527542ac08",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: "host-operating-room-responsive.ct.tsx",
  }),
  entry({
    id: "host-meetings-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/10-host-meetings-library-approved.png",
    sha256: "7385c5f2369be3b3fcbfe7a87f737a4325802890e3dff2d9892161e0eed28f94",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_MEETINGS_DEPENDENCIES],
    ownerTest: "approved-host-ledgers.ct.tsx",
  }),
  entry({
    id: "host-people-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/11-host-people-ledger-approved.png",
    sha256: "a1b2afb663cc9cdf304563f189bc2306908eb9da28cb3da9cd94d47ba908c50f",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_PEOPLE_DEPENDENCIES],
    ownerTest: "approved-host-ledgers.ct.tsx",
  }),
  entry({
    id: "host-records-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/12-host-records-ledger-approved.png",
    sha256: "8ca899b88148f9491149017653d7d71e8b8d34642f4f8b92c794b5f3717254cf",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_RECORDS_DEPENDENCIES],
    ownerTest: "approved-host-ledgers.ct.tsx",
  }),
  entry({
    id: "host-settings-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/13-host-invites-settings-approved.png",
    sha256: "80cb99506f90337660fcf42857d5f556e8a92a9932cf0e3f9f15e39180675b95",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_SETTINGS_DEPENDENCIES],
    ownerTest: "approved-host-ledgers.ct.tsx",
  }),
  entry({
    id: "host-schedule-review-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/14-host-unread-schedule-review-approved.png",
    sha256: "ca58ef916dd5487dca5811f395ed44792febfa86a4c3bf60f4bd5f9333a0bd61",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_SCHEDULE_REVIEW_DEPENDENCIES],
    ownerTest: "approved-host-ledgers.ct.tsx",
  }),
  entry({
    id: "host-prep-mobile",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/15-mobile-host-operating-room-prep-approved.png",
    sha256: "fde68389cc111e6c9cfe06543a50ac749cca937f65f3cd4f07d7369796e3ec3a",
    referenceSize: HOST_MOBILE_REFERENCE_SIZE,
    cssViewport: HOST_MOBILE_VIEWPORT,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: "host-operating-room-responsive.ct.tsx",
  }),
  entry({
    id: "host-live-mobile",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/16-mobile-host-live-attendance-approved.png",
    sha256: "b3fd160481039d28857ee9de88593c897f4ee9a51a19de99fb395453ee4e33d5",
    referenceSize: HOST_MOBILE_REFERENCE_SIZE,
    cssViewport: HOST_MOBILE_VIEWPORT,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: "host-operating-room-responsive.ct.tsx",
  }),
  entry({
    id: "host-person-mobile",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/17-mobile-host-person-detail-approved.png",
    sha256: "12c542d4d409f2390c987acbb2c0bed886fa874bfe256f4fda8653df1afe44c5",
    referenceSize: HOST_MOBILE_REFERENCE_SIZE,
    cssViewport: HOST_MOBILE_VIEWPORT,
    dependencyPaths: [
      ...HOST_SHARED_DEPENDENCIES,
      ...HOST_PERSON_DEPENDENCIES,
      ...HOST_PEOPLE_DEPENDENCIES,
    ],
    ownerTest: "approved-host-ledgers.ct.tsx",
  }),
];

export function approvedMockupsAffectedBy(changedPaths: readonly string[]): readonly ApprovedMockupEntry[] {
  const normalized = new Set(changedPaths.map((path) => path.replace(/^front\//, "")));
  return APPROVED_MOCKUPS.filter((entry) => entry.dependencyPaths.some((path) => normalized.has(path)));
}
