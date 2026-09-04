import type { PlatformAdminCapability } from "@/features/platform-admin/model/platform-admin-capabilities";
import { APPROVED_MOCKUPS, type ApprovedMockupId } from "./approved-mockup-manifest";
import type { Geometry } from "./approved-mockup-contract";
import {
  ADMIN_BACK_MOBILE_GEOMETRY,
  ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY,
  ADMIN_DETAIL_HEADING_MOBILE_GEOMETRY,
  ADMIN_DOCKET_DESKTOP_GEOMETRY,
  ADMIN_FIRST_ROW_DESKTOP_GEOMETRY,
  ADMIN_FIRST_ROW_MOBILE_GEOMETRY,
  ADMIN_HEADER_DESKTOP_GEOMETRY,
  ADMIN_HEADER_MOBILE_GEOMETRY,
  ADMIN_LEDGER_DOCKET_GEOMETRY,
  ADMIN_LEDGER_LIST_GEOMETRY,
  ADMIN_NAV_MOBILE_GEOMETRY,
  ADMIN_PAGE_HEADING_DESKTOP_GEOMETRY,
  ADMIN_PRIMARY_ACTION_MOBILE_GEOMETRY,
  ADMIN_QUEUE_DESKTOP_GEOMETRY,
  ADMIN_QUEUE_MOBILE_GEOMETRY,
  ADMIN_RAIL_DESKTOP_GEOMETRY,
  ADMIN_ROOT_SPACE_MENU_GEOMETRY,
  ADMIN_SERVICE_TABLE_GEOMETRY,
  ADMIN_SPACE_TRIGGER_GEOMETRY,
  ADMIN_TODAY_HEADING_MOBILE_GEOMETRY,
  HOST_CLOSING_PHASE_PANEL_DESKTOP_GEOMETRY,
  HOST_CURRENT_MEETING_DESKTOP_GEOMETRY,
  HOST_LIVE_MOBILE_NEXT_ACTION_GEOMETRY,
  HOST_LIVE_MOBILE_PHASE_NAV_GEOMETRY,
  HOST_LIVE_MOBILE_PHASE_PANEL_GEOMETRY,
  HOST_LIVE_MOBILE_PHASE_STATUS_GEOMETRY,
  HOST_LIVE_MOBILE_WORKBOX_GEOMETRY,
  HOST_LIVE_PHASE_PANEL_DESKTOP_GEOMETRY,
  HOST_MEETINGS_HEADER_GEOMETRY,
  HOST_MEETINGS_HEADING_GEOMETRY,
  HOST_MEETINGS_LAYOUT_GEOMETRY,
  HOST_MEETINGS_TABS_GEOMETRY,
  HOST_MOBILE_NAV_GEOMETRY,
  HOST_OR_DESKTOP_NAV_GEOMETRY,
  HOST_OR_LIVE_MOBILE_BOARD_GEOMETRY,
  HOST_OR_MOBILE_CURRENT_MEETING_GEOMETRY,
  HOST_OR_WORKBOX_DESKTOP_GEOMETRY,
  HOST_NEXT_ACTION_DESKTOP_GEOMETRY,
  HOST_PEOPLE_HEADING_GEOMETRY,
  HOST_PEOPLE_PENDING_GEOMETRY,
  HOST_PEOPLE_TABLE_GEOMETRY,
  HOST_PERSON_HEADING_GEOMETRY,
  HOST_PERSON_HISTORY_GEOMETRY,
  HOST_PERSON_ROUTE_HEADER_GEOMETRY,
  HOST_PERSON_TENURE_GEOMETRY,
  HOST_PHASE_NAV_DESKTOP_GEOMETRY,
  HOST_PHASE_STATUS_DESKTOP_GEOMETRY,
  HOST_PREP_MOBILE_NEXT_ACTION_GEOMETRY,
  HOST_PREP_MOBILE_PHASE_NAV_GEOMETRY,
  HOST_PREP_MOBILE_PHASE_PANEL_GEOMETRY,
  HOST_PREP_MOBILE_PHASE_STATUS_GEOMETRY,
  HOST_PREP_MOBILE_WORKBOX_GEOMETRY,
  HOST_PREP_PHASE_PANEL_DESKTOP_GEOMETRY,
  HOST_RECORDS_CLOSING_GEOMETRY,
  HOST_RECORDS_HEADING_GEOMETRY,
  HOST_RECORDS_TABLE_GEOMETRY,
  HOST_SCHEDULE_REVIEW_COMPOSER_GEOMETRY,
  HOST_SCHEDULE_REVIEW_HEADING_GEOMETRY,
  HOST_SCHEDULE_REVIEW_RECIPIENTS_GEOMETRY,
  HOST_SETTINGS_CLUB_GEOMETRY,
  HOST_SETTINGS_HEADING_GEOMETRY,
  HOST_SETTINGS_INVITATION_GEOMETRY,
} from "./approved-route-geometry";

export type { ApprovedMockupId };

export type ApprovedRouteFixtureKey =
  | "admin-today"
  | "admin-clubs"
  | "admin-health"
  | "admin-audit"
  | "host-operating-room"
  | "host-meetings"
  | "host-people"
  | "host-records"
  | "host-settings"
  | "host-schedule-review"
  | "host-person";

export type ApprovedEffectKind =
  | "attendance-mutation"
  | "notification-confirm"
  | "notification-send"
  | "invitation-create"
  | "settings-update"
  | "session-close"
  | "membership-mutation"
  | "other-effecting-request";

export type RequiredVisualAuthorityInteractionName =
  | "select-work"
  | "show-all-url"
  | "back-restores-priority"
  | "keyboard-work-row"
  | "select-club"
  | "back-restores-club-focus"
  | "club-pagination"
  | "keyboard-service-row"
  | "select-service-evidence"
  | "select-audit"
  | "back-restores-audit-focus"
  | "audit-pagination"
  | "keyboard-root-menu"
  | "club-subflow"
  | "escape-restores-trigger"
  | "select-mobile-work"
  | "back-restores-mobile-row"
  | "primary-action-keyboard-reachable"
  | "phase-roving-tabs"
  | "show-all-workbox-url"
  | "back-restores-capped-workbox"
  | "prep-retry"
  | "attendance-undo-keyboard-reachable"
  | "closing-destination"
  | "meeting-view-tab"
  | "meeting-status-tab"
  | "meeting-pagination"
  | "select-member"
  | "back-restores-member-focus"
  | "member-pagination"
  | "open-closing-record"
  | "back-restores-record-focus"
  | "record-pagination"
  | "open-invitation-form"
  | "escape-restores-invitation-focus"
  | "preview-notification-post"
  | "person-history-pagination"
  | "person-status-keyboard-reachable";

export type VisualAuthorityInteraction =
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "activate";
      target: string;
      via: "click" | "Enter" | "Space";
      expectedVisible: string;
      expectedUrl?: string;
      expectedFocus?: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "focus-control";
      target: string;
      expectedVisible: true;
      expectedFocused: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "keyboard-menu";
      trigger: string;
      keys: readonly ("Enter" | "ArrowDown" | "ArrowUp" | "Escape")[];
      expectedFocused: string;
      expectedExpanded: boolean;
      expectedFocusAfterEscape: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "history-restore";
      activate: string;
      expectedUrlAfterActivate: string;
      expectedUrlAfterBack: string;
      expectedUrlAfterForward: string;
      expectedRestoredFocusAfterBack?: string;
      expectedRestoredFocusAfterForward?: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "tab-selection";
      tab: string;
      expectedSelected: string;
      expectedPanel: string;
      restoreCanonicalState: true;
    }
  | {
      name: RequiredVisualAuthorityInteractionName;
      kind: "prepared-request";
      performedByPreparationKey: "preview-schedule-notification";
      method: "POST";
      expectedPath: "/api/bff/api/host/notifications/manual/preview";
      expectedVisible: string;
      forbiddenEffectKinds: readonly ApprovedEffectKind[];
    };

