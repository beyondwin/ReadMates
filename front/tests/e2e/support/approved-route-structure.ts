import type { Page } from "@playwright/test";
import type { ApprovedMockupId } from "./approved-mockup-manifest";
import type { ApprovedComparisonReport } from "./approved-mockup-contract";

export type StructureRule =
  | { name: string; selector: string; presence: "present"; minCount?: number }
  | { name: string; selector: string; presence: "absent" }
  | { name: string; selector: string; presence: "text-absent"; text: string };

const ADMIN_DESKTOP_SHELL: readonly StructureRule[] = [
  { name: "nav-icons", selector: '.admin-layout-nav__item [data-icon]', presence: "present", minCount: 4 },
  { name: "nav-active-check", selector: '.admin-layout-nav__item--active [data-icon="check-circle-filled"]', presence: "present" },
  { name: "header-status", selector: ".admin-shell__status [data-icon]", presence: "present" },
  { name: "header-account-icon", selector: '.admin-shell__account-control [data-icon="person-circle"]', presence: "present" },
  { name: "nav-logout-icon", selector: '.admin-layout-nav__logout [data-icon="logout"]', presence: "present" },
  { name: "no-account-login-copy", selector: ".admin-shell__header", presence: "text-absent", text: "다른 계정으로 로그인" },
];

const ADMIN_MOBILE_SHELL: readonly StructureRule[] = [
  { name: "tab-icons", selector: ".admin-mobile-navigation__link [data-icon]", presence: "present", minCount: 4 },
  { name: "header-account", selector: ".admin-shell__account-control", presence: "present" },
];

const HOST_DESKTOP_SHELL: readonly StructureRule[] = [
  { name: "space-switcher", selector: '.topnav-global-context [aria-label^="공간 전환"], .topnav-global-context .rm-global-space-switcher__trigger', presence: "present" },
  { name: "utility-settings-icon", selector: '.rm-host-utility-actions__item [data-icon="person-plus"]', presence: "present" },
  { name: "utility-member-view-icon", selector: '.rm-host-utility-actions__item [data-icon="eye"]', presence: "present" },
  { name: "utility-bell", selector: '.rm-host-utility-actions__item [data-icon="bell"]', presence: "present" },
  { name: "utility-avatar", selector: ".topnav-account-actions .rm-avatar-chip", presence: "present" },
  { name: "utility-new-meeting", selector: ".rm-host-utility-actions__item.is-create", presence: "present" },
  { name: "no-text-alarm-link", selector: ".rm-host-utility-actions", presence: "text-absent", text: "알림" },
  { name: "no-detail-ops-leak", selector: "main", presence: "text-absent", text: "세부 조작" },
];

const HOST_MOBILE_SHELL: readonly StructureRule[] = [
  { name: "mobile-space-title", selector: '[data-club-shell-region="mobile-spine"] .rm-mobile-header__space', presence: "present" },
  { name: "mobile-bell", selector: '[data-club-shell-region="mobile-spine"] [data-icon="bell"]', presence: "present" },
  { name: "mobile-avatar", selector: '[data-club-shell-region="mobile-spine"] .rm-avatar-chip', presence: "present" },
  { name: "tab-icons", selector: ".rm-mobile-tab-bar [data-icon]", presence: "present", minCount: 4 },
  { name: "no-ellipsis-menu", selector: '[data-club-shell-region="mobile-spine"]', presence: "text-absent", text: "…" },
  { name: "no-detail-ops-leak", selector: "main", presence: "text-absent", text: "세부 조작" },
];

const HOST_OPERATING_ROOM: readonly StructureRule[] = [
  { name: "cover-image", selector: ".rm-operating-room-header__cover img", presence: "present" },
  { name: "fact-icons", selector: ".rm-operating-room-header__facts [data-icon]", presence: "present", minCount: 3 },
  { name: "header-actions-3", selector: ".rm-operating-room-header__action", presence: "present", minCount: 3 },
  { name: "header-no-member-view", selector: ".rm-operating-room-header__actions", presence: "text-absent", text: "멤버 시야" },
  { name: "phase-tabs", selector: '.rm-operating-room-phases__tab[role="tab"]', presence: "present", minCount: 3 },
  { name: "workbox-row-icon", selector: ".rm-host-work-item .rm-icon-badge", presence: "present" },
  { name: "workbox-row-chevron", selector: '.rm-host-work-item [data-icon="chevron-right"]', presence: "present" },
  { name: "workbox-footer", selector: ".rm-host-workbox__footer", presence: "present" },
];

