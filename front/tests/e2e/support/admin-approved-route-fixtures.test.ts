import { describe, expect, it } from "vitest";
import { buildAdminTodayOperationCases } from "./admin-approved-route-fixtures";

const GENERATED_AT = "2026-08-26T10:00:00Z";

describe("admin approved Today fixtures", () => {
  it("freezes the first three firstObservedAt values against generatedAt", () => {
    const items = buildAdminTodayOperationCases();
    expect(items.slice(0, 3).map((item) => item.firstObservedAt)).toEqual([
      "2026-08-26T09:50:00.000Z",
      "2026-08-26T09:25:00.000Z",
      "2026-08-26T09:00:00.000Z",
    ]);
    expect(items[0]?.firstObservedAt).not.toEqual(new Date(Date.now() - 10 * 60_000).toISOString());
    expect(Date.parse(GENERATED_AT) - Date.parse(items[0]!.firstObservedAt)).toBe(10 * 60_000);
  });
});
