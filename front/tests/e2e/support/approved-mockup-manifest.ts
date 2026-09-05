export type ApprovedMockupId =
  | "admin-today-desktop"
  | "admin-clubs-desktop"
  | "admin-service-desktop"
  | "admin-records-desktop"
  | "admin-space-switcher-desktop"
  | "admin-today-mobile"
  | "admin-work-detail-mobile"
  | "host-prep-desktop"
  | "host-live-desktop"
  | "host-closing-desktop"
  | "host-meetings-desktop"
  | "host-people-desktop"
  | "host-records-desktop"
  | "host-settings-desktop"
  | "host-schedule-review-desktop"
  | "host-prep-mobile"
  | "host-live-mobile"
  | "host-person-mobile";

export type ApprovedMockupOwnerTest =
  | "front/tests/e2e/admin-approved-routes.spec.ts"
  | "front/tests/e2e/host-approved-routes.spec.ts";

export type ApprovedMockupEntry = {
  id: ApprovedMockupId;
  role: "admin" | "host";
  referencePath: string;
  sha256: string;
  referenceSize: { width: number; height: number };
  cssViewport: { width: number; height: number };
  dependencyPaths: readonly string[];
  ownerTest: ApprovedMockupOwnerTest;
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

const ADMIN_OWNER_TEST = "front/tests/e2e/admin-approved-routes.spec.ts" as const;
const HOST_OWNER_TEST = "front/tests/e2e/host-approved-routes.spec.ts" as const;

const TYPOGRAPHY_TOKEN_PATHS = [
  "front/src/styles/globals.css",
  "design/system/src/styles/tokens.css",
] as const;

const UNIVERSAL_DEPENDENCY_PATHS = [
  "package.json",
  "front/package.json",
  "pnpm-lock.yaml",
  "front/playwright.config.ts",
  ".github/workflows/ci.yml",
  "front/src/styles/globals.css",
  "design/system/src/styles/tokens.css",
  "front/tests/e2e/support/approved-mockup-manifest.ts",
  "front/tests/e2e/support/approved-mockup-contract.ts",
  "front/tests/e2e/support/approved-route-scenarios.ts",
  "front/tests/e2e/support/approved-route-harness.ts",
  "front/tests/e2e/support/approved-route-request-audit.ts",
  "front/tests/e2e/support/approved-route-geometry.ts",
  "front/tests/e2e/support/approved-route-structure.ts",
  "front/tests/e2e/support/approved-route-structure.test.ts",
  "front/tests/performance/visual-authority-docker.ts",
  "front/tests/performance/visual-authority-docker.test.ts",
  "front/scripts/run-visual-authority-docker.ts",
  "front/scripts/list-affected-visual-authorities.ts",
  "front/tests/e2e/approved-route-stress.spec.ts",
  "front/tests/e2e/support/approved-route-scenarios.test.ts",
  "front/tests/e2e/support/approved-route-request-audit.test.ts",
  "front/tests/unit/approved-mockup-contract.test.ts",
] as const;

const ADMIN_SHARED_DEPENDENCIES = [
  "front/features/platform-admin/ui/admin-shell.css",
  "front/features/platform-admin/ui/admin-page-patterns.css",
  "front/features/platform-admin/ui/admin-editorial-ledger.css",
  "front/features/platform-admin/route/admin-shell-layout.tsx",
  "front/src/app/routes/admin.tsx",
  "front/tests/e2e/admin-approved-routes.spec.ts",
  "front/tests/e2e/support/admin-approved-route-fixtures.ts",
  "front/tests/e2e/approved-route-auth-scope.spec.ts",
  ...TYPOGRAPHY_TOKEN_PATHS,
] as const;

const ADMIN_TODAY_DEPENDENCIES = [
  "front/features/platform-admin/ui/admin-today-ledger.tsx",
  "front/features/platform-admin/ui/admin-today-controls.tsx",
  "front/features/platform-admin/ui/admin-operations-queue.tsx",
  "front/features/platform-admin/ui/admin-case-docket.tsx",
  "front/features/platform-admin/ui/admin-operation-mobile-detail.tsx",
  "front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts",
  "front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx",
  "front/features/platform-admin/route/admin-today-route.tsx",
  "front/features/platform-admin/ui/admin-today.css",
  "front/features/platform-admin/model/platform-admin-operations-model.ts",
  "front/features/platform-admin/route/use-admin-today-controller.ts",
] as const;

const ADMIN_CLUBS_DEPENDENCIES = [
  "front/features/platform-admin/ui/admin-club-management.css",
  "front/features/platform-admin/ui/admin-clubs-ledger.tsx",
  "front/features/platform-admin/route/admin-clubs-route.tsx",
] as const;

const ADMIN_SERVICE_DEPENDENCIES = [
  "front/features/platform-admin/ui/admin-service-status.css",
  "front/features/platform-admin/ui/admin-health-grid.tsx",
  "front/features/platform-admin/route/admin-health-route.tsx",
] as const;

const ADMIN_RECORDS_DEPENDENCIES = [
  "front/features/platform-admin/ui/admin-processing-records.css",
  "front/features/platform-admin/ui/admin-audit-ledger.tsx",
  "front/features/platform-admin/route/admin-audit-route.tsx",
] as const;

const ADMIN_SPACE_SWITCHER_DEPENDENCIES = [
  "front/shared/ui/global-space-switcher.tsx",
  "front/features/platform-admin/route/admin-shell-layout.ct.tsx",
] as const;

const HOST_SHARED_DEPENDENCIES = [
  "front/shared/ui/app-club-shell.tsx",
  "front/features/host/ui/shell/host-shell.css",
  "front/features/host/ui/shell/host-primary-navigation.tsx",
  "front/features/host/ui/shell/host-shell.ct.tsx",
  "front/features/host/ui/host-editorial-ledger.css",
  "front/src/app/routes/host.tsx",
  "front/tests/e2e/host-approved-routes.spec.ts",
  "front/tests/e2e/support/host-approved-route-fixtures.ts",
  ...TYPOGRAPHY_TOKEN_PATHS,
] as const;

const HOST_OPERATING_ROOM_DEPENDENCIES = [
  "front/features/host/ui/operating-room/host-operating-room-page.tsx",
  "front/features/host/ui/operating-room/operating-room.css",
  "front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx",
  "front/features/host/ui/workbox/host-workbox.css",
  "front/features/host/ui/workbox/host-workbox.tsx",
  "front/features/host/ui/workbox/host-work-item.tsx",
  "front/features/host/ui/session-closing-board.tsx",
  "front/features/host/ui/session-closing-board.css",
  "front/features/host/model/host-workbox-model.ts",
  "front/features/host/route/host-dashboard-route.tsx",
] as const;

const HOST_MEETINGS_DEPENDENCIES = [
  "front/features/host/ui/meeting-list/host-meeting-list.tsx",
  "front/features/host/ui/meeting-list/meeting-toc.css",
  "front/features/host/route/host-meeting-list-route.tsx",
] as const;

const HOST_PEOPLE_DEPENDENCIES = [
  "front/features/host/ui/members/member-list.tsx",
  "front/features/host/ui/members/member-ledger.css",
  "front/features/host/ui/host-members.tsx",
  "front/features/host/route/host-members-route.tsx",
] as const;

const HOST_RECORDS_DEPENDENCIES = [
  "front/features/host/ui/host-session-ledger.tsx",
  "front/features/host/route/host-session-ledger-route.tsx",
] as const;

const HOST_SETTINGS_DEPENDENCIES = [
  "front/features/host/ui/settings/host-club-settings.tsx",
  "front/features/host/ui/settings/host-invitation-links.tsx",
  "front/features/host/ui/host-invitations.tsx",
  "front/features/host/route/host-settings-route.tsx",
  "front/features/host/route/host-invitations-route.tsx",
] as const;

const HOST_SCHEDULE_REVIEW_DEPENDENCIES = [
  "front/features/host/ui/schedule-review/host-schedule-review-header.tsx",
  "front/features/host/ui/schedule-review/host-schedule-review-page.tsx",
  "front/features/host/ui/schedule-review/host-schedule-review.css",
  "front/features/host/ui/notifications/manual-notification-preview.tsx",
  "front/features/host/route/host-schedule-review-route.tsx",
] as const;

const HOST_PERSON_DEPENDENCIES = [
  "front/features/host/ui/person/host-person-detail.tsx",
  "front/features/host/ui/person/host-person-detail.css",
  "front/features/host/route/host-person-detail-route.tsx",
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
    ownerTest: ADMIN_OWNER_TEST,
  }),
  entry({
    id: "admin-clubs-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/02-clubs-desktop.png",
    sha256: "273f2fbfc4df955ce837b0120cb9b518f10991be546c218d707ded9a32d67c91",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_CLUBS_DEPENDENCIES],
    ownerTest: ADMIN_OWNER_TEST,
  }),
  entry({
    id: "admin-service-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/03-service-status-desktop.png",
    sha256: "6b6af23ba5eb6b25437d5ff2bdbe50f9d9dcbf8e62092705ed28485a1a584b2b",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_SERVICE_DEPENDENCIES],
    ownerTest: ADMIN_OWNER_TEST,
  }),
  entry({
    id: "admin-records-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/04-processing-records-desktop.png",
    sha256: "0d318e14a7757e279cb4595a3bfc299335a6262a95edf23ed5c719b62940cbd3",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_RECORDS_DEPENDENCIES],
    ownerTest: ADMIN_OWNER_TEST,
  }),
  entry({
    id: "admin-space-switcher-desktop",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/05-space-switcher-desktop.png",
    sha256: "dfc9222888cf41cdd4f0e3c03c260be349f5fe3120068486f0151fc1a07578a8",
    referenceSize: ADMIN_DESKTOP_SIZE,
    cssViewport: ADMIN_DESKTOP_SIZE,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_SPACE_SWITCHER_DEPENDENCIES],
    ownerTest: ADMIN_OWNER_TEST,
  }),
  entry({
    id: "admin-today-mobile",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/06-today-mobile.png",
    sha256: "c3171752bfd56d7957dea6cfb06f4031692113024a0bf3b2bcc452f61b6d9aeb",
    referenceSize: ADMIN_MOBILE_REFERENCE_SIZE,
    cssViewport: ADMIN_MOBILE_VIEWPORT,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_TODAY_DEPENDENCIES],
    ownerTest: ADMIN_OWNER_TEST,
  }),
  entry({
    id: "admin-work-detail-mobile",
    role: "admin",
    referencePath: "../design/mockups/2026-08-30-admin-operations-redesign/07-work-detail-mobile.png",
    sha256: "a6098cbb77c991197e7e03e2b803438342a66daad3d83c46b2dc74b90de16291",
    referenceSize: ADMIN_MOBILE_REFERENCE_SIZE,
    cssViewport: ADMIN_MOBILE_VIEWPORT,
    dependencyPaths: [...ADMIN_SHARED_DEPENDENCIES, ...ADMIN_TODAY_DEPENDENCIES],
    ownerTest: ADMIN_OWNER_TEST,
  }),
  entry({
    id: "host-prep-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/07-host-lifecycle-operating-room-approved.png",
    sha256: "fc5f8fd00301d90f3616c335306ca9cf99c59293589841ca3601afdbb04c25a9",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-live-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/08-host-operating-room-live-approved.png",
    sha256: "9a0b50081506f266eccff15606e2e74da0b926b699166d9ce56020c8b263ff15",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-closing-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/09-host-operating-room-closing-approved.png",
    sha256: "be94c7e1adc587d27c6f5e37b2a2f61f658d47e067b44961f8bb6e527542ac08",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-meetings-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/10-host-meetings-library-approved.png",
    sha256: "7385c5f2369be3b3fcbfe7a87f737a4325802890e3dff2d9892161e0eed28f94",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_MEETINGS_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-people-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/11-host-people-ledger-approved.png",
    sha256: "a1b2afb663cc9cdf304563f189bc2306908eb9da28cb3da9cd94d47ba908c50f",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_PEOPLE_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-records-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/12-host-records-ledger-approved.png",
    sha256: "8ca899b88148f9491149017653d7d71e8b8d34642f4f8b92c794b5f3717254cf",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_RECORDS_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-settings-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/13-host-invites-settings-approved.png",
    sha256: "80cb99506f90337660fcf42857d5f556e8a92a9932cf0e3f9f15e39180675b95",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_SETTINGS_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-schedule-review-desktop",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/14-host-unread-schedule-review-approved.png",
    sha256: "ca58ef916dd5487dca5811f395ed44792febfa86a4c3bf60f4bd5f9333a0bd61",
    referenceSize: HOST_DESKTOP_SIZE,
    cssViewport: HOST_DESKTOP_SIZE,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_SCHEDULE_REVIEW_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-prep-mobile",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/15-mobile-host-operating-room-prep-approved.png",
    sha256: "fde68389cc111e6c9cfe06543a50ac749cca937f65f3cd4f07d7369796e3ec3a",
    referenceSize: HOST_MOBILE_REFERENCE_SIZE,
    cssViewport: HOST_MOBILE_VIEWPORT,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
  }),
  entry({
    id: "host-live-mobile",
    role: "host",
    referencePath: "../docs/development/host-redesign-mockups/16-mobile-host-live-attendance-approved.png",
    sha256: "b3fd160481039d28857ee9de88593c897f4ee9a51a19de99fb395453ee4e33d5",
    referenceSize: HOST_MOBILE_REFERENCE_SIZE,
    cssViewport: HOST_MOBILE_VIEWPORT,
    dependencyPaths: [...HOST_SHARED_DEPENDENCIES, ...HOST_OPERATING_ROOM_DEPENDENCIES],
    ownerTest: HOST_OWNER_TEST,
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
    ownerTest: HOST_OWNER_TEST,
  }),
];

