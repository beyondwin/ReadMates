import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { HostPeoplePage } from "./host-people-page";
import { matchesHostPeopleNameQuery } from "./host-people-name-query";
import { MemberList } from "./member-list";
import { MemberPendingZone } from "./member-pending-zone";

function member(overrides: Partial<HostMemberListItem> = {}): HostMemberListItem {
  return {
    membershipId: "membership-sky",
    userId: "user-sky",
    email: "sky@example.test",
    displayName: "김하늘",
    accountName: "hidden-account",
    profileImageUrl: null,
    avatarKey: "mushroom-green-book",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2025-01-02T00:00:00Z",
    createdAt: "2025-01-02T00:00:00Z",
    lastClubAccessAt: null,
    currentSessionParticipationStatus: "ACTIVE",
    canSuspend: true,
    canRestore: false,
    canDeactivate: true,
    canAddToCurrentSession: false,
    canRemoveFromCurrentSession: true,
    ...overrides,
  };
}

describe("HostPeoplePage type contract", () => {
  it("keeps member display names out of the editorial 20px h2 scale", () => {
    const editorial = readFileSync(path.resolve("features/host/ui/host-editorial-ledger.css"), "utf8");
    const ledger = readFileSync(path.resolve("features/host/ui/members/member-ledger.css"), "utf8");
    expect(editorial).toMatch(/h2:not\(\.rm-host-member-ledger__display-name\)/);
    expect(ledger).toMatch(/\.rm-host-member-ledger h2\.rm-host-member-ledger__display-name[\s\S]*font-size: 17px/);
  });
});

describe("matchesHostPeopleNameQuery", () => {
  it("matches a trimmed case-insensitive display-name substring", () => {
    expect(matchesHostPeopleNameQuery("김하늘", "")).toBe(true);
    expect(matchesHostPeopleNameQuery("김하늘", "  하늘  ")).toBe(true);
    expect(matchesHostPeopleNameQuery("Park", "par")).toBe(true);
    expect(matchesHostPeopleNameQuery("김하늘", "서윤")).toBe(false);
  });
});

describe("HostPeoplePage name search", () => {
  it("filters the mounted member list and pending rows by display name", async () => {
    const user = userEvent.setup();
    render(
      <HostPeoplePage
        pendingZone={(
          <MemberPendingZone
            viewers={[
              member({
                membershipId: "membership-yoon",
                displayName: "윤서진",
                status: "VIEWER",
                canSuspend: false,
              }),
            ]}
            isRowPending={() => false}
            onActivate={vi.fn()}
            onRelease={vi.fn()}
          />
        )}
      >
        <MemberList
          members={[
            member(),
            member({ membershipId: "membership-park", displayName: "박서윤" }),
          ]}
          emptyText="활성 멤버가 없습니다."
          sectionDescription="멤버 원장"
          renderProfileAction={() => null}
          renderActions={() => null}
        />
      </HostPeoplePage>,
    );

    expect(screen.getByRole("link", { name: "김하늘" })).toBeVisible();
    expect(screen.getByRole("link", { name: "박서윤" })).toBeVisible();
    expect(screen.getByRole("link", { name: "윤서진" })).toBeVisible();

    const search = screen.getByRole("searchbox", { name: "이름으로 찾기" });
    await user.type(search, "하늘");

    expect(screen.getByRole("link", { name: "김하늘" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "박서윤" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "윤서");

    const pending = screen.getByRole("region", { name: "가입 승인 대기" });
    expect(within(pending).getByRole("link", { name: "윤서진" })).toBeVisible();
    expect(screen.getByText("활성 멤버가 없습니다.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "김하늘" })).not.toBeInTheDocument();
  });
});
