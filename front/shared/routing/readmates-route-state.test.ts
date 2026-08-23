import { describe, expect, it } from "vitest";
import {
  hasHostRecordsReturnState,
  readAppReturnTarget,
  readHostRecordsReturnTarget,
} from "./readmates-route-state";

function state(readmatesReturnTo: string, readmatesReturnState?: unknown) {
  return { readmatesReturnTo, readmatesReturnLabel: "뒤로", readmatesReturnState };
}

describe("hasHostRecordsReturnState", () => {
  it("accepts only the current route scope and same origin", () => {
    expect(hasHostRecordsReturnState(state("/app/host/records"), "/app/host/sessions/session-1")).toBe(true);
    expect(hasHostRecordsReturnState(
      state("/clubs/club-a/app/host/records"),
      "/clubs/club-a/app/host/sessions/session-1",
    )).toBe(true);
    expect(hasHostRecordsReturnState(
      state("/clubs/club-b/app/host/records"),
      "/clubs/club-a/app/host/sessions/session-1",
    )).toBe(false);
    expect(hasHostRecordsReturnState(
      state("/app/host/records"),
      "/clubs/club-a/app/host/sessions/session-1",
    )).toBe(false);
    expect(hasHostRecordsReturnState(
      state("https://external.example/app/host/records"),
      "/app/host/sessions/session-1",
    )).toBe(false);
  });

  it("follows a safe nested return chain without overflowing on a cycle", () => {
    const nestedRecordState = state(
      "/app/host/operations",
      state("/app/host/records"),
    );
    expect(readHostRecordsReturnTarget(
      nestedRecordState,
      "/app/host/sessions/session-1/feedback-document",
    )).toEqual({ href: "/app/host/records", label: "뒤로" });
    expect(hasHostRecordsReturnState(
      nestedRecordState,
      "/app/host/sessions/session-1/feedback-document",
    )).toBe(true);

    const cyclic: Record<string, unknown> = state("/app/host/sessions/session-1");
    cyclic.readmatesReturnState = cyclic;
    expect(hasHostRecordsReturnState(cyclic, "/app/host/sessions/session-1")).toBe(false);
  });

  it("rejects malformed and over-depth nested paths", () => {
    let nested: unknown = state("/app/host/records");
    for (let index = 0; index < 12; index += 1) {
      nested = state(`/app/host/sessions/session-${index}`, nested);
    }
    expect(hasHostRecordsReturnState(nested, "/app/host/sessions/session-1")).toBe(false);
    expect(hasHostRecordsReturnState(state("http://[invalid"), "/app/host/sessions/session-1")).toBe(false);
  });
});

describe("readAppReturnTarget", () => {
  const fallback = {
    href: "/clubs/club-a/app/archive?view=sessions",
    label: "아카이브로",
  };

  it("canonicalizes valid scoped and compatibility return targets into the current club", () => {
    expect(readAppReturnTarget(
      state("/clubs/club-a/app/archive?view=report#session-1"),
      "/clubs/club-a/app/feedback/session-1",
      fallback,
    )).toEqual({
      href: "/clubs/club-a/app/archive?view=report#session-1",
      label: "뒤로",
    });
    expect(readAppReturnTarget(
      state("/app/archive?view=sessions#session-1"),
      "/clubs/club-a/app/sessions/session-1",
      fallback,
    )).toEqual({
      href: "/clubs/club-a/app/archive?view=sessions#session-1",
      label: "뒤로",
    });
    expect(readAppReturnTarget(
      state(
        "/app/feedback/session-1",
        state("/clubs/club-a/app/archive?view=report#session-1"),
      ),
      "/clubs/club-a/app/feedback/session-1/print",
      fallback,
    )).toEqual({
      href: "/clubs/club-a/app/feedback/session-1",
      label: "뒤로",
      state: {
        readmatesReturnTo: "/clubs/club-a/app/archive?view=report#session-1",
        readmatesReturnLabel: "뒤로",
      },
    });
  });

  it.each([
    ["another club", state("/clubs/club-b/app/archive?view=sessions")],
    ["another origin", state("https://outside.example/clubs/club-a/app/archive")],
    ["a malformed URL", state("http://[invalid")],
  ])("falls back for %s", (_case, unsafeState) => {
    expect(readAppReturnTarget(
      unsafeState,
      "/clubs/club-a/app/sessions/session-1",
      fallback,
    )).toEqual(fallback);
  });

  it("falls back for cyclic and over-depth return chains", () => {
    const cyclic: Record<string, unknown> = state("/app/archive?view=sessions");
    cyclic.readmatesReturnState = cyclic;

    let overDepth: unknown = state("/app/archive?view=sessions");
    for (let index = 0; index < 9; index += 1) {
      overDepth = state(`/app/sessions/session-${index}`, overDepth);
    }

    expect(readAppReturnTarget(cyclic, "/clubs/club-a/app/sessions/session-1", fallback)).toEqual(fallback);
    expect(readAppReturnTarget(overDepth, "/clubs/club-a/app/sessions/session-1", fallback)).toEqual(fallback);
  });
});
