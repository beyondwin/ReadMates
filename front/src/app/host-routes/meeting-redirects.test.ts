import { describe, expect, it } from "vitest";
import { canonicalMeetingPath } from "./meeting-redirects";

describe("canonicalMeetingPath", () => {
  it("drops /edit and keeps search", () => {
    expect(canonicalMeetingPath("/clubs/demo/app/host/sessions/abc/edit", "?section=records&source=json"))
      .toBe("/clubs/demo/app/host/sessions/abc?section=records&source=json");
  });

  it("maps /closing to the after phase", () => {
    expect(canonicalMeetingPath("/app/host/sessions/abc/closing", ""))
      .toBe("/app/host/sessions/abc");
  });
});
