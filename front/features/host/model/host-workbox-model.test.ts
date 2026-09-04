import { describe, expect, it } from "vitest";
import type {
  HostWorkItemType,
  HostWorkboxPage,
  HostWorkboxState,
} from "../api/host-workbox-contracts";
import { buildHostWorkboxDisclosure, buildHostWorkboxView } from "./host-workbox-model";

const TYPE_EXPECTATIONS = [
  ["SCHEDULE_UNSEEN", "일정 미열람 확인", "schedule-review"],
  ["MEMBER_APPROVAL", "가입 승인 검토", "people"],
  ["RECORD_CLOSING", "지난 모임 기록 마감", "records"],
  ["INVITATION_EXPIRY", "초대 링크 만료 확인", "invitation-settings"],
  ["NOTIFICATION_FAILURE", "알림 실패 확인", "notifications"],
] as const satisfies readonly [HostWorkItemType, string, string][];

function page(state: HostWorkboxState = "NOW"): HostWorkboxPage {
  return {
    state,
    evaluatedAt: "2026-08-30T09:00:00Z",
    sourceAvailability: TYPE_EXPECTATIONS.map(([type]) => ({
      type,
      state: "AVAILABLE",
      failureCode: null,
    })),
    items: TYPE_EXPECTATIONS.map(([type], index) => ({
      key: `${type}:resource-${index}:g1`,
      type,
      state,
      title: `서버 제목 ${index}`,
      description: `서버 설명 ${index}`,
      count: index === 0 ? 0 : index,
      dueAt: null,
      deferredUntil: state === "DEFERRED" ? "2026-08-31T09:00:00Z" : null,
      resolvedAt: state === "COMPLETED" ? "2026-08-30T08:00:00Z" : null,
      destinationHref: `/app/host/destination/${index}`,
      receiptSummary: state === "COMPLETED"
        ? { operation: "REVIEW", outcome: "DONE", affectedCount: index }
        : null,
    })),
    nextCursor: null,
  };
}

describe("buildHostWorkboxView", () => {
  it("maps every source to the approved Korean label and destination category without rewriting hrefs", () => {
    const view = buildHostWorkboxView(page());

    expect(view.items.map((item) => [
      item.type,
      item.operationalLabel,
      item.destinationCategory,
      item.destinationHref,
    ])).toEqual(TYPE_EXPECTATIONS.map(([type, label, category], index) => [
      type,
      label,
      category,
      `/app/host/destination/${index}`,
    ]));
  });

  it("keeps a literal zero visible as data", () => {
    const view = buildHostWorkboxView(page());

    expect(view.items[0]).toMatchObject({
      type: "SCHEDULE_UNSEEN",
      count: 0,
      countLabel: "0",
    });
  });

  it("returns typed partial warnings instead of presenting an empty success", () => {
    const input = page();
    input.items = [];
    input.sourceAvailability = input.sourceAvailability.map((entry) => entry.type === "RECORD_CLOSING"
      ? {
          type: "RECORD_CLOSING",
          state: "UNAVAILABLE",
          failureCode: "RECORD_SOURCE_UNAVAILABLE",
        }
      : entry);

    const view = buildHostWorkboxView(input);

    expect(view.items).toEqual([]);
    expect(view.partialWarnings).toEqual([{
      type: "RECORD_CLOSING",
      operationalLabel: "지난 모임 기록 마감",
      failureCode: "RECORD_SOURCE_UNAVAILABLE",
      message: "지난 모임 기록 마감 정보를 불러오지 못했어요.",
    }]);
  });

  it.each(["NOW", "DEFERRED", "COMPLETED"] as const)(
    "models %s distinctly and retains only the receipt supplied by the wire",
    (state) => {
      const view = buildHostWorkboxView(page(state));

      expect(view.state).toBe(state);
      expect(view.items.every((item) => item.state === state)).toBe(true);
      expect(view.items[0]?.receiptSummary).toEqual(
        state === "COMPLETED"
          ? { operation: "REVIEW", outcome: "DONE", affectedCount: 0 }
          : null,
      );
    },
  );
});

function viewWithTwelveItems() {
  const base = buildHostWorkboxView(page());
  const types = TYPE_EXPECTATIONS.map(([type]) => type);
  return {
    ...base,
    items: Array.from({ length: 12 }, (_, index) => {
      const [type, operationalLabel, destinationCategory] = TYPE_EXPECTATIONS[index % TYPE_EXPECTATIONS.length];
      return {
        ...base.items[index % base.items.length],
        key: `${types[index % types.length]}:resource-${index}:g1`,
        type,
        title: `서버 제목 ${index}`,
        count: index,
        countLabel: String(index),
        destinationHref: `/app/host/destination/${index}`,
        operationalLabel,
        destinationCategory,
      };
    }),
  };
}

describe("buildHostWorkboxDisclosure", () => {
  it("shows four desktop items or three mobile items until explicitly expanded", () => {
    expect(buildHostWorkboxDisclosure(viewWithTwelveItems(), { limit: 4, expanded: false }))
      .toMatchObject({ visibleItems: expect.any(Array), hiddenCount: 8, hasMore: true, expanded: false });
    expect(buildHostWorkboxDisclosure(viewWithTwelveItems(), { limit: 3, expanded: false }).visibleItems)
      .toHaveLength(3);
  });

  it("keeps the source order and exposes all loaded items when expanded", () => {
    const result = buildHostWorkboxDisclosure(viewWithTwelveItems(), { limit: 4, expanded: true });
    expect(result.visibleItems.map((item) => item.key))
      .toEqual(viewWithTwelveItems().items.map((item) => item.key));
  });
});
