import { describe, expect, it } from "vitest";
import {
  appendCursor,
  combineCursorPages,
  normalizePageRequest,
  pageFromNormalizedPageRequest,
  pageRequests,
} from "./cursor-pagination";

describe("cursor pagination helpers", () => {
  it("normalizes omitted page fields to null", () => {
    expect(normalizePageRequest()).toEqual({ limit: null, cursor: null });
    expect(normalizePageRequest({})).toEqual({ limit: null, cursor: null });
    expect(normalizePageRequest({ limit: 20 })).toEqual({ limit: 20, cursor: null });
    expect(normalizePageRequest({ cursor: "cursor-1" })).toEqual({ limit: null, cursor: "cursor-1" });
    expect(normalizePageRequest({ limit: 20, cursor: "cursor-1" })).toEqual({ limit: 20, cursor: "cursor-1" });
  });

  it("converts normalized pages back to API page requests", () => {
    expect(pageFromNormalizedPageRequest({ limit: null, cursor: null })).toBeUndefined();
    expect(pageFromNormalizedPageRequest({ limit: 20, cursor: null })).toEqual({ limit: 20 });
    expect(pageFromNormalizedPageRequest({ limit: null, cursor: "cursor-1" })).toEqual({ cursor: "cursor-1" });
    expect(pageFromNormalizedPageRequest({ limit: 20, cursor: "cursor-1" })).toEqual({
      limit: 20,
      cursor: "cursor-1",
    });
  });

  it("builds first page plus cursor page requests", () => {
    expect(pageRequests(50, [])).toEqual([{ limit: 50 }]);
    expect(pageRequests(50, ["a", "b"])).toEqual([
      { limit: 50 },
      { limit: 50, cursor: "a" },
      { limit: 50, cursor: "b" },
    ]);
  });

  it("appends only new non-empty cursors", () => {
    expect(appendCursor([], null)).toEqual([]);
    expect(appendCursor([], undefined)).toEqual([]);
    expect(appendCursor([], "")).toEqual([]);
    expect(appendCursor(["a"], "a")).toEqual(["a"]);
    expect(appendCursor(["a"], "b")).toEqual(["a", "b"]);
  });

  it("combines cursor pages in order and keeps the latest nextCursor", () => {
    expect(combineCursorPages([
      { items: [1, 2], nextCursor: "b" },
      undefined,
      { items: [3], nextCursor: null },
    ])).toEqual({
      items: [1, 2, 3],
      nextCursor: null,
    });
  });

  it("returns an empty page when every input page is undefined", () => {
    expect(combineCursorPages<number>([undefined, undefined])).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
