import { describe, expect, it } from "vitest";
import { canonicalMeetingPath } from "./meeting-redirects";

describe("canonicalMeetingPath", () => {
  it("drops /edit and keeps search", () => {
    expect(canonicalMeetingPath("/clubs/demo/app/host/sessions/abc/edit", "?section=records&source=json"))
      .toBe("/clubs/demo/app/host/sessions/abc?section=records&source=json");
  });

  it("maps /closing to the diary records step", () => {
    expect(canonicalMeetingPath("/app/host/sessions/s1/closing", "")).toBe(
      "/app/host/sessions/s1?section=records",
    );
    expect(canonicalMeetingPath("/app/host/sessions/s1/closing", "?foo=1")).toBe(
      "/app/host/sessions/s1?foo=1&section=records",
    );
  });
});
