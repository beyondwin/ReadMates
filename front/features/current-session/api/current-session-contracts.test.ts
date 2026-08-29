import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentSessionContractFixture } from "@/tests/unit/api-contract-fixtures";
import {
  parseCurrentSessionResponse,
  parseScheduleSeenReceipt,
} from "@/features/current-session/api/current-session-contracts";
import { markCurrentScheduleSeen } from "./current-session-api";

const frontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readFrontFile(relativePath: string) {
  return fs.readFileSync(path.join(frontRoot, relativePath), "utf8");
}

afterEach(() => vi.unstubAllGlobals());

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
  it("parses authoritative schedule revision and requester-only seen facts", () => {
    const payload = structuredClone(currentSessionContractFixture) as typeof currentSessionContractFixture & {
      currentSession: NonNullable<typeof currentSessionContractFixture.currentSession> & {
        scheduleRevision: number;
        mySeenScheduleRevision: number | null;
        myScheduleSeenAt: string | null;
      };
    };
    Object.assign(payload.currentSession, {
      scheduleRevision: 7,
      mySeenScheduleRevision: 6,
      myScheduleSeenAt: "2026-08-29T00:00:00Z",
    });

    expect(parseCurrentSessionResponse(payload)).toEqual(payload);
  });

  it("accepts a valid current-session payload", () => {
    expect(parseCurrentSessionResponse(currentSessionContractFixture)).toEqual(currentSessionContractFixture);
  });

  it("throws when a nested attendee is missing rsvpStatus", () => {
    const invalidPayload = structuredClone(currentSessionContractFixture);
    delete (invalidPayload.currentSession?.attendees[0] as { rsvpStatus?: unknown } | undefined)?.rsvpStatus;

    expect(() => parseCurrentSessionResponse(invalidPayload)).toThrow();
  });

  it("preserves unknown future avatar keys at the API boundary", () => {
    const payload = structuredClone(currentSessionContractFixture);
    const currentSession = payload.currentSession;

    if (!currentSession) {
      throw new Error("fixture must include a current session");
    }

    currentSession.attendees[0].avatarKey = "future-avatar";
    currentSession.board.questions[0].avatarKey = "future-avatar";
    currentSession.board.longReviews[0].avatarKey = "future-avatar";

    expect(parseCurrentSessionResponse(payload)).toEqual(payload);
  });
});

describe("schedule seen acknowledgement contract", () => {
  it("sends the exact rendered revision through the club-scoped write recovery path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      scheduleRevision: 7,
      seenAt: "2026-08-29T00:00:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(markCurrentScheduleSeen(7, { clubSlug: "reading-sai" })).resolves.toEqual({
      scheduleRevision: 7,
      seenAt: "2026-08-29T00:00:00Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current/schedule-seen?clubSlug=reading-sai",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ scheduleRevision: 7 }) }),
    );
  });

  it("rejects malformed or over-broad receipts", () => {
    expect(() => parseScheduleSeenReceipt({ scheduleRevision: 7 })).toThrow();
    expect(() => parseScheduleSeenReceipt({
      scheduleRevision: 7,
      seenAt: "2026-08-29T00:00:00Z",
      userId: "forbidden",
    })).toThrow();
  });
});