export type VisualAuthorityScenario = {
  id: ApprovedMockupId;
  route: string;
  viewport: { width: number; height: number };
  rootSelector: string;
  actor:
    | { kind: "platform-admin"; role: "OPERATOR"; capabilities: readonly PlatformAdminCapability[] }
    | { kind: "club-host"; clubSlug: "visual-authority"; perspective: "HOST" };
  fixtureKey: ApprovedRouteFixtureKey;
  preparationKey: "none" | "open-space-switcher" | "preview-schedule-notification";
  regions: readonly {
    name: string;
    selector: string;
    expected: Geometry;
    toleranceCssPx: 2 | 4;
  }[];
  typography: readonly {
    name: string;
    selector: string;
    fontFamilyIncludes: "Pretendard";
    fontSizePx: number;
    fontWeight: readonly number[];
    lineHeightPx: number | "normal";
    color: string;
  }[];
  firstViewport: readonly {
    name: string;
    selector: string;
    visibility: "fully-visible" | "intersects" | "absent";
  }[];
  defaultVisibleItems?: { selector: string; count: 3 | 4 };
  interactions: readonly VisualAuthorityInteraction[];
};

export type RequiredScenarioCoverage = {
  actor: VisualAuthorityScenario["actor"];
  fixtureKey: ApprovedRouteFixtureKey;
  preparationKey: VisualAuthorityScenario["preparationKey"];
  regions: VisualAuthorityScenario["regions"];
  typography: VisualAuthorityScenario["typography"];
  firstViewport: VisualAuthorityScenario["firstViewport"];
  interactions: VisualAuthorityScenario["interactions"];
  defaultVisibleItems: VisualAuthorityScenario["defaultVisibleItems"];
};

const INK = "oklch(0.18 0.020 255)";
const ADMIN_VIEW_CAPABILITIES = [
  "VIEW_TODAY",
  "VIEW_CLUBS",
  "VIEW_SERVICE_HEALTH",
  "VIEW_AUDIT",
] as const satisfies readonly PlatformAdminCapability[];
const ADMIN_CLUBS_CAPABILITIES = [
  ...ADMIN_VIEW_CAPABILITIES,
  "VIEW_CLUB_OPERATIONS",
  "CREATE_CLUB",
] as const satisfies readonly PlatformAdminCapability[];

const ADMIN_ACTOR = {
  kind: "platform-admin" as const,
  role: "OPERATOR" as const,
  capabilities: ADMIN_VIEW_CAPABILITIES,
};
const ADMIN_CLUBS_ACTOR = {
  kind: "platform-admin" as const,
  role: "OPERATOR" as const,
  capabilities: ADMIN_CLUBS_CAPABILITIES,
};
const HOST_ACTOR = {
  kind: "club-host" as const,
  clubSlug: "visual-authority" as const,
  perspective: "HOST" as const,
};

const ADMIN_HEADER = {
  name: "admin-header",
  selector: ".admin-shell__header",
  expected: ADMIN_HEADER_DESKTOP_GEOMETRY,
  toleranceCssPx: 4 as const,
};
const ADMIN_RAIL = {
  name: "admin-rail",
  selector: ".admin-shell__nav",
  expected: ADMIN_RAIL_DESKTOP_GEOMETRY,
  toleranceCssPx: 4 as const,
};
const ADMIN_MOBILE_HEADER = {
  name: "mobile-header",
  selector: ".admin-shell__header",
  expected: ADMIN_HEADER_MOBILE_GEOMETRY,
  toleranceCssPx: 4 as const,
};
const ADMIN_MOBILE_NAV = {
  name: "mobile-nav",
  selector: ".admin-mobile-navigation",
  expected: ADMIN_NAV_MOBILE_GEOMETRY,
  toleranceCssPx: 4 as const,
};
const HOST_HEADER = {
  name: "host-header",
  selector: "header.topnav",
  expected: HOST_MEETINGS_HEADER_GEOMETRY,
  toleranceCssPx: 4 as const,
};
const HOST_NAV = {
  name: "host-nav",
  selector: 'nav[aria-label="호스트 주 메뉴"]',
  expected: HOST_OR_DESKTOP_NAV_GEOMETRY,
  toleranceCssPx: 4 as const,
};
const HOST_MOBILE_NAV = {
  name: "mobile-nav",
  selector: '[data-club-shell-region="mobile-primary"] .m-tabbar',
  expected: HOST_MOBILE_NAV_GEOMETRY,
  toleranceCssPx: 4 as const,
};
const HOST_MOBILE_HEADER = {
  name: "mobile-header",
  selector: ".rm-host-person__header",
  expected: HOST_PERSON_ROUTE_HEADER_GEOMETRY,
  toleranceCssPx: 4 as const,
};

const TYPO_ADMIN_WORDMARK = {
  name: "wordmark",
  selector: ".admin-shell__wordmark",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 12,
  fontWeight: [650],
  lineHeightPx: 16.8,
  color: INK,
};
const TYPO_ADMIN_PAGE_TITLE = {
  name: "page-title",
  selector: ".admin-page-frame h1",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 36,
  fontWeight: [600],
  lineHeightPx: 41.4,
  color: INK,
};
const TYPO_ADMIN_PAGE_TITLE_MOBILE = {
  name: "page-title",
  selector: ".admin-page-frame h1",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 28,
  fontWeight: [600],
  lineHeightPx: 33.6,
  color: INK,
};
const TYPO_QUEUE_TITLE = {
  name: "queue-title",
  selector: ".admin-operations-queue__title",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 17,
  fontWeight: [600],
  lineHeightPx: 23.8,
  color: INK,
};
const TYPO_BODY = {
  name: "body-copy",
  selector: ".admin-page-frame__description, .admin-operations-inspector, .rm-host-operating-room",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 16,
  fontWeight: [400, 500],
  lineHeightPx: 25.6,
  color: INK,
};
const TYPO_HOST_LEDGER_BODY = {
  name: "body-copy",
  selector: ".rm-meeting-toc__lede, .rm-host-editorial-ledger__lede, .rm-schedule-review__composer-lede",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 16,
  fontWeight: [400, 500],
  lineHeightPx: 25.6,
  color: INK,
};
const TYPO_HOST_WORDMARK = {
  name: "wordmark",
  selector: "header.topnav .editorial",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 12,
  fontWeight: [650],
  lineHeightPx: 16.8,
  color: INK,
};
const TYPO_HOST_PAGE_TITLE = {
  name: "page-title",
  selector: "main h1, .rm-host-operating-room h1, .admin-page-frame h1",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 36,
  fontWeight: [600],
  lineHeightPx: 41.4,
  color: INK,
};
const TYPO_HOST_PAGE_TITLE_MOBILE = {
  name: "page-title",
  selector: "main h1, .rm-host-operating-room h1, .admin-page-frame h1",
  fontFamilyIncludes: "Pretendard" as const,
  fontSizePx: 28,
  fontWeight: [600],
  lineHeightPx: 33.6,
  color: INK,
};

