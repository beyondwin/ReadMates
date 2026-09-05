import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HostWorkboxItemView } from "@/features/host/model/host-workbox-model";
import { HostWorkItem } from "./host-work-item";
import { workItemIcon } from "./host-work-item-icon";

const baseItem: HostWorkboxItemView = {
  key: "SCHEDULE_UNSEEN:opaque/server:key:r7",
  type: "SCHEDULE_UNSEEN",
  state: "NOW",
  title: "일정 확인이 필요한 멤버",
  description: "변경 전 확인 1명 · 미열람 2명",
  count: 4,
  dueAt: null,
  deferredUntil: null,
  resolvedAt: null,
  destinationHref: "/app/host/sessions/session-1/schedule-review",
  receiptSummary: null,
  operationalLabel: "일정 미열람 확인",
  destinationCategory: "schedule-review",
  countLabel: "4명",
};

describe("workItemIcon", () => {
  it("maps each work item type to a toned Readmates icon", () => {
    expect(workItemIcon("SCHEDULE_UNSEEN")).toEqual({ name: "alert-circle", tone: "warn" });
    expect(workItemIcon("MEMBER_APPROVAL")).toEqual({ name: "person", tone: "ok" });
    expect(workItemIcon("RECORD_CLOSING")).toEqual({ name: "document", tone: "info" });
    expect(workItemIcon("INVITATION_EXPIRY")).toEqual({ name: "link", tone: "danger" });
    expect(workItemIcon("NOTIFICATION_FAILURE")).toEqual({ name: "bell", tone: "warn" });
  });
});

describe("HostWorkItem", () => {
  it("renders a toned icon badge, title, count·due, and chevron with no detail-ops summary", () => {
    render(
      <HostWorkItem
        item={{ ...baseItem, type: "SCHEDULE_UNSEEN", title: "일정 미열람 확인", countLabel: "4명", dueAt: null }}
      />,
    );
    const row = screen.getByRole("listitem");
    expect(row.querySelector('.rm-icon-badge[data-tone="warn"] [data-icon="alert-circle"]')).toBeTruthy();
    expect(row.querySelector('[data-icon="chevron-right"]')).toBeTruthy();
    expect(row.textContent).not.toContain("세부 조작");
    expect(screen.queryByRole("group")).toBeNull();
  });
});
