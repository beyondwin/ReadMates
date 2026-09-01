import { describe, expect, it } from "vitest";
import { hostClubSettingsKeys } from "./host-club-settings-queries";
import { hostInvitationLinkKeys } from "./host-invitation-link-queries";

describe("host settings query keys", () => {
  it("binds links, settings and paging to an explicit club", () => {
    const context = { clubSlug: "reading-sai" };
    expect(hostInvitationLinkKeys.list({ limit: 20, cursor: "opaque" }, context)).toEqual([
      "host", "reading-sai", "invitation-links", "list", { limit: 20, cursor: "opaque" },
    ]);
    expect(hostInvitationLinkKeys.history("link-1", { limit: 10 }, context)).toEqual([
      "host", "reading-sai", "invitation-links", "history", "link-1", { limit: 10 },
    ]);
    expect(hostClubSettingsKeys.detail(context)).toEqual(["host", "reading-sai", "club-settings", "detail"]);
    expect(hostClubSettingsKeys.history({ cursor: "next" }, context)).toEqual(["host", "reading-sai", "club-settings", "history", { cursor: "next" }]);
  });
});
