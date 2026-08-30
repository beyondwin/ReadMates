import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMemberNotifications,
  markAllMemberNotificationsRead,
  markMemberNotificationRead,
} from "../api/notifications-api";
import { memberNotificationsActions, publishMemberNotificationsRefresh } from "./member-notifications-data";

vi.mock("../api/notifications-api", () => ({
  fetchMemberNotifications: vi.fn(),
  markAllMemberNotificationsRead: vi.fn(),
  markMemberNotificationRead: vi.fn(),
}));

describe("member notification action publication fence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns mutation observations without refreshing presentation state", async () => {
    const refresh = vi.fn();
    vi.mocked(markMemberNotificationRead).mockResolvedValue();
    vi.mocked(markAllMemberNotificationsRead).mockResolvedValue({ updatedCount: 2 });

    await memberNotificationsActions.markRead("notification-1");
    await memberNotificationsActions.markAllRead();

    expect(markMemberNotificationRead).toHaveBeenCalledWith("notification-1");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes only through the explicit accepted-owner publisher", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    await publishMemberNotificationsRefresh(refresh);
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchMemberNotifications).not.toHaveBeenCalled();
  });
});
