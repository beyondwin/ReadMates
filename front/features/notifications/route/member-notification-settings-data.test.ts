import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPreferences } from "../model/notification-preferences-model";
import { memberNotificationSettingsLoader } from "./member-notification-settings-data";

const api = vi.hoisted(() => ({
  fetchNotificationPreferences: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  loadMemberAppAuth: vi.fn(),
}));

vi.mock("../api/notification-preferences-api", () => api);
vi.mock("@/shared/auth/member-app-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/auth/member-app-loader")>()),
  loadMemberAppAuth: auth.loadMemberAppAuth,
}));

const preferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

const activeAccess = {
  allowed: true,
  auth: {
    authenticated: true,
    userId: "reader-user",
    membershipId: "reader-membership",
    clubId: "club-id",
    email: "reader@example.com",
    displayName: "독자",
    accountName: "book-friend",
    role: "MEMBER" as const,
    membershipStatus: "ACTIVE" as const,
    approvalState: "ACTIVE" as const,
  },
};

const viewerAccess = {
  allowed: true,
  auth: {
    ...activeAccess.auth,
    membershipStatus: "VIEWER" as const,
    approvalState: "VIEWER" as const,
  },
};

const scopedArgs = {
  params: { clubSlug: "reading-sai" },
  request: new Request("https://readmates.test/clubs/reading-sai/app/notifications/settings"),
} as Parameters<typeof memberNotificationSettingsLoader>[0];

describe("memberNotificationSettingsLoader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads writable preferences for an active scoped member", async () => {
    auth.loadMemberAppAuth.mockResolvedValue(activeAccess);
    api.fetchNotificationPreferences.mockResolvedValue(preferences);

    await expect(memberNotificationSettingsLoader(scopedArgs)).resolves.toEqual({
      status: "ready",
      preferences,
    });
    expect(api.fetchNotificationPreferences).toHaveBeenCalledWith({
      clubSlug: "reading-sai",
    });
  });

  it("returns unavailable without requesting preferences for a viewer", async () => {
    auth.loadMemberAppAuth.mockResolvedValue(viewerAccess);

    await expect(memberNotificationSettingsLoader(scopedArgs)).resolves.toEqual({
      status: "unavailable",
    });
    expect(api.fetchNotificationPreferences).not.toHaveBeenCalled();
  });

  it("contains a preference GET failure inside the settings loader state", async () => {
    auth.loadMemberAppAuth.mockResolvedValue(activeAccess);
    api.fetchNotificationPreferences.mockRejectedValue(new Error("temporary failure"));

    await expect(memberNotificationSettingsLoader(scopedArgs)).resolves.toEqual({
      status: "error",
    });
  });
});
