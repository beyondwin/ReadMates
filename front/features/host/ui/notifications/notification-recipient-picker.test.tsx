import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ManualNotificationMemberOption } from "@/features/host/model/host-view-types";
import { NotificationRecipientPicker } from "./notification-recipient-picker";

const memberOne: ManualNotificationMemberOption = {
  membershipId: "membership-1",
  displayName: "읽는 멤버",
  maskedEmail: "r***@example.com",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  sessionParticipationStatus: "ACTIVE",
  attendanceStatus: "CONFIRMED",
  emailEligibility: "ELIGIBLE",
  inAppEligibility: "ELIGIBLE",
};

const memberTwo: ManualNotificationMemberOption = {
  ...memberOne,
  membershipId: "membership-2",
  displayName: "책장 멤버",
  maskedEmail: "b***@example.com",
};

function renderPicker({
  members = [memberOne, memberTwo],
  selectedMembershipIds = [],
  hasMore = false,
  busy = false,
  onChange = vi.fn(),
  onSearch = vi.fn().mockResolvedValue(undefined),
  onLoadMore = vi.fn().mockResolvedValue(undefined),
}: {
  members?: ManualNotificationMemberOption[];
  selectedMembershipIds?: string[];
  hasMore?: boolean;
  busy?: boolean;
  onChange?: (ids: string[]) => void;
  onSearch?: (search: string) => Promise<unknown>;
  onLoadMore?: () => Promise<unknown>;
} = {}) {
  render(
    <NotificationRecipientPicker
      members={members}
      selectedMembershipIds={selectedMembershipIds}
      hasMore={hasMore}
      busy={busy}
      onSelectedMembershipIdsChange={onChange}
      onSearch={onSearch}
      onLoadMore={onLoadMore}
    />,
  );
}

describe("NotificationRecipientPicker", () => {
  it("shows selected members as removable chips and can clear all", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({
      selectedMembershipIds: [memberOne.membershipId, memberTwo.membershipId],
      onChange,
    });

    expect(screen.getByText("2명 선택됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${memberOne.displayName} 선택 해제` }))
      .toHaveClass("rm-notification-recipient-picker__chip");
    await user.click(screen.getByRole("button", { name: "전체 해제" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("keeps full-row checkboxes and pagination accessible", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onLoadMore = vi.fn().mockResolvedValue(undefined);
    renderPicker({ onChange, onLoadMore, hasMore: true });

    const memberCheckbox = screen.getByRole("checkbox", { name: /읽는 멤버/ });
    expect(memberCheckbox.closest("label")).toHaveClass(
      "rm-notification-recipient-picker__row",
    );
    await user.click(memberCheckbox);
    expect(onChange).toHaveBeenCalledWith([memberOne.membershipId]);
    await user.click(screen.getByRole("button", { name: "멤버 더 보기" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("keeps selected member details when refreshed results arrive", async () => {
    const { rerender } = render(
      <NotificationRecipientPicker
        members={[]}
        selectedMembershipIds={[]}
        hasMore={false}
        busy={false}
        onSelectedMembershipIdsChange={vi.fn()}
        onSearch={vi.fn().mockResolvedValue(undefined)}
        onLoadMore={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    rerender(
      <NotificationRecipientPicker
        members={[memberOne]}
        selectedMembershipIds={[memberOne.membershipId]}
        hasMore={false}
        busy={false}
        onSelectedMembershipIdsChange={vi.fn()}
        onSearch={vi.fn().mockResolvedValue(undefined)}
        onLoadMore={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByRole("button", {
      name: `${memberOne.displayName} 선택 해제`,
    })).toBeInTheDocument();
  });
});