export const APPROVED_ROUTE_STRUCTURE: Record<ApprovedMockupId, readonly StructureRule[]> = {
  "admin-today-desktop": [...ADMIN_DESKTOP_SHELL],
  "admin-clubs-desktop": [
    ...ADMIN_DESKTOP_SHELL,
    { name: "club-tabs", selector: '.admin-clubs-ledger [role="tablist"] [role="tab"]', presence: "present", minCount: 3 },
    { name: "club-tab-count", selector: '.admin-clubs-ledger [role="tab"] .admin-clubs-ledger__count', presence: "present", minCount: 3 },
    { name: "club-fact-icons", selector: ".admin-clubs-ledger__facts [data-icon]", presence: "present", minCount: 4 },
    { name: "club-review-section", selector: ".admin-clubs-ledger__review", presence: "present" },
    { name: "no-tech-info-row-label", selector: ".admin-clubs-ledger__list", presence: "text-absent", text: "기술 정보" },
  ],
  "admin-service-desktop": [
    ...ADMIN_DESKTOP_SHELL,
    { name: "status-table", selector: '.admin-service-status table, .admin-service-status [role="table"]', presence: "present" },
    { name: "status-columns", selector: '.admin-service-status [role="columnheader"], .admin-service-status th', presence: "present", minCount: 5 },
    { name: "expanded-row-summary", selector: ".admin-service-status__expanded .admin-service-status__facts", presence: "present" },
    { name: "last-full-check", selector: ".admin-shell__status-aside", presence: "present" },
    { name: "no-recent-changes-panel", selector: "main", presence: "text-absent", text: "최근에 바뀐 것" },
    { name: "no-refresh-button-heading", selector: "main h1", presence: "text-absent", text: "서비스 건강" },
  ],
  "admin-records-desktop": [
    ...ADMIN_DESKTOP_SHELL,
    { name: "search-icon", selector: '.admin-audit__search [data-icon="search"]', presence: "present" },
    { name: "period-filter", selector: ".admin-audit__period", presence: "present" },
    { name: "row-status-icon", selector: ".admin-audit__row [data-icon]", presence: "present" },
    { name: "detail-sections", selector: ".admin-audit__detail-section", presence: "present", minCount: 5 },
  ],
  "admin-space-switcher-desktop": [
    ...ADMIN_DESKTOP_SHELL,
    { name: "menu-check-icon", selector: '[role="menu"] [data-icon="check-circle-filled"]', presence: "present" },
  ],
  "admin-today-mobile": [...ADMIN_MOBILE_SHELL,
    { name: "status-band", selector: ".admin-shell__status--band", presence: "present" },
    { name: "row-chevron", selector: '.admin-operations-queue [data-icon="chevron-right"]', presence: "present" },
  ],
  "admin-work-detail-mobile": [...ADMIN_MOBILE_SHELL,
    { name: "back-chevron", selector: '[data-icon="chevron-left"]', presence: "present" },
  ],
  "host-prep-desktop": [
    ...HOST_DESKTOP_SHELL, ...HOST_OPERATING_ROOM,
    { name: "next-action-secondary", selector: ".rm-operating-room-next-action__secondary", presence: "present" },
    { name: "prep-columns", selector: ".rm-preparation-ledger__head", presence: "present" },
    { name: "prep-row-action-label", selector: ".rm-preparation-ledger-row__link", presence: "text-absent", text: "자세히 보기" },
  ],
  "host-live-desktop": [
    ...HOST_DESKTOP_SHELL, ...HOST_OPERATING_ROOM,
    { name: "live-badge", selector: '.rm-operating-room-header__lifecycle[data-badge="today"], .rm-operating-room-header__lifecycle[data-badge="live"]', presence: "present" },
    { name: "next-action-attendance", selector: '.rm-operating-room-next-action[data-kind="attendance"]', presence: "present" },
  ],
  "host-closing-desktop": [
    ...HOST_DESKTOP_SHELL, ...HOST_OPERATING_ROOM,
    { name: "closing-preview-action", selector: '.rm-operating-room-header__action [data-icon="document"]', presence: "present" },
    { name: "step-numbers", selector: ".rm-session-closing-board__step-index", presence: "present", minCount: 5 },
  ],
  "host-meetings-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "view-toggle-icons", selector: '.rm-meeting-toc__view-toggle [data-icon]', presence: "present", minCount: 2 },
    { name: "status-tabs", selector: '.rm-meeting-toc__filters [role="tab"]', presence: "present", minCount: 4 },
    { name: "status-dot", selector: ".rm-meeting-toc__status-dot", presence: "present" },
    { name: "month-timeline", selector: ".rm-meeting-toc__timeline", presence: "present" },
    { name: "footer-total", selector: ".rm-meeting-toc__footer", presence: "present" },
    { name: "no-page-create-button", selector: ".rm-meeting-toc__header", presence: "text-absent", text: "새 모임 만들기" },
    { name: "no-breadcrumb", selector: "main", presence: "text-absent", text: "예정과 기록" },
  ],
  "host-people-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "pending-flat-table", selector: ".rm-member-ledger__pending-row", presence: "present" },
    { name: "schedule-icon", selector: ".rm-member-ledger__schedule [data-icon]", presence: "present" },
    { name: "rsvp-icon", selector: ".rm-member-ledger__rsvp [data-icon]", presence: "present" },
    { name: "open-link", selector: ".rm-member-ledger__open", presence: "present" },
    { name: "current-schedule-rail", selector: ".rm-member-ledger__rail-row", presence: "present", minCount: 4 },
    { name: "no-inline-rename", selector: ".rm-member-ledger", presence: "text-absent", text: "이름 변경" },
    { name: "no-inline-exclude", selector: ".rm-member-ledger", presence: "text-absent", text: "모임 제외" },
  ],
  "host-records-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "status-tabs-underline", selector: '.rm-record-ledger__tabs [role="tab"]', presence: "present", minCount: 4 },
    { name: "export-icon", selector: '.rm-record-ledger__export [data-icon="export"]', presence: "present" },
    { name: "next-closing-banner", selector: ".rm-record-ledger__next .rm-icon-badge", presence: "present" },
    { name: "rail-work-rows", selector: ".rm-record-ledger__rail .rm-host-work-item", presence: "present" },
    { name: "publish-history-footer", selector: ".rm-record-ledger__footer", presence: "present" },
  ],
  "host-settings-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "page-cta", selector: ".rm-host-settings__header .btn-primary", presence: "present" },
    { name: "link-tabs", selector: '.rm-host-invitations__tabs [role="tab"]', presence: "present", minCount: 3 },
    { name: "club-end-row", selector: ".rm-host-settings__end", presence: "present" },
    { name: "no-revision-copy", selector: "main", presence: "text-absent", text: "revision" },
    { name: "no-save-button", selector: "main", presence: "text-absent", text: "설정 저장" },
  ],
  "host-schedule-review-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "breadcrumb", selector: ".rm-schedule-review__breadcrumb", presence: "present" },
    { name: "change-table", selector: ".rm-schedule-review__changes", presence: "present" },
    { name: "target-table-header", selector: ".rm-schedule-review__targets thead", presence: "present" },
    { name: "select-all", selector: '.rm-schedule-review__select-all input[type="checkbox"]', presence: "present" },
    { name: "excluded-link", selector: ".rm-schedule-review__excluded", presence: "present" },
    { name: "body-counter", selector: ".rm-schedule-review__counter", presence: "present" },
    { name: "defer-secondary", selector: ".rm-schedule-review__defer", presence: "present" },
    { name: "cancel-link", selector: ".rm-schedule-review__cancel", presence: "present" },
  ],
  "host-prep-mobile": [
    ...HOST_MOBILE_SHELL,
    { name: "cover-image", selector: ".rm-operating-room-header__cover img", presence: "present" },
    { name: "fact-icons", selector: ".rm-operating-room-header__facts [data-icon]", presence: "present", minCount: 2 },
    { name: "prep-row-chevron", selector: '.rm-preparation-ledger-row [data-icon="chevron-right"]', presence: "present" },
    { name: "workbox-title", selector: "#host-workbox-title", presence: "present" },
    { name: "workbox-row-icon", selector: ".rm-host-work-item .rm-icon-badge", presence: "present" },
  ],
  "host-live-mobile": [
    ...HOST_MOBILE_SHELL,
    { name: "live-badge", selector: '.rm-operating-room-header__lifecycle[data-badge="live"], .rm-operating-room-header__lifecycle[data-badge="today"]', presence: "present" },
    { name: "attendance-control-icons", selector: ".rm-attendance-choice [data-icon]", presence: "present" },
    { name: "compact-preview-one-row", selector: ".rm-meeting-response-ledger__row", presence: "present", minCount: 1 },
  ],
  "host-person-mobile": [
    ...HOST_MOBILE_SHELL,
    { name: "back-row", selector: '.rm-person-detail__back [data-icon="arrow-left"]', presence: "present" },
    { name: "folio-number", selector: ".rm-person-detail__folio", presence: "present" },
    { name: "section-icons", selector: ".rm-person-detail__section [data-icon]", presence: "present", minCount: 3 },
    { name: "more-menu", selector: '.rm-person-detail__more [data-icon="more"]', presence: "present" },
    { name: "no-ledger-back-copy", selector: "main", presence: "text-absent", text: "사람 관리 원장으로" },
  ],
};

export async function measureStructure(
  page: Page,
  rules: readonly StructureRule[],
): Promise<ApprovedComparisonReport["structure"]> {
  const out: ApprovedComparisonReport["structure"] = [];
  for (const rule of rules) {
    const locator = page.locator(rule.selector);
    const count = await locator.count();
    if (rule.presence === "present") {
      const min = rule.minCount ?? 1;
      out.push({ name: rule.name, selector: rule.selector, presence: rule.presence, passed: count >= min, detail: `count=${count} min=${min}` });
    } else if (rule.presence === "absent") {
      out.push({ name: rule.name, selector: rule.selector, presence: rule.presence, passed: count === 0, detail: `count=${count}` });
    } else {
      const texts = count === 0 ? [] : await locator.allInnerTexts();
      const leaked = texts.some((t) => t.includes(rule.text));
      out.push({ name: rule.name, selector: rule.selector, presence: rule.presence, passed: !leaked, detail: leaked ? `text "${rule.text}" present` : "ok" });
    }
  }
  return out;
}
