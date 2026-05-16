import { describe, it, expect } from "vitest";
import { requestIdForUpstream, READMATES_REQUEST_ID_HEADER } from "../../../functions/_shared/proxy";

describe("requestIdForUpstream", () => {
  it("returns the inbound header when it matches the allowed pattern", () => {
    const request = new Request("https://example.test", {
      headers: { [READMATES_REQUEST_ID_HEADER]: "abc123def4567" },
    });
    expect(requestIdForUpstream(request)).toBe("abc123def4567");
  });

  it("generates a new id when the inbound header is missing", () => {
    const request = new Request("https://example.test");
    const id = requestIdForUpstream(request);
    expect(id).toMatch(/^[A-Za-z0-9-]{12,64}$/);
  });

  it("generates a new id when the inbound header violates the pattern", () => {
    const request = new Request("https://example.test", {
      headers: { [READMATES_REQUEST_ID_HEADER]: "  " },
    });
    const id = requestIdForUpstream(request);
    expect(id).toMatch(/^[A-Za-z0-9-]{12,64}$/);
    expect(id.trim()).toBe(id);
  });

  it("generates a new id when the inbound header is too long", () => {
    const request = new Request("https://example.test", {
      headers: { [READMATES_REQUEST_ID_HEADER]: "a".repeat(100) },
    });
    const id = requestIdForUpstream(request);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});