function typo(
  name: string,
  selector: string,
  fontSizePx: number,
  fontWeight: readonly number[],
  lineHeightPx: number,
) {
  return {
    name,
    selector,
    fontFamilyIncludes: "Pretendard" as const,
    fontSizePx,
    fontWeight,
    lineHeightPx,
    color: INK,
  };
}

const SHOW_ALL_CONTROL = 'role=button[name=/전체 .*보기/]';
const WORKBOX_SHOW_ALL = 'role=button[name="작업함 모두 보기"]';
const SPACE_TRIGGER = '[aria-label="공간 전환, 현재 플랫폼 운영"]';
const HOST_BASE = "/clubs/visual-authority/app/host";
const PREP_ROUTE = `${HOST_BASE}?phase=prep`;
const LIVE_ROUTE = `${HOST_BASE}?phase=live`;
const CLOSING_ROUTE = `${HOST_BASE}?phase=closing`;
const CLUB_SELECTED_URL = "/admin/clubs/club-sample";
const AUDIT_SELECTED_URL = "/admin/audit?event=audit-visual-1";
const MEMBER_SELECTED_URL = `${HOST_BASE}/people/membership-sky`;
const RECORD_SELECTED_URL = `${HOST_BASE}?phase=closing`;
const MOBILE_DETAIL_URL = "/admin/today?case=case-notification&mode=detail";
const WORKBOX_ITEMS = ".rm-host-workbox__items > *";

const PHASE_ROVING_TABS = {
  name: "phase-roving-tabs",
  kind: "tab-selection",
  tab: '.rm-operating-room-phases [role="tab"]',
  expectedSelected: '.rm-operating-room-phases [role="tab"][aria-selected="true"]',
  expectedPanel: ".rm-host-operating-room__phase-panel",
  restoreCanonicalState: true as const,
} as const;

function showAllWorkbox(route: string): VisualAuthorityInteraction {
  return {
    name: "show-all-workbox-url",
    kind: "activate",
    target: WORKBOX_SHOW_ALL,
    via: "click",
    expectedVisible: ".rm-host-workbox",
    expectedUrl: `${route}&workbox=all`,
    restoreCanonicalState: true,
  };
}

function restoreCappedWorkbox(route: string): VisualAuthorityInteraction {
  return {
    name: "back-restores-capped-workbox",
    kind: "history-restore",
    activate: WORKBOX_SHOW_ALL,
    expectedUrlAfterActivate: `${route}&workbox=all`,
    expectedUrlAfterBack: route,
    expectedUrlAfterForward: `${route}&workbox=all`,
    restoreCanonicalState: true,
  };
}

const PREP_RETRY: VisualAuthorityInteraction = {
  name: "prep-retry",
  kind: "activate",
  target: ".rm-preparation-ledger-row__retry",
  via: "click",
  expectedVisible: ".rm-preparation-ledger",
  restoreCanonicalState: true,
};

const ATTENDANCE_CHOICE: VisualAuthorityInteraction = {
  name: "attendance-choice-keyboard-reachable",
  kind: "focus-control",
  target: ".rm-meeting-response-ledger__attendance-choice",
  expectedVisible: true,
  expectedFocused: ".rm-meeting-response-ledger__attendance-choice",
  restoreCanonicalState: true,
};

const CLOSING_DESTINATION: VisualAuthorityInteraction = {
  name: "closing-destination",
  kind: "activate",
  target: ".rm-host-closing-board__primary .btn-primary",
  via: "click",
  expectedVisible: ".rm-host-closing-board",
  expectedUrl: `${HOST_BASE}/records`,
  restoreCanonicalState: true,
};

function hostOperatingRoomRegions(body = HOST_PREP_PHASE_PANEL_DESKTOP_GEOMETRY, workbox = HOST_OR_WORKBOX_DESKTOP_GEOMETRY) {
  return [
    HOST_HEADER,
    {
      name: "host-nav",
      selector: 'nav[aria-label="호스트 주 메뉴"]',
      expected: HOST_OR_DESKTOP_NAV_GEOMETRY,
      toleranceCssPx: 4 as const,
    },
    {
      name: "current-meeting",
      selector: '[aria-label="현재 모임"]',
      expected: HOST_CURRENT_MEETING_DESKTOP_GEOMETRY,
      toleranceCssPx: 4 as const,
    },
    {
      name: "phase-navigation",
      selector: 'nav[aria-label="모임 운영 단계"]',
      expected: HOST_PHASE_NAV_DESKTOP_GEOMETRY,
      toleranceCssPx: 4 as const,
    },
    {
      name: "primary-next-action",
      selector: ".rm-operating-room-next-action",
      expected: HOST_NEXT_ACTION_DESKTOP_GEOMETRY,
      toleranceCssPx: 4 as const,
    },
    {
      name: "phase-status",
      selector: ".rm-host-operating-room__phase-notice",
      expected: HOST_PHASE_STATUS_DESKTOP_GEOMETRY,
      toleranceCssPx: 4 as const,
    },
    {
      name: "phase-panel",
      selector: ".rm-host-operating-room__phase-panel",
      expected: body,
      toleranceCssPx: 4 as const,
    },
    {
      name: "workbox",
      selector: ".rm-host-operating-room__workbox-rail",
      expected: workbox,
      toleranceCssPx: 4 as const,
    },
  ] as const;
}

const HOST_OPERATING_TYPOGRAPHY = [
  TYPO_HOST_WORDMARK,
  TYPO_HOST_PAGE_TITLE,
  typo("phase-label", ".rm-operating-room-phases__label", 14, [600], 19.6),
  typo("work-item-title", ".rm-host-work-item__label", 17, [600], 23.8),
  TYPO_BODY,
] as const;

const HOST_OPERATING_FIRST_VIEWPORT = [
  { name: "current-phase", selector: '.rm-operating-room-phases [aria-selected="true"]', visibility: "fully-visible" as const },
  { name: "primary-next-action", selector: ".rm-operating-room-next-action", visibility: "fully-visible" as const },
  { name: "four-workbox-items", selector: WORKBOX_ITEMS, visibility: "fully-visible" as const },
  { name: "show-all-workbox", selector: WORKBOX_SHOW_ALL, visibility: "fully-visible" as const },
] as const;

function hostMobileOperatingRegions(
  boxes: {
    currentMeeting: Geometry;
    phaseNav: Geometry;
    nextAction: Geometry;
    phaseStatus: Geometry;
    phasePanel: Geometry;
    workbox: Geometry;
  },
  extra: VisualAuthorityScenario["regions"] = [],
) {
  return [
    {
      name: "current-meeting",
      selector: '[aria-label="현재 모임"]',
      expected: boxes.currentMeeting,
      toleranceCssPx: 4 as const,
    },
    {
      name: "phase-navigation",
      selector: 'nav[aria-label="모임 운영 단계"]',
      expected: boxes.phaseNav,
      toleranceCssPx: 4 as const,
    },
    {
      name: "primary-next-action",
      selector: ".rm-operating-room-next-action",
      expected: boxes.nextAction,
      toleranceCssPx: 4 as const,
    },
    {
      name: "phase-status",
      selector: ".rm-host-operating-room__phase-notice",
      expected: boxes.phaseStatus,
      toleranceCssPx: 4 as const,
    },
    {
      name: "phase-panel",
      selector: ".rm-host-operating-room__phase-panel",
      expected: boxes.phasePanel,
      toleranceCssPx: 4 as const,
    },
    ...extra,
    {
      name: "workbox",
      selector: ".rm-host-operating-room__workbox-rail",
      expected: boxes.workbox,
      toleranceCssPx: 4 as const,
    },
    HOST_MOBILE_NAV,
  ] as const;
}

