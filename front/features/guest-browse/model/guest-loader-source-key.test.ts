import { describe, expect, it } from "vitest";
import { guestLoaderSourceKey } from "./guest-loader-source-key";

describe("guest loader source keys", () => {
  it("changes for a new loader result even in the same club and never collides across clubs", () => {
    const first = {};
    const replacement = {};
    expect(guestLoaderSourceKey("alpha", first)).toBe(guestLoaderSourceKey("alpha", first));
    expect(guestLoaderSourceKey("alpha", first)).not.toBe(guestLoaderSourceKey("alpha", replacement));
    expect(guestLoaderSourceKey("alpha", replacement)).not.toBe(guestLoaderSourceKey("beta", replacement));
  });
});