const UNIVERSAL_DEPENDENCY_SET = new Set<string>(UNIVERSAL_DEPENDENCY_PATHS);
const ADMIN_IDS = APPROVED_MOCKUPS.filter((entry) => entry.role === "admin").map((entry) => entry.id);
const HOST_IDS = APPROVED_MOCKUPS.filter((entry) => entry.role === "host").map((entry) => entry.id);
const ALL_IDS = APPROVED_MOCKUPS.map((entry) => entry.id);

function canonicalizeRepositoryPath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\\/g, "/");
}

export function approvedReferenceRepositoryPath(entry: ApprovedMockupEntry): string {
  if (entry.referencePath.startsWith("../")) {
    return entry.referencePath.replace(/^\.\.\//, "");
  }
  return canonicalizeRepositoryPath(entry.referencePath);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isVisualSensitivePath(path: string): boolean {
  const normalized = canonicalizeRepositoryPath(path);
  if (UNIVERSAL_DEPENDENCY_SET.has(normalized)) return true;
  if (pathMatchesPrefix(normalized, "front/features/platform-admin")) return true;
  if (pathMatchesPrefix(normalized, "front/features/host")) return true;
  if (pathMatchesPrefix(normalized, "front/src/app/routes") && /(?:^|\/)(admin|host)\.tsx$/.test(normalized)) return true;
  if (pathMatchesPrefix(normalized, "front/src/app/host-routes")) return true;
  if (pathMatchesPrefix(normalized, "front/src/app/layouts")) return true;
  if (pathMatchesPrefix(normalized, "front/shared/ui")) return true;
  if (pathMatchesPrefix(normalized, "front/shared/auth")) return true;
  if (pathMatchesPrefix(normalized, "front/shared/styles")) return true;
  if (pathMatchesPrefix(normalized, "front/src/styles")) return true;
  if (pathMatchesPrefix(normalized, "design/system")) return true;
  if (pathMatchesPrefix(normalized, "design/mockups/2026-08-30-admin-operations-redesign")) return true;
  if (pathMatchesPrefix(normalized, "docs/development/host-redesign-mockups")) return true;
  if (pathMatchesPrefix(normalized, "front/tests/e2e/support") && normalized.includes("approved-")) return true;
  if (normalized === "front/tests/e2e/admin-approved-routes.spec.ts") return true;
  if (normalized === "front/tests/e2e/host-approved-routes.spec.ts") return true;
  if (normalized.startsWith("front/tests/e2e/approved-route-")) return true;
  if (normalized === "front/tests/performance/visual-authority-docker.ts") return true;
  if (normalized === "front/tests/performance/visual-authority-docker.test.ts") return true;
  if (normalized === "front/tests/unit/approved-mockup-contract.test.ts") return true;
  if (normalized === "front/scripts/run-visual-authority-docker.ts") return true;
  if (normalized === "front/scripts/list-affected-visual-authorities.ts") return true;
  return false;
}

function idsForExactDependency(path: string): ApprovedMockupId[] {
  return APPROVED_MOCKUPS
    .filter((entry) =>
      entry.dependencyPaths.includes(path) || approvedReferenceRepositoryPath(entry) === path,
    )
    .map((entry) => entry.id);
}

function idsForRolePartition(path: string): ApprovedMockupId[] {
  if (
    pathMatchesPrefix(path, "front/features/platform-admin")
    || path === "front/src/app/routes/admin.tsx"
    || path === "front/tests/e2e/admin-approved-routes.spec.ts"
    || path === "front/tests/e2e/support/admin-approved-route-fixtures.ts"
    || path === "front/tests/e2e/support/admin-approved-route-fixtures.test.ts"
  ) {
    return [...ADMIN_IDS];
  }
  if (
    pathMatchesPrefix(path, "front/features/host")
    || path === "front/src/app/routes/host.tsx"
    || pathMatchesPrefix(path, "front/src/app/host-routes")
    || path === "front/tests/e2e/host-approved-routes.spec.ts"
    || path === "front/tests/e2e/support/host-approved-route-fixtures.ts"
    || path === "front/tests/e2e/support/host-approved-route-fixtures.test.ts"
  ) {
    return [...HOST_IDS];
  }
  if (
    pathMatchesPrefix(path, "front/shared/ui")
    || pathMatchesPrefix(path, "front/shared/auth")
    || pathMatchesPrefix(path, "front/shared/styles")
    || pathMatchesPrefix(path, "front/src/app/layouts")
  ) {
    return [...ALL_IDS];
  }
  return [];
}

export function approvedMockupIdsAffectedBy(changedPaths: readonly string[]): readonly ApprovedMockupId[] {
  const ids = new Set<ApprovedMockupId>();
  for (const changedPath of changedPaths) {
    const path = canonicalizeRepositoryPath(changedPath);
    if (UNIVERSAL_DEPENDENCY_SET.has(path)) {
      for (const id of ALL_IDS) ids.add(id);
      continue;
    }
    const exact = idsForExactDependency(path);
    if (exact.length > 0) {
      for (const id of exact) ids.add(id);
      continue;
    }
    for (const id of idsForRolePartition(path)) ids.add(id);
  }
  return APPROVED_MOCKUPS.map((entry) => entry.id).filter((id) => ids.has(id));
}

export function approvedMockupsAffectedBy(changedPaths: readonly string[]): readonly ApprovedMockupEntry[] {
  const ids = new Set(approvedMockupIdsAffectedBy(changedPaths));
  return APPROVED_MOCKUPS.filter((entry) => ids.has(entry.id));
}

export function unmappedVisualSensitivePaths(changedPaths: readonly string[]): readonly string[] {
  return changedPaths.filter((changedPath) => {
    const path = canonicalizeRepositoryPath(changedPath);
    return isVisualSensitivePath(path) && approvedMockupIdsAffectedBy([path]).length === 0;
  });
}