const HOST_MOBILE_TYPOGRAPHY = [
  TYPO_HOST_PAGE_TITLE_MOBILE,
  typo("phase-label", ".rm-operating-room-phases__label", 14, [600], 19.6),
  typo("work-item-title", ".rm-host-work-item__label", 17, [600], 23.8),
  TYPO_BODY,
] as const;

export const REQUIRED_VISUAL_AUTHORITY_COVERAGE: Record<ApprovedMockupId, RequiredScenarioCoverage> = {
  "admin-today-desktop": {
    actor: ADMIN_ACTOR,
    fixtureKey: "admin-today",
    preparationKey: "none",
    regions: [
      ADMIN_HEADER,
      ADMIN_RAIL,
      {
        name: "today-heading",
        selector: ".admin-page-frame h1",
        expected: ADMIN_PAGE_HEADING_DESKTOP_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "priority-queue",
        selector: ".admin-operations-queue",
        expected: ADMIN_QUEUE_DESKTOP_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "selected-work",
        selector: '[aria-label="운영 케이스 상세"]',
        expected: ADMIN_DOCKET_DESKTOP_GEOMETRY,
        toleranceCssPx: 4,
      },
    ],
    typography: [TYPO_ADMIN_WORDMARK, TYPO_ADMIN_PAGE_TITLE, TYPO_QUEUE_TITLE, TYPO_BODY],
    firstViewport: [
      { name: "three-priority-items", selector: ".admin-operations-queue__row", visibility: "fully-visible" },
      { name: "show-all", selector: SHOW_ALL_CONTROL, visibility: "fully-visible" },
      {
        name: "primary-lifecycle-action",
        selector: '[aria-label="운영 케이스 상세"] button',
        visibility: "fully-visible",
      },
    ],
    defaultVisibleItems: { selector: ".admin-operations-queue__row", count: 3 },
    interactions: [
      {
        name: "select-work",
        kind: "activate",
        target: ".admin-operations-queue__row",
        via: "click",
        expectedVisible: '[aria-label="운영 케이스 상세"]',
        expectedUrl: "/admin/today?case=case-notification",
        restoreCanonicalState: true,
      },
      {
        name: "show-all-url",
        kind: "activate",
        target: SHOW_ALL_CONTROL,
        via: "click",
        expectedVisible: ".admin-operations-queue",
        expectedUrl: "/admin/today?queue=all",
        restoreCanonicalState: true,
      },
      {
        name: "back-restores-priority",
        kind: "history-restore",
        activate: SHOW_ALL_CONTROL,
        expectedUrlAfterActivate: "/admin/today?queue=all",
        expectedUrlAfterBack: "/admin/today",
        expectedUrlAfterForward: "/admin/today?queue=all",
        expectedRestoredFocusAfterBack: ".admin-operations-queue__row",
        restoreCanonicalState: true,
      },
      {
        name: "keyboard-work-row",
        kind: "focus-control",
        target: ".admin-operations-queue__row",
        expectedVisible: true,
        expectedFocused: ".admin-operations-queue__row",
        restoreCanonicalState: true,
      },
    ],
  },
  "admin-clubs-desktop": {
    actor: ADMIN_CLUBS_ACTOR,
    fixtureKey: "admin-clubs",
    preparationKey: "none",
    regions: [
      ADMIN_HEADER,
      ADMIN_RAIL,
      {
        name: "clubs-heading",
        selector: ".admin-page-frame h1",
        expected: ADMIN_PAGE_HEADING_DESKTOP_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "club-finder",
        selector: ".admin-club-management__finder",
        expected: ADMIN_LEDGER_LIST_GEOMETRY,
        toleranceCssPx: 2,
      },
      {
        name: "club-docket",
        selector: ".admin-club-management__docket",
        expected: ADMIN_LEDGER_DOCKET_GEOMETRY,
        toleranceCssPx: 2,
      },
      {
        name: "club-detail",
        selector: ".admin-club-management__docket",
        expected: ADMIN_LEDGER_DOCKET_GEOMETRY,
        toleranceCssPx: 4,
      },
    ],
    typography: [
      TYPO_ADMIN_WORDMARK,
      TYPO_ADMIN_PAGE_TITLE,
      typo("row-title", ".admin-club-management__row", 17, [600], 23.8),
      TYPO_BODY,
    ],
    firstViewport: [
      { name: "finder", selector: ".admin-club-management__finder", visibility: "fully-visible" },
      { name: "first-club-row", selector: ".admin-club-management__row", visibility: "fully-visible" },
      { name: "selected-club-detail", selector: ".admin-club-management__docket", visibility: "fully-visible" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "select-club",
        kind: "activate",
        target: ".admin-club-management__row",
        via: "click",
        expectedVisible: ".admin-club-management__docket",
        expectedUrl: CLUB_SELECTED_URL,
        restoreCanonicalState: true,
      },
      {
        name: "back-restores-club-focus",
        kind: "history-restore",
        activate: ".admin-club-management__row",
        expectedUrlAfterActivate: CLUB_SELECTED_URL,
        expectedUrlAfterBack: "/admin/clubs",
        expectedUrlAfterForward: CLUB_SELECTED_URL,
        expectedRestoredFocusAfterBack: ".admin-club-management__row",
        restoreCanonicalState: true,
      },
      {
        name: "club-pagination",
        kind: "activate",
        target: 'role=button[name="더 보기"]',
        via: "click",
        expectedVisible: ".admin-club-management__list",
        restoreCanonicalState: true,
      },
    ],
  },
  "admin-service-desktop": {
    actor: ADMIN_ACTOR,
    fixtureKey: "admin-health",
    preparationKey: "none",
    regions: [
      ADMIN_HEADER,
      ADMIN_RAIL,
      {
        name: "service-heading",
        selector: ".admin-page-frame h1",
        expected: ADMIN_PAGE_HEADING_DESKTOP_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "service-table",
        selector: ".admin-service-status__table",
        expected: ADMIN_SERVICE_TABLE_GEOMETRY,
        toleranceCssPx: 2,
      },
      {
        name: "service-evidence",
        selector: ".admin-health-grid__strip",
        expected: ADMIN_LEDGER_DOCKET_GEOMETRY,
        toleranceCssPx: 4,
      },
    ],
    typography: [
      TYPO_ADMIN_WORDMARK,
      TYPO_ADMIN_PAGE_TITLE,
      typo("row-title", ".admin-service-status__row", 17, [600], 23.8),
      TYPO_BODY,
    ],
    firstViewport: [
      { name: "service-table", selector: ".admin-service-status__table", visibility: "fully-visible" },
      { name: "service-evidence", selector: ".admin-health-grid__strip", visibility: "fully-visible" },
      { name: "no-command-control", selector: 'role=button[name="새로 확인"]', visibility: "absent" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "keyboard-service-row",
        kind: "focus-control",
        target: ".admin-service-status__row",
        expectedVisible: true,
        expectedFocused: ".admin-service-status__row",
        restoreCanonicalState: true,
      },
      {
        name: "select-service-evidence",
        kind: "activate",
        target: ".admin-service-status__row",
        via: "click",
        expectedVisible: ".admin-health-grid__strip",
        restoreCanonicalState: true,
      },
    ],
  },
  "admin-records-desktop": {
    actor: ADMIN_ACTOR,
    fixtureKey: "admin-audit",
    preparationKey: "none",
    regions: [
      ADMIN_HEADER,
      ADMIN_RAIL,
      {
        name: "records-heading",
        selector: ".admin-page-frame h1",
        expected: ADMIN_PAGE_HEADING_DESKTOP_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "audit-list",
        selector: ".admin-audit__list",
        expected: ADMIN_LEDGER_LIST_GEOMETRY,
        toleranceCssPx: 2,
      },
      {
        name: "audit-detail",
        selector: ".admin-audit__detail",
        expected: ADMIN_LEDGER_DOCKET_GEOMETRY,
        toleranceCssPx: 2,
      },
    ],
    typography: [
      TYPO_ADMIN_WORDMARK,
      TYPO_ADMIN_PAGE_TITLE,
      typo("row-title", ".admin-audit__row-title", 17, [600], 23.8),
      TYPO_BODY,
    ],
    firstViewport: [
      { name: "first-audit-row", selector: ".admin-audit__row", visibility: "fully-visible" },
      { name: "selected-audit-detail", selector: ".admin-audit__detail", visibility: "fully-visible" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "select-audit",
        kind: "activate",
        target: ".admin-audit__row",
        via: "click",
        expectedVisible: ".admin-audit__detail",
        expectedUrl: AUDIT_SELECTED_URL,
        restoreCanonicalState: true,
      },
      {
        name: "back-restores-audit-focus",
        kind: "history-restore",
        activate: ".admin-audit__row",
        expectedUrlAfterActivate: AUDIT_SELECTED_URL,
        expectedUrlAfterBack: "/admin/audit",
        expectedUrlAfterForward: AUDIT_SELECTED_URL,
        expectedRestoredFocusAfterBack: ".admin-audit__row",
        restoreCanonicalState: true,
      },
      {
        name: "audit-pagination",
        kind: "activate",
        target: 'role=button[name="더 보기"]',
        via: "click",
        expectedVisible: ".admin-audit__list",
        restoreCanonicalState: true,
      },
    ],
  },
  "admin-space-switcher-desktop": {
    actor: ADMIN_ACTOR,
    fixtureKey: "admin-today",
    preparationKey: "open-space-switcher",
    regions: [
      ADMIN_HEADER,
      {
        name: "space-trigger",
        selector: SPACE_TRIGGER,
        expected: ADMIN_SPACE_TRIGGER_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "root-space-menu",
        selector: '[role="menu"]',
        expected: ADMIN_ROOT_SPACE_MENU_GEOMETRY,
        toleranceCssPx: 4,
      },
      ADMIN_RAIL,
      {
        name: "first-priority-item",
        selector: ".admin-operations-queue__row",
        expected: ADMIN_FIRST_ROW_DESKTOP_GEOMETRY,
        toleranceCssPx: 4,
      },
    ],
    typography: [
      TYPO_ADMIN_WORDMARK,
      typo("space-trigger-label", SPACE_TRIGGER, 12, [650], 16.8),
      typo("menu-label", '[role="menuitemradio"]', 14, [500], 19.6),
      TYPO_BODY,
    ],
    firstViewport: [
      { name: "platform-root-choice", selector: 'role=menuitemradio[name=/플랫폼 운영/]', visibility: "fully-visible" },
      { name: "my-club-root-choice", selector: 'role=menuitem[name="내 클럽"]', visibility: "fully-visible" },
      { name: "first-priority-item", selector: ".admin-operations-queue__row", visibility: "intersects" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "keyboard-root-menu",
        kind: "keyboard-menu",
        trigger: SPACE_TRIGGER,
        keys: ["Enter", "ArrowDown", "Escape"],
        expectedFocused: 'role=menuitem[name="내 클럽"]',
        expectedExpanded: true,
        expectedFocusAfterEscape: SPACE_TRIGGER,
        restoreCanonicalState: true,
      },
      {
        name: "club-subflow",
        kind: "activate",
        target: 'role=menuitem[name="내 클럽"]',
        via: "click",
        expectedVisible: 'role=group[name="샘플 독서모임"]',
        restoreCanonicalState: true,
      },
      {
        name: "escape-restores-trigger",
        kind: "keyboard-menu",
        trigger: SPACE_TRIGGER,
        keys: ["Enter", "Escape"],
        expectedFocused: 'role=menuitemradio[name=/플랫폼 운영/]',
        expectedExpanded: true,
        expectedFocusAfterEscape: SPACE_TRIGGER,
        restoreCanonicalState: true,
      },
    ],
  },
  "admin-today-mobile": {
    actor: ADMIN_ACTOR,
    fixtureKey: "admin-today",
    preparationKey: "none",
    regions: [
      ADMIN_MOBILE_HEADER,
      {
        name: "today-heading",
        selector: ".admin-page-frame h1",
        expected: ADMIN_TODAY_HEADING_MOBILE_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "priority-queue",
        selector: ".admin-operations-queue",
        expected: ADMIN_QUEUE_MOBILE_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "first-queue-row",
        selector: ".admin-operations-queue__row",
        expected: ADMIN_FIRST_ROW_MOBILE_GEOMETRY,
        toleranceCssPx: 2,
      },
      ADMIN_MOBILE_NAV,
    ],
    typography: [
      TYPO_ADMIN_WORDMARK,
      TYPO_ADMIN_PAGE_TITLE_MOBILE,
      TYPO_QUEUE_TITLE,
      typo("mobile-meta", ".admin-operations-queue__mobile-meta", 12, [500], 16.8),
    ],
    firstViewport: [
      { name: "three-priority-items", selector: ".admin-operations-queue__row", visibility: "fully-visible" },
      { name: "show-all", selector: SHOW_ALL_CONTROL, visibility: "fully-visible" },
      { name: "mobile-nav", selector: ".admin-mobile-navigation", visibility: "fully-visible" },
    ],
    defaultVisibleItems: { selector: ".admin-operations-queue__row", count: 3 },
    interactions: [
      {
        name: "select-mobile-work",
        kind: "activate",
        target: ".admin-operations-queue__row",
        via: "click",
        expectedVisible: '[aria-label="운영 케이스 상세"]',
        expectedUrl: MOBILE_DETAIL_URL,
        restoreCanonicalState: true,
      },
      {
        name: "show-all-url",
        kind: "activate",
        target: SHOW_ALL_CONTROL,
        via: "click",
        expectedVisible: ".admin-operations-queue",
        expectedUrl: "/admin/today?queue=all",
        restoreCanonicalState: true,
      },
      {
        name: "back-restores-mobile-row",
        kind: "history-restore",
        activate: ".admin-operations-queue__row",
        expectedUrlAfterActivate: MOBILE_DETAIL_URL,
        expectedUrlAfterBack: "/admin/today",
        expectedUrlAfterForward: MOBILE_DETAIL_URL,
        expectedRestoredFocusAfterBack: ".admin-operations-queue__row",
        restoreCanonicalState: true,
      },
    ],
  },
  "admin-work-detail-mobile": {
    actor: ADMIN_ACTOR,
    fixtureKey: "admin-today",
    preparationKey: "none",
    regions: [
      {
        name: "mobile-header",
        selector: 'role=button[name="목록으로"]',
        expected: ADMIN_BACK_MOBILE_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "detail-heading",
        selector: ".admin-page-frame h1",
        expected: ADMIN_DETAIL_HEADING_MOBILE_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "detail-body",
        selector: '[aria-label="운영 케이스 상세"]',
        expected: ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "primary-action",
        selector: '[aria-label="운영 케이스 상세"] button',
        expected: ADMIN_PRIMARY_ACTION_MOBILE_GEOMETRY,
        toleranceCssPx: 4,
      },
      ADMIN_MOBILE_NAV,
    ],
    typography: [
      TYPO_ADMIN_WORDMARK,
      typo("page-title", ".admin-page-frame h1", 20, [600], 26),
      typo("detail-title", '[aria-label="운영 케이스 상세"] h1, [aria-label="운영 케이스 상세"] h2', 20, [600], 26),
      TYPO_BODY,
    ],
    firstViewport: [
      { name: "detail-title", selector: ".admin-page-frame h1", visibility: "fully-visible" },
      {
        name: "primary-lifecycle-action",
        selector: '[aria-label="운영 케이스 상세"] button',
        visibility: "fully-visible",
      },
      { name: "mobile-nav", selector: ".admin-mobile-navigation", visibility: "fully-visible" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "primary-action-keyboard-reachable",
        kind: "focus-control",
        target: '[aria-label="운영 케이스 상세"] button',
        expectedVisible: true,
        expectedFocused: '[aria-label="운영 케이스 상세"] button',
        restoreCanonicalState: true,
      },
    ],
  },
  "host-prep-desktop": {
    actor: HOST_ACTOR,
    fixtureKey: "host-operating-room",
    preparationKey: "none",
    regions: hostOperatingRoomRegions(),
    typography: HOST_OPERATING_TYPOGRAPHY,
    firstViewport: HOST_OPERATING_FIRST_VIEWPORT,
    defaultVisibleItems: { selector: WORKBOX_ITEMS, count: 4 },
    interactions: [PHASE_ROVING_TABS, showAllWorkbox(PREP_ROUTE), restoreCappedWorkbox(PREP_ROUTE), PREP_RETRY],
  },
  "host-live-desktop": {
    actor: HOST_ACTOR,
    fixtureKey: "host-operating-room",
    preparationKey: "none",
    regions: hostOperatingRoomRegions(HOST_LIVE_PHASE_PANEL_DESKTOP_GEOMETRY),
    typography: HOST_OPERATING_TYPOGRAPHY,
    firstViewport: HOST_OPERATING_FIRST_VIEWPORT,
    defaultVisibleItems: { selector: WORKBOX_ITEMS, count: 4 },
    interactions: [PHASE_ROVING_TABS, showAllWorkbox(LIVE_ROUTE), restoreCappedWorkbox(LIVE_ROUTE)],
  },
  "host-closing-desktop": {
    actor: HOST_ACTOR,
    fixtureKey: "host-operating-room",
    preparationKey: "none",
    regions: hostOperatingRoomRegions(HOST_CLOSING_PHASE_PANEL_DESKTOP_GEOMETRY),
    typography: HOST_OPERATING_TYPOGRAPHY,
    firstViewport: HOST_OPERATING_FIRST_VIEWPORT,
    defaultVisibleItems: { selector: WORKBOX_ITEMS, count: 4 },
    interactions: [
      PHASE_ROVING_TABS,
      showAllWorkbox(CLOSING_ROUTE),
      restoreCappedWorkbox(CLOSING_ROUTE),
      CLOSING_DESTINATION,
    ],
  },
  "host-meetings-desktop": {
    actor: HOST_ACTOR,
    fixtureKey: "host-meetings",
    preparationKey: "none",
    regions: [
      HOST_HEADER,
      HOST_NAV,
      {
        name: "meetings-heading",
        selector: "main h1",
        expected: HOST_MEETINGS_HEADING_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "meeting-tabs",
        selector: '[role="tablist"][aria-label="모임 보기 방식"]',
        expected: HOST_MEETINGS_TABS_GEOMETRY,
        toleranceCssPx: 4,
      },
      { name: "meeting-ledger", selector: ".rm-meeting-toc__layout", expected: HOST_MEETINGS_LAYOUT_GEOMETRY, toleranceCssPx: 4 },
    ],
    typography: [
      TYPO_HOST_WORDMARK,
      TYPO_HOST_PAGE_TITLE,
      typo("tab-label", '[role="tablist"] [role="tab"]', 14, [600], 19.6),
      typo("row-title", ".rm-meeting-toc__title", 17, [600], 23.8),
      TYPO_HOST_LEDGER_BODY,
    ],
    firstViewport: [
      { name: "meeting-tabs", selector: '[role="tablist"][aria-label="모임 보기 방식"]', visibility: "fully-visible" },
      { name: "first-meeting-row", selector: "main table tbody tr, .rm-meeting-toc__row", visibility: "fully-visible" },
      { name: "status", selector: '[role="tablist"][aria-label="모임 상태"]', visibility: "intersects" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "meeting-pagination",
        kind: "activate",
        target: 'role=button[name="다가오는 모임 더 보기"]',
        via: "click",
        expectedVisible: "main",
        restoreCanonicalState: true,
      },
      {
        name: "meeting-view-tab",
        kind: "tab-selection",
        tab: 'role=tab[name="달력"]',
        expectedSelected: 'role=tab[name="달력"]',
        expectedPanel: "main",
        restoreCanonicalState: true,
      },
      {
        name: "meeting-status-tab",
        kind: "tab-selection",
        tab: 'role=tab[name="준비 중"]',
        expectedSelected: 'role=tab[name="준비 중"]',
        expectedPanel: "main",
        restoreCanonicalState: true,
      },
    ],
  },
  "host-people-desktop": {
    actor: HOST_ACTOR,
    fixtureKey: "host-people",
    preparationKey: "none",
    regions: [
      HOST_HEADER,
      HOST_NAV,
      {
        name: "people-heading",
        selector: "main h1",
        expected: HOST_PEOPLE_HEADING_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "pending-review",
        selector: '[aria-label="가입 승인 대기"]',
        expected: HOST_PEOPLE_PENDING_GEOMETRY,
        toleranceCssPx: 4,
      },
      { name: "member-table", selector: ".rm-host-member-ledger", expected: HOST_PEOPLE_TABLE_GEOMETRY, toleranceCssPx: 4 },
    ],
    typography: [
      TYPO_HOST_WORDMARK,
      TYPO_HOST_PAGE_TITLE,
      typo("row-title", ".rm-host-member-ledger__display-name", 17, [600], 23.8),
      TYPO_HOST_LEDGER_BODY,
    ],
    firstViewport: [
      { name: "pending-review", selector: '[aria-label="가입 승인 대기"]', visibility: "fully-visible" },
      { name: "first-member-row", selector: ".rm-host-member-ledger__row", visibility: "fully-visible" },
      { name: "member-status", selector: ".rm-host-member-ledger__status", visibility: "intersects" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "select-member",
        kind: "activate",
        target: '.rm-host-member-ledger tbody .rm-host-member-ledger__person-link[href*="membership-sky"]',
        via: "click",
        expectedVisible: ".rm-host-person",
        expectedUrl: MEMBER_SELECTED_URL,
        restoreCanonicalState: true,
      },
      {
        name: "back-restores-member-focus",
        kind: "history-restore",
        activate: '.rm-host-member-ledger tbody .rm-host-member-ledger__person-link[href*="membership-sky"]',
        expectedUrlAfterActivate: MEMBER_SELECTED_URL,
        expectedUrlAfterBack: `${HOST_BASE}/people`,
        expectedUrlAfterForward: MEMBER_SELECTED_URL,
        expectedRestoredFocusAfterBack: '.rm-host-member-ledger tbody .rm-host-member-ledger__person-link[href*="membership-sky"]',
        restoreCanonicalState: true,
      },
      {
        name: "member-pagination",
        kind: "activate",
        target: 'role=button[name="더 보기"]',
        via: "click",
        expectedVisible: ".rm-host-member-ledger",
        restoreCanonicalState: true,
      },
    ],
  },
  "host-records-desktop": {
    actor: HOST_ACTOR,
    fixtureKey: "host-records",
    preparationKey: "none",
    regions: [
      HOST_HEADER,
      HOST_NAV,
      {
        name: "records-heading",
        selector: "main h1",
        expected: HOST_RECORDS_HEADING_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "closing-link",
        selector: ".rm-host-records-next a",
        expected: HOST_RECORDS_CLOSING_GEOMETRY,
        toleranceCssPx: 4,
      },
      { name: "record-ledger", selector: ".rm-host-editorial-ledger--split", expected: HOST_RECORDS_TABLE_GEOMETRY, toleranceCssPx: 4 },
    ],
    typography: [
      TYPO_HOST_WORDMARK,
      TYPO_HOST_PAGE_TITLE,
      typo("row-title", ".rm-host-editorial-ledger__row", 17, [600], 23.8),
      TYPO_HOST_LEDGER_BODY,
    ],
    firstViewport: [
      { name: "first-record-row", selector: ".rm-host-editorial-ledger__row", visibility: "fully-visible" },
      { name: "closing-link", selector: ".rm-host-records-next a", visibility: "fully-visible" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "open-closing-record",
        kind: "activate",
        target: ".rm-host-records-next a",
        via: "click",
        expectedVisible: ".rm-host-operating-room, .rm-host-closing-board",
        expectedUrl: RECORD_SELECTED_URL,
        restoreCanonicalState: true,
      },
      {
        name: "back-restores-record-focus",
        kind: "history-restore",
        activate: ".rm-host-records-next a",
        expectedUrlAfterActivate: RECORD_SELECTED_URL,
        expectedUrlAfterBack: `${HOST_BASE}/records`,
        expectedUrlAfterForward: RECORD_SELECTED_URL,
        expectedRestoredFocusAfterBack: ".rm-host-records-next a",
        restoreCanonicalState: true,
      },
      {
        name: "record-pagination",
        kind: "activate",
        target: 'role=button[name="더 보기"]',
        via: "click",
        expectedVisible: "main",
        restoreCanonicalState: true,
      },
    ],
  },
  "host-settings-desktop": {
    actor: HOST_ACTOR,
    fixtureKey: "host-settings",
    preparationKey: "none",
    regions: [
      HOST_HEADER,
      HOST_NAV,
      {
        name: "settings-heading",
        selector: "main h1",
        expected: HOST_SETTINGS_HEADING_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "invitation-region",
        selector: '[aria-labelledby="named-links-title"]',
        expected: HOST_SETTINGS_INVITATION_GEOMETRY,
        toleranceCssPx: 4,
      },
      { name: "club-settings", selector: '[aria-labelledby="club-settings-title"]', expected: HOST_SETTINGS_CLUB_GEOMETRY, toleranceCssPx: 4 },
    ],
    typography: [
      TYPO_HOST_WORDMARK,
      TYPO_HOST_PAGE_TITLE,
      typo("section-title", "#named-links-title, main h2", 20, [600], 26),
      TYPO_HOST_LEDGER_BODY,
    ],
    firstViewport: [
      { name: "invitation-action", selector: 'role=button[name="새 초대 링크"]', visibility: "fully-visible" },
      { name: "settings-status", selector: "main", visibility: "intersects" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "open-invitation-form",
        kind: "activate",
        target: 'role=button[name="새 초대 링크"]',
        via: "click",
        expectedVisible: 'role=textbox[name="링크 이름"]',
        restoreCanonicalState: true,
      },
      {
        name: "escape-restores-invitation-focus",
        kind: "keyboard-menu",
        trigger: 'role=button[name="새 초대 링크"]',
        keys: ["Escape"],
        expectedFocused: 'role=button[name="새 초대 링크"]',
        expectedExpanded: false,
        expectedFocusAfterEscape: 'role=button[name="새 초대 링크"]',
        restoreCanonicalState: true,
      },
    ],
  },
  "host-schedule-review-desktop": {
    actor: HOST_ACTOR,
    fixtureKey: "host-schedule-review",
    preparationKey: "preview-schedule-notification",
    regions: [
      HOST_HEADER,
      HOST_NAV,
      {
        name: "review-heading",
        selector: "main h1",
        expected: HOST_SCHEDULE_REVIEW_HEADING_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "recipient-region",
        selector: ".rm-schedule-review__recipients",
        expected: HOST_SCHEDULE_REVIEW_RECIPIENTS_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "preview-region",
        selector: ".rm-schedule-review__composer",
        expected: HOST_SCHEDULE_REVIEW_COMPOSER_GEOMETRY,
        toleranceCssPx: 4,
      },
    ],
    typography: [
      TYPO_HOST_WORDMARK,
      TYPO_HOST_PAGE_TITLE,
      typo("recipient-label", "#schedule-review-recipients-title", 20, [600], 26),
      typo("preview-copy", ".rm-schedule-review__composer-lede", 16, [400], 25.6),
    ],
    firstViewport: [
      { name: "recipient-selection", selector: ".rm-schedule-review__recipients", visibility: "fully-visible" },
      { name: "preview-action", selector: ".rm-schedule-review__preview", visibility: "fully-visible" },
      { name: "preview-confirmation", selector: '[aria-label="발송 전 확인"]', visibility: "fully-visible" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "preview-notification-post",
        kind: "prepared-request",
        performedByPreparationKey: "preview-schedule-notification",
        method: "POST",
        expectedPath: "/api/bff/api/host/notifications/manual/preview",
        expectedVisible: ".rm-schedule-review__preview",
        forbiddenEffectKinds: ["notification-confirm", "notification-send"],
      },
    ],
  },
  "host-prep-mobile": {
    actor: HOST_ACTOR,
    fixtureKey: "host-operating-room",
    preparationKey: "none",
    regions: hostMobileOperatingRegions({
      currentMeeting: HOST_OR_MOBILE_CURRENT_MEETING_GEOMETRY,
      phaseNav: HOST_PREP_MOBILE_PHASE_NAV_GEOMETRY,
      nextAction: HOST_PREP_MOBILE_NEXT_ACTION_GEOMETRY,
      phaseStatus: HOST_PREP_MOBILE_PHASE_STATUS_GEOMETRY,
      phasePanel: HOST_PREP_MOBILE_PHASE_PANEL_GEOMETRY,
      workbox: HOST_PREP_MOBILE_WORKBOX_GEOMETRY,
    }),
    typography: HOST_MOBILE_TYPOGRAPHY,
    firstViewport: [
      { name: "primary-next-action", selector: ".rm-operating-room-next-action", visibility: "fully-visible" },
      { name: "three-workbox-items", selector: WORKBOX_ITEMS, visibility: "fully-visible" },
      { name: "show-all-workbox", selector: WORKBOX_SHOW_ALL, visibility: "fully-visible" },
      { name: "mobile-nav", selector: '[data-club-shell-region="mobile-primary"] .m-tabbar', visibility: "fully-visible" },
    ],
    defaultVisibleItems: { selector: WORKBOX_ITEMS, count: 3 },
    interactions: [showAllWorkbox(PREP_ROUTE), restoreCappedWorkbox(PREP_ROUTE), PREP_RETRY],
  },
  "host-live-mobile": {
    actor: HOST_ACTOR,
    fixtureKey: "host-operating-room",
    preparationKey: "none",
    regions: hostMobileOperatingRegions({
      currentMeeting: HOST_OR_MOBILE_CURRENT_MEETING_GEOMETRY,
      phaseNav: HOST_LIVE_MOBILE_PHASE_NAV_GEOMETRY,
      nextAction: HOST_LIVE_MOBILE_NEXT_ACTION_GEOMETRY,
      phaseStatus: HOST_LIVE_MOBILE_PHASE_STATUS_GEOMETRY,
      phasePanel: HOST_LIVE_MOBILE_PHASE_PANEL_GEOMETRY,
      workbox: HOST_LIVE_MOBILE_WORKBOX_GEOMETRY,
    }, [
      {
        name: "attendance-board",
        selector: ".rm-meeting-response-ledger--attendance-board",
        expected: HOST_OR_LIVE_MOBILE_BOARD_GEOMETRY,
        toleranceCssPx: 4,
      },
    ]),
    typography: HOST_MOBILE_TYPOGRAPHY,
    firstViewport: [
      { name: "primary-next-action", selector: ".rm-operating-room-next-action", visibility: "fully-visible" },
      { name: "three-workbox-items", selector: WORKBOX_ITEMS, visibility: "fully-visible" },
      { name: "show-all-workbox", selector: WORKBOX_SHOW_ALL, visibility: "fully-visible" },
      { name: "mobile-nav", selector: '[data-club-shell-region="mobile-primary"] .m-tabbar', visibility: "fully-visible" },
      { name: "attendance-board", selector: ".rm-meeting-response-ledger--attendance-board", visibility: "fully-visible" },
    ],
    defaultVisibleItems: { selector: WORKBOX_ITEMS, count: 3 },
    interactions: [showAllWorkbox(LIVE_ROUTE), restoreCappedWorkbox(LIVE_ROUTE), ATTENDANCE_CHOICE],
  },
  "host-person-mobile": {
    actor: HOST_ACTOR,
    fixtureKey: "host-person",
    preparationKey: "none",
    regions: [
      HOST_MOBILE_HEADER,
      {
        name: "person-heading",
        selector: ".rm-host-person h1",
        expected: HOST_PERSON_HEADING_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "person-status",
        selector: ".rm-host-person__tenure",
        expected: HOST_PERSON_TENURE_GEOMETRY,
        toleranceCssPx: 4,
      },
      {
        name: "person-history",
        selector: '[aria-label="참석 기록"]',
        expected: HOST_PERSON_HISTORY_GEOMETRY,
        toleranceCssPx: 4,
      },
      HOST_MOBILE_NAV,
    ],
    typography: [
      TYPO_HOST_PAGE_TITLE_MOBILE,
      typo("status-label", ".rm-host-person__tenure", 14, [600], 19.6),
      typo("history-copy", '[aria-label="참석 기록"]', 16, [400], 25.6),
    ],
    firstViewport: [
      { name: "person-status", selector: ".rm-host-person__tenure", visibility: "fully-visible" },
      { name: "first-history-row", selector: '[aria-label="참석 기록"] li', visibility: "fully-visible" },
      { name: "mobile-nav", selector: '[data-club-shell-region="mobile-primary"] .m-tabbar', visibility: "fully-visible" },
    ],
    defaultVisibleItems: undefined,
    interactions: [
      {
        name: "person-history-pagination",
        kind: "activate",
        target: 'role=button[name="참석 기록 더 보기"]',
        via: "click",
        expectedVisible: '[aria-label="참석 기록"]',
        restoreCanonicalState: true,
      },
      {
        name: "person-status-keyboard-reachable",
        kind: "focus-control",
        target: ".rm-host-person__management .rm-host-person__text-link",
        expectedVisible: true,
        expectedFocused: ".rm-host-person__management .rm-host-person__text-link",
        restoreCanonicalState: true,
      },
    ],
  },
};

