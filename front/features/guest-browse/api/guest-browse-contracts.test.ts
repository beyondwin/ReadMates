import { describe, expect, it } from "vitest";
import guestArchiveDetailFixture from "../../../tests/unit/__fixtures__/zod-schemas/guest-archive-detail.json";
import { GuestArchiveDetailSchema } from "./guest-browse-contracts";

const forbiddenGuestKeys = new Set([
  "membershipId",
  "accountName",
  "email",
  "userId",
  "clubId",
  "locationLabel",
  "meetingUrl",
  "meetingPasscode",
  "feedbackDocument",
]);

function forbiddenKeysIn(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(forbiddenKeysIn);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => [
    ...(forbiddenGuestKeys.has(key) ? [key] : []),
    ...forbiddenKeysIn(nested),
  ]);
}

describe("guest archive detail shared fixture", () => {
  it("parses the generated server fixture with the actual frontend Zod schema", () => {
    expect(GuestArchiveDetailSchema.parse(guestArchiveDetailFixture)).toEqual(guestArchiveDetailFixture);
  });

  it("contains no recursively forbidden guest contract keys", () => {
    expect(forbiddenKeysIn(guestArchiveDetailFixture)).toEqual([]);
  });
});
