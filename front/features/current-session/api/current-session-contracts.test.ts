import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { currentSessionContractFixture } from "@/tests/unit/api-contract-fixtures";
import { parseCurrentSessionResponse } from "@/features/current-session/api/current-session-contracts";

const frontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readFrontFile(relativePath: string) {
  return fs.readFileSync(path.join(frontRoot, relativePath), "utf8");
}

describe("/api/sessions/current response contract ownership", () => {
  it("keeps member-home and host API clients on the canonical current-session response contract", () => {
    const consumers = [
      "features/member-home/api/member-home-contracts.ts",
      "features/host/api/host-contracts.ts",
      "features/host/api/host-api.ts",
    ];

    for (const consumer of consumers) {
      const source = readFrontFile(consumer);

      expect(source, consumer).toContain("@/shared/model/current-session-contracts");
      expect(source, consumer).not.toContain("export type CurrentSessionResponse = {");
      expect(source, consumer).not.toContain("export type MemberHomeCurrentSessionResponse = {");
    }
  });
});

describe("parseCurrentSessionResponse", () => {
  it("accepts a valid current-session payload", () => {
    expect(parseCurrentSessionResponse(currentSessionContractFixture)).toEqual(currentSessionContractFixture);
  });

  it("throws when a nested attendee is missing rsvpStatus", () => {
    const invalidPayload = structuredClone(currentSessionContractFixture);
    delete (invalidPayload.currentSession?.attendees[0] as { rsvpStatus?: unknown } | undefined)?.rsvpStatus;

    expect(() => parseCurrentSessionResponse(invalidPayload)).toThrow();
  });
});
