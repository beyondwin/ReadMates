import { describe, expect, it, vi } from "vitest";
import type { HostMembersActions } from "@/features/host/model/host-member-actions";
import { TransitionOwnerObsoleteError } from "@/shared/ui/use-transition-safety-owner";
import { registerHostMemberActions } from "./host-members-route";

describe("host member transition owner", () => {
  it("suppresses a late successful profile result from an obsolete owner", async () => {
    const source = {
      loadMembers: vi.fn(),
      refreshMembers: vi.fn(),
      submitLifecycle: vi.fn(),
      submitProfile: vi.fn(async () => ({ membershipId: "m-1" })),
      submitViewerAction: vi.fn(),
    } as unknown as HostMembersActions;
    const owner = {
      begin: vi.fn(() => ({
        generation: 1,
        settle: vi.fn(async () => "obsolete" as const),
        publishAccepted: vi.fn(),
        unregister: vi.fn(),
        reconcile: vi.fn(),
      })),
      beginReceipt: vi.fn(),
    };

    await expect(registerHostMemberActions(source, owner as never).submitProfile("m-1", "새 이름"))
      .rejects.toBeInstanceOf(TransitionOwnerObsoleteError);
    expect(source.submitProfile).toHaveBeenCalledTimes(1);
    expect(source.refreshMembers).not.toHaveBeenCalled();
  });
});