const SCENARIO_ROUTES: Record<ApprovedMockupId, string> = {
  "admin-today-desktop": "/admin/today",
  "admin-clubs-desktop": "/admin/clubs",
  "admin-service-desktop": "/admin/health",
  "admin-records-desktop": "/admin/audit",
  "admin-space-switcher-desktop": "/admin/today",
  "admin-today-mobile": "/admin/today",
  "admin-work-detail-mobile": MOBILE_DETAIL_URL,
  "host-prep-desktop": PREP_ROUTE,
  "host-live-desktop": LIVE_ROUTE,
  "host-closing-desktop": CLOSING_ROUTE,
  "host-meetings-desktop": `${HOST_BASE}/sessions`,
  "host-people-desktop": `${HOST_BASE}/people`,
  "host-records-desktop": `${HOST_BASE}/records`,
  "host-settings-desktop": `${HOST_BASE}/settings#invitations`,
  "host-schedule-review-desktop": `${HOST_BASE}/sessions/session-28/schedule-review`,
  "host-prep-mobile": PREP_ROUTE,
  "host-live-mobile": LIVE_ROUTE,
  "host-person-mobile": MEMBER_SELECTED_URL,
};

const ADMIN_ROOT = ".admin-shell";
const HOST_ROOT = ".rm-app-club-shell";

