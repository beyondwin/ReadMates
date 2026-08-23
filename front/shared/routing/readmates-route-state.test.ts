import { describe, expect, it } from "vitest";
import {
  hasHostRecordsReturnState,
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
