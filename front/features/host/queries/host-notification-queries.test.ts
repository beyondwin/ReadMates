import { describe, expect, it, vi } from "vitest";
import {
  hostNotificationKeys,
  hostNotificationEventsQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationPolicyQuery,
  hostNotificationSessionsQuery,
  invalidateHostNotificationOverview,
  invalidateManualNotificationState,
} from "./host-notification-queries";
import { hostSessionListQuery } from "./host-session-queries";

describe("host notification query keys", () => {
  it("scopes keys by club slug when one is provided", () => {
    expect(hostNotificationKeys.summary({ clubSlug: "reading-sai" })).toEqual([
      "host",
      "notifications",
      "scope",
      "reading-sai",
      "overview",
      "summary",
    ]);
  });

  it("keeps policy state in its own club-scoped key", () => {
    expect(hostNotificationPolicyQuery({ clubSlug: "reading-sai" }).queryKey).toEqual([
      "host",
      "notifications",
      "reading-sai",
      "policy",
    ]);
  });

  it("normalizes equivalent first page requests to the same key", () => {
    expect(hostNotificationEventsQuery(undefined, { clubSlug: "reading-sai" }).queryKey).toEqual(
      hostNotificationEventsQuery({}, { clubSlug: "reading-sai" }).queryKey,
    );
  });

  it("normalizes blank manual member search to the same key as no search", () => {
    expect(hostNotificationManualOptionsQuery(
      { sessionId: "session-1", search: "   ", page: { limit: 50 } },
      { clubSlug: "reading-sai" },
    ).queryKey).toEqual(
      hostNotificationManualOptionsQuery(
        { sessionId: "session-1", page: { limit: 50 } },
        { clubSlug: "reading-sai" },
      ).queryKey,
    );
  });

  it("uses the shared host session list query for notification session selectors", () => {
    expect(hostNotificationSessionsQuery({ clubSlug: "reading-sai" }).queryKey).toEqual(
      hostSessionListQuery({ limit: 50 }, { clubSlug: "reading-sai" }).queryKey,
    );
  });

  it("invalidates overview and manual roots separately", async () => {
    const client = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateHostNotificationOverview(client as never, { clubSlug: "reading-sai" });
    await invalidateManualNotificationState(client as never, { clubSlug: "reading-sai" });

    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.overview({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.manual({ clubSlug: "reading-sai" }),
    });
  });
});
