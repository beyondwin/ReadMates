import { expect, test } from "@playwright/experimental-ct-react";
import { AdminSupportWorkbench, type AdminSupportWorkbenchProps } from "./admin-support-workbench";
import "./admin-editorial-ledger.css";

test.use({ timezoneId: "UTC" });

const noop = () => undefined;
const selectedSupportProps: AdminSupportWorkbenchProps = {
  clubs: [{ clubId: "club-1", name: "읽는사이" }],
  selectedClubId: "club-1",
  status: "ACTIVE",
  canManage: true,
  latestReceipt: null,
  search: {
    query: "지원 대상",
    results: [],
    selected: {
      subjectId: "subject-1",
      displayName: "지원 대상",
      maskedEmail: "su***@example.com",
      kind: "USER",
      platformAdminRole: null,
      platformAdminStatus: null,
      clubMembershipSummary: [],
      grantEligible: true,
      grantBlockedReason: null,
    },
    hasSearched: true,
    pending: false,
    error: null,
    onQueryChange: noop,
    onSubmit: noop,
    onSelect: noop,
    onClear: noop,
  },
  create: {
    reasonCategory: "MEMBER_ASSISTANCE",
    note: "",
    expiresAt: "2026-08-25T12:00",
    preview: null,
    receipt: null,
    recovery: null,
    previewPending: false,
    confirmPending: false,
    outcomeUnknown: false,
    onReasonCategoryChange: noop,
    onNoteChange: noop,
    onExpiresAtChange: noop,
    onPreview: noop,
    onConfirm: noop,
    onReset: noop,
  },
  ledger: {
    items: [{
      grantId: "grant-1",
      clubId: "club-1",
      clubName: "읽는사이",
      granteeDisplayName: "지원 대상",
      granteeMaskedEmail: "su***@example.com",
      scope: "HOST_SUPPORT_READ",
      reasonCategory: "MEMBER_ASSISTANCE",
      notePresent: true,
      expiresAt: "2026-08-25T12:00:00Z",
      createdAt: "2026-08-25T10:00:00Z",
      revokedAt: null,
      status: "ACTIVE",
      createdByRole: "OWNER",
    }],
    pending: false,
    error: null,
    nextPageError: false,
    hasNextPage: false,
    loadingMore: false,
    onRetry: noop,
    onLoadMore: noop,
  },
  revoke: {
    target: null,
    reasonCategory: "MEMBER_ASSISTANCE",
    note: "",
    preview: null,
    receipt: null,
    recovery: null,
    previewPending: false,
    confirmPending: false,
    outcomeUnknown: false,
    onStart: noop,
    onCancel: noop,
    onReasonCategoryChange: noop,
    onNoteChange: noop,
    onPreview: noop,
    onConfirm: noop,
  },
  onClubChange: noop,
  onStatusChange: noop,
};

test("AdminSupportWorkbench remains operable at a narrow width", async ({ mount }) => {
  const component = await mount(<div style={{ width: 320 }}><AdminSupportWorkbench {...selectedSupportProps} /></div>);
  await expect(component.getByRole("heading", { name: "접근 원장" })).toBeVisible();
  await expect(component.getByRole("button", { name: "발급 검토" })).toBeVisible();
  await expect(component.getByRole("button", { name: "권한 취소 검토" })).toBeVisible();
  await expect(component).toHaveScreenshot("admin-support-workbench-selected.png");
});
