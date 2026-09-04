export const ADMIN_HEADER_DESKTOP_GEOMETRY = { x: 0, y: 0, width: 1672, height: 86 } as const;
export const ADMIN_RAIL_DESKTOP_GEOMETRY = { x: 0, y: 86, width: 260, height: 855 } as const;
export const ADMIN_QUEUE_DESKTOP_GEOMETRY = { x: 260, y: 86, width: 559, height: 855 } as const;
export const ADMIN_DOCKET_DESKTOP_GEOMETRY = { x: 819, y: 86, width: 853, height: 855 } as const;
export const ADMIN_LEDGER_LIST_GEOMETRY = { x: 260, y: 154, width: 559, height: 787 } as const;
export const ADMIN_LEDGER_DOCKET_GEOMETRY = { x: 819, y: 154, width: 853, height: 787 } as const;
export const ADMIN_SERVICE_TABLE_GEOMETRY = { x: 292, y: 154, width: 1348, height: 763 } as const;
export const ADMIN_HEADER_MOBILE_GEOMETRY = { x: 0, y: 0, width: 390, height: 70 } as const;
export const ADMIN_NAV_MOBILE_GEOMETRY = { x: 0, y: 734, width: 390, height: 110 } as const;
export const ADMIN_FIRST_ROW_MOBILE_GEOMETRY = { x: 20, y: 220, width: 350, height: 94 } as const;
export const ADMIN_BACK_MOBILE_GEOMETRY = { x: 0, y: 0, width: 390, height: 67 } as const;
export const ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY = { x: 20, y: 67, width: 350, height: 706 } as const;
export const ADMIN_PAGE_HEADING_DESKTOP_GEOMETRY = { x: 260, y: 86, width: 1412, height: 68 } as const;
export const HOST_BODY_DESKTOP_GEOMETRY = { x: 36, y: 319, width: 1465, height: 665 } as const;
export const HOST_WORKBOX_DESKTOP_GEOMETRY = { x: 988, y: 319, width: 513, height: 665 } as const;
export const HOST_OR_WORKBOX_DESKTOP_GEOMETRY = { x: 987, y: 282, width: 513, height: 665 } as const;
export const HOST_MOBILE_NAV_GEOMETRY = { x: 0, y: 768, width: 390, height: 64 } as const;
export const HOST_PREP_MOBILE_MAIN_GEOMETRY = { x: 19, y: 58, width: 352, height: 902 } as const;
export const HOST_LIVE_MOBILE_MAIN_GEOMETRY = { x: 19, y: 58, width: 352, height: 806 } as const;
export const HOST_LIVE_MOBILE_BOARD_GEOMETRY = { x: 19, y: 200, width: 352, height: 600 } as const;
export const HOST_MEETINGS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_MEETINGS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_OR_DESKTOP_NAV_GEOMETRY = { x: 678, y: 23, width: 233, height: 44 } as const;
export const HOST_MEETINGS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1086 } as const;
export const HOST_PEOPLE_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_PEOPLE_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_PEOPLE_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1062 } as const;
export const HOST_RECORDS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_RECORDS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_RECORDS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 990 } as const;
export const HOST_SETTINGS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_SETTINGS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_SETTINGS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1052 } as const;
export const HOST_SCHEDULE_REVIEW_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
export const HOST_SCHEDULE_REVIEW_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
export const HOST_SCHEDULE_REVIEW_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 943 } as const;
export const HOST_PERSON_HEADER_GEOMETRY = { x: 17, y: 58, width: 356, height: 143 } as const;
export const HOST_PERSON_MAIN_GEOMETRY = { x: 1, y: 58, width: 388, height: 737 } as const;

export const ADMIN_FIRST_ROW_DESKTOP_GEOMETRY = {
  x: ADMIN_QUEUE_DESKTOP_GEOMETRY.x,
  y: ADMIN_LEDGER_LIST_GEOMETRY.y,
  width: ADMIN_QUEUE_DESKTOP_GEOMETRY.width,
  height: 122,
} as const;

export const ADMIN_TODAY_HEADING_MOBILE_GEOMETRY = {
  x: ADMIN_FIRST_ROW_MOBILE_GEOMETRY.x,
  y: ADMIN_HEADER_MOBILE_GEOMETRY.height,
  width: ADMIN_FIRST_ROW_MOBILE_GEOMETRY.width,
  height: ADMIN_FIRST_ROW_MOBILE_GEOMETRY.y - ADMIN_HEADER_MOBILE_GEOMETRY.height,
} as const;

export const ADMIN_QUEUE_MOBILE_GEOMETRY = {
  x: ADMIN_FIRST_ROW_MOBILE_GEOMETRY.x,
  y: ADMIN_HEADER_MOBILE_GEOMETRY.height,
  width: ADMIN_FIRST_ROW_MOBILE_GEOMETRY.width,
  height: ADMIN_NAV_MOBILE_GEOMETRY.y - ADMIN_HEADER_MOBILE_GEOMETRY.height,
} as const;