function rootSelectorFor(id: ApprovedMockupId): string {
  return id.startsWith("admin-") ? ADMIN_ROOT : HOST_ROOT;
}

function viewportFor(id: ApprovedMockupId): { width: number; height: number } {
  const entry = APPROVED_MOCKUPS.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown approved mockup: ${id}`);
  return entry.cssViewport;
}

export const VISUAL_AUTHORITY_SCENARIOS: readonly VisualAuthorityScenario[] = APPROVED_MOCKUPS.map((entry) => {
  const coverage = REQUIRED_VISUAL_AUTHORITY_COVERAGE[entry.id];
  return {
    id: entry.id,
    route: SCENARIO_ROUTES[entry.id],
    viewport: viewportFor(entry.id),
    rootSelector: rootSelectorFor(entry.id),
    ...coverage,
  };
});

export function visualAuthorityScenario(id: ApprovedMockupId): VisualAuthorityScenario {
  const scenario = VISUAL_AUTHORITY_SCENARIOS.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown visual authority id: ${id}`);
  return scenario;
}

const APPROVED_ID_SET = new Set(APPROVED_MOCKUPS.map((entry) => entry.id));

export function parseVisualAuthoritySelection(
  rawSelection = process.env.READMATES_VISUAL_AUTHORITY_IDS,
): ReadonlySet<ApprovedMockupId> {
  if (rawSelection == null || rawSelection.trim() === "") {
    return new Set(APPROVED_MOCKUPS.map((entry) => entry.id));
  }
  const members = rawSelection.split(",");
  const selected = new Set<ApprovedMockupId>();
  for (const member of members) {
    if (member.trim() === "" || member !== member.trim()) {
      throw new Error(`Visual authority selection contains a blank member: ${rawSelection}`);
    }
    if (!APPROVED_ID_SET.has(member as ApprovedMockupId)) {
      throw new Error(`Unknown visual authority id: ${member}`);
    }
    if (selected.has(member as ApprovedMockupId)) {
      throw new Error(`Visual authority selection contains a duplicate id: ${member}`);
    }
    selected.add(member as ApprovedMockupId);
  }
  return selected;
}

export function visualAuthoritySelected(
  id: ApprovedMockupId,
  rawSelection = process.env.READMATES_VISUAL_AUTHORITY_IDS,
): boolean {
  return parseVisualAuthoritySelection(rawSelection).has(id);
}
