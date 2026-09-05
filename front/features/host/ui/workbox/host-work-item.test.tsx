import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("keeps destination-only rows free of deferral controls until showDeferral", () => {
    const peopleItem: HostWorkboxItemView = {
      ...baseItem,
      key: "MEMBER_APPROVAL:opaque/server:key:r7",
      type: "MEMBER_APPROVAL",
      title: "가입 승인 요청",
      destinationCategory: "people",
      destinationHref: "/app/host/people",
      countLabel: "1명",
    };
    render(<HostWorkItem item={peopleItem} onDefer={vi.fn()} onUndoDeferral={vi.fn()} />);
    const row = screen.getByRole("listitem", { name: "가입 승인 요청" });
    expect(within(row).queryByRole("button", { name: /보류/ })).not.toBeInTheDocument();
    expect(row.textContent).not.toContain("세부 조작");
  });

  it("defers an expanded row that the destination does not own", async () => {
    const onDefer = vi.fn();
    const peopleItem: HostWorkboxItemView = {
      ...baseItem,
      key: "MEMBER_APPROVAL:opaque/server:key:r7",
      type: "MEMBER_APPROVAL",
      title: "가입 승인 요청",
      destinationCategory: "people",
      destinationHref: "/app/host/people",
      countLabel: "1명",
    };
    render(<HostWorkItem item={peopleItem} showDeferral onDefer={onDefer} />);
    const row = screen.getByRole("listitem", { name: "가입 승인 요청" });
    expect(row.textContent).not.toContain("세부 조작");
    await userEvent.click(within(row).getByRole("button", { name: "가입 승인 요청 보류" }));
    expect(onDefer).toHaveBeenCalledWith("MEMBER_APPROVAL:opaque/server:key:r7", "TOMORROW");
  });

  it("wires pendingKey onto expanded undo", () => {
    const peopleItem: HostWorkboxItemView = {
      ...baseItem,
      key: "MEMBER_APPROVAL:opaque/server:key:r7",
      type: "MEMBER_APPROVAL",
      state: "DEFERRED",
      title: "가입 승인 요청",
      destinationCategory: "people",
      destinationHref: "/app/host/people",
      deferredUntil: "2026-09-02T09:00:00Z",
      countLabel: "1명",
    };
    render(
      <HostWorkItem
        item={peopleItem}
        showDeferral
        pending
        onUndoDeferral={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "가입 승인 요청 보류 해제" })).toBeDisabled();
    expect(screen.getByRole("listitem").textContent).not.toContain("세부 조작");
  });
});