export const ADMIN_SPACE_TRIGGER_GEOMETRY = {
  x: 188,
  y: 19,
  width: 160,
  height: 48,
} as const;

export const ADMIN_ROOT_SPACE_MENU_GEOMETRY = {
  x: 201,
  y: 88,
  width: 334,
  height: 218,
} as const;

export const ADMIN_DETAIL_HEADING_MOBILE_GEOMETRY = {
  x: ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY.x,
  y: 91,
  width: ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY.width,
  height: 48,
} as const;

export const ADMIN_PRIMARY_ACTION_MOBILE_GEOMETRY = {
  x: ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY.x,
  y: 587,
  width: ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY.width,
  height: 44,
} as const;

export const HOST_CURRENT_MEETING_DESKTOP_GEOMETRY = {
  x: HOST_BODY_DESKTOP_GEOMETRY.x,
  y: HOST_MEETINGS_HEADER_GEOMETRY.height,
  width: HOST_BODY_DESKTOP_GEOMETRY.width,
  height: 148,
} as const;

export const HOST_PHASE_NAV_DESKTOP_GEOMETRY = {
  x: HOST_BODY_DESKTOP_GEOMETRY.x,
  y: HOST_CURRENT_MEETING_DESKTOP_GEOMETRY.y + HOST_CURRENT_MEETING_DESKTOP_GEOMETRY.height,
  width: HOST_BODY_DESKTOP_GEOMETRY.width,
  height: 44,
} as const;

export const HOST_PHASE_STATUS_DESKTOP_GEOMETRY = {
  x: HOST_BODY_DESKTOP_GEOMETRY.x,
  y: 515,
  width: 951,
  height: 18,
} as const;

export const HOST_NEXT_ACTION_DESKTOP_GEOMETRY = {
  x: HOST_BODY_DESKTOP_GEOMETRY.x,
  y: 283,
  width: 951,
  height: 232,
} as const;

export const HOST_PREP_PHASE_PANEL_DESKTOP_GEOMETRY = {
  x: HOST_BODY_DESKTOP_GEOMETRY.x,
  y: 532,
  width: 951,
  height: 313,
} as const;

export const HOST_LIVE_PHASE_PANEL_DESKTOP_GEOMETRY = {
  x: HOST_BODY_DESKTOP_GEOMETRY.x,
  y: 532,
  width: 951,
  height: 313,
} as const;

export const HOST_CLOSING_PHASE_PANEL_DESKTOP_GEOMETRY = {
  x: HOST_BODY_DESKTOP_GEOMETRY.x,
  y: 532,
  width: 951,
  height: 375,
} as const;

export const HOST_OR_MOBILE_CONTEXT_GEOMETRY = { x: 1, y: 0, width: 388, height: 58 } as const;
export const HOST_OR_MOBILE_CURRENT_MEETING_GEOMETRY = { x: 19, y: 59, width: 352, height: 101 } as const;
export const HOST_PREP_MOBILE_PHASE_NAV_GEOMETRY = { x: 19, y: 160, width: 352, height: 45 } as const;
export const HOST_PREP_MOBILE_NEXT_ACTION_GEOMETRY = { x: 19, y: 205, width: 352, height: 131 } as const;
export const HOST_PREP_MOBILE_PHASE_STATUS_GEOMETRY = { x: 19, y: 336, width: 352, height: 18 } as const;
export const HOST_PREP_MOBILE_PHASE_PANEL_GEOMETRY = { x: 19, y: 354, width: 352, height: 242 } as const;
export const HOST_PREP_MOBILE_WORKBOX_GEOMETRY = { x: 19, y: 595, width: 352, height: 227 } as const;
export const HOST_LIVE_MOBILE_PHASE_NAV_GEOMETRY = { x: 19, y: 160, width: 352, height: 41 } as const;
export const HOST_LIVE_MOBILE_NEXT_ACTION_GEOMETRY = { x: 19, y: 200, width: 352, height: 154 } as const;
export const HOST_LIVE_MOBILE_PHASE_STATUS_GEOMETRY = { x: 19, y: 354, width: 352, height: 18 } as const;
export const HOST_LIVE_MOBILE_PHASE_PANEL_GEOMETRY = { x: 19, y: 372, width: 352, height: 205 } as const;
export const HOST_OR_LIVE_MOBILE_BOARD_GEOMETRY = { x: 19, y: 372, width: 352, height: 167 } as const;
export const HOST_LIVE_MOBILE_WORKBOX_GEOMETRY = { x: 19, y: 577, width: 352, height: 227 } as const;
