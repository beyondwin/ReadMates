import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SpaceIdentity } from "../model/global-space";
import {
  GlobalSpaceSwitcher,
  type GlobalSpaceSwitcherOption,
} from "./global-space-switcher";

const platform: GlobalSpaceSwitcherOption = {
  identity: { productSpace: "platform" },
};
const readingMember: GlobalSpaceSwitcherOption = {
  identity: {
    productSpace: "clubs",
    clubId: "club-reading",
    clubSlug: "reading-sai",
    perspective: "member",
  },
  clubName: "읽는사이",
};
const readingHost: GlobalSpaceSwitcherOption = {
  identity: {
    productSpace: "clubs",
    clubId: "club-reading",
    clubSlug: "reading-sai",
    perspective: "host",
  },
  clubName: "읽는사이",
};
const longMember: GlobalSpaceSwitcherOption = {
  identity: {
    productSpace: "clubs",
    clubId: "club-long",
    clubSlug: "long-club",
    perspective: "member",
  },
  clubName: "아주 긴 한국어와 an intentionally long English club name",
};

function renderSwitcher({
  currentIdentity = platform.identity,
  options = [platform, readingMember, readingHost, longMember],
  onSelect = vi.fn(async () => ({ status: "selected" as const })),
}: {
  currentIdentity?: SpaceIdentity | null;
  options?: ReadonlyArray<GlobalSpaceSwitcherOption>;
  onSelect?: (identity: SpaceIdentity) => Promise<
    | { status: "selected" | "cancelled" }
    | { status: "blocked" | "unavailable"; message: string }
  >;
} = {}) {
  const rendered = render(
    <>
      <GlobalSpaceSwitcher
        currentIdentity={currentIdentity}
        options={options}
        onSelect={onSelect}
      />
      <button type="button">바깥 작업</button>
      <button type="button">계정 메뉴</button>
    </>,
  );
  return { ...rendered, onSelect };
}

describe("GlobalSpaceSwitcher", () => {
  it.each([
    {
      label: "platform-only",
      current: platform.identity,
      options: [platform],
      currentLabel: "현재 공간 플랫폼 운영",
    },
    {
      label: "member-only",
      current: readingMember.identity,
      options: [readingMember],
      currentLabel: "현재 공간 내 클럽, 읽는사이 멤버로 보기",
    },
    {
      label: "host+member",
      current: readingHost.identity,
      options: [readingMember, readingHost],
      currentLabel: "현재 공간 내 클럽, 읽는사이 호스트로 운영",
    },
  ])("hides the switcher for one authorized product kind: $label", ({ current, options, currentLabel }) => {
    renderSwitcher({ currentIdentity: current, options });

    expect(screen.queryByRole("button", { name: /공간 전환/ })).not.toBeInTheDocument();
    expect(screen.getByText(currentLabel)).toHaveClass("sr-only");
  });

  it.each([
    {
      label: "platform+member",
      current: platform.identity,
      options: [platform, readingMember],
    },
    {
      label: "platform+host+member",
      current: readingHost.identity,
      options: [platform, readingMember, readingHost],
    },
  ])("shows only the two authorized first-level kinds: $label", async ({ current, options }) => {
    const user = userEvent.setup();
    renderSwitcher({ currentIdentity: current, options });

    const trigger = screen.getByRole("button", { name: /공간 전환/ });
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "ReadMates 공간 전환" });

    expect(within(menu).getByText("플랫폼 운영")).toBeInTheDocument();
    expect(within(menu).getByText("내 클럽")).toBeInTheDocument();
    expect(within(menu).queryByText("PLATFORM")).not.toBeInTheDocument();
    expect(within(menu).queryByText("CLUBS")).not.toBeInTheDocument();
  });

  it("groups multiple clubs before member and host perspectives without raw role or status badges", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }));
    const clubGroup = screen.getByRole("group", { name: "내 클럽" });
    const readingGroup = within(clubGroup).getByRole("group", { name: "읽는사이" });
    const longGroup = within(clubGroup).getByRole("group", {
      name: "아주 긴 한국어와 an intentionally long English club name",
    });

    expect(within(readingGroup).getByRole("menuitemradio", { name: "읽는사이 멤버로 보기" })).toBeInTheDocument();
    expect(within(readingGroup).getByRole("menuitemradio", { name: "읽는사이 호스트로 운영" })).toBeInTheDocument();
    expect(within(longGroup).getByRole("menuitemradio", {
      name: "아주 긴 한국어와 an intentionally long English club name 멤버로 보기",
    })).toBeInTheDocument();
    expect(screen.queryByText(/HOST|MEMBER|ACTIVE|SUSPENDED/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("menu", { name: "ReadMates 공간 전환" })).queryByText("계정 메뉴")).not.toBeInTheDocument();
  });

  it("selects an app-owned identity callback and exposes a disabled loading state", async () => {
    const pending = Promise.withResolvers<{ status: "selected" }>();
    const onSelect = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    renderSwitcher({ onSelect });

    await user.click(screen.getByRole("button", { name: /공간 전환/ }));
    const target = screen.getByRole("menuitemradio", { name: "읽는사이 호스트로 운영" });
    await user.click(target);

    expect(onSelect).toHaveBeenCalledWith(readingHost.identity);
    expect(target).toBeDisabled();
    expect(screen.getByText("공간을 여는 중")).toHaveAttribute("role", "status");

    pending.resolve({ status: "selected" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("keeps the menu open and names a blocked transition recovery", async () => {
    const onSelect = vi.fn(async () => ({
      status: "blocked" as const,
      message: "진행 중인 작업을 마친 뒤 공간을 전환해 주세요.",
    }));
    const user = userEvent.setup();
    renderSwitcher({ onSelect });

    await user.click(screen.getByRole("button", { name: /공간 전환/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "읽는사이 멤버로 보기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("진행 중인 작업을 마친 뒤 공간을 전환해 주세요.");
    expect(screen.getByRole("menu", { name: "ReadMates 공간 전환" })).toBeInTheDocument();
  });

  it("opens with Enter, Space, and ArrowDown and uses roving arrow, Home, and End focus", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" });

    trigger.focus();
    await user.keyboard("{Enter}");
    const platformItem = screen.getByRole("menuitemradio", { name: "플랫폼 운영" });
    const memberItem = screen.getByRole("menuitemradio", { name: "읽는사이 멤버로 보기" });
    const lastItem = screen.getByRole("menuitemradio", {
      name: "아주 긴 한국어와 an intentionally long English club name 멤버로 보기",
    });
    expect(platformItem).toHaveFocus();
    expect(platformItem).toHaveAttribute("tabindex", "0");
    expect(memberItem).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowDown}");
    expect(memberItem).toHaveFocus();
    await user.keyboard("{End}");
    expect(lastItem).toHaveFocus();
    await user.keyboard("{Home}");
    expect(platformItem).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(lastItem).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await user.keyboard("{ }");
    expect(screen.getByRole("menuitemradio", { name: "플랫폼 운영" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "플랫폼 운영" })).toHaveFocus();
  });

  it("closes on Escape or outside click, removes hidden items, and returns focus", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: /공간 전환/ });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "바깥 작업" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });

  it("keeps the trigger and every destination at least 44px tall", async () => {
    const user = userEvent.setup();
    const { container } = renderSwitcher();
    await user.click(screen.getByRole("button", { name: /공간 전환/ }));

    expect(container.querySelector(".rm-global-space-switcher__trigger")).toHaveStyle({ minHeight: "44px" });
    for (const item of screen.getAllByRole("menuitemradio")) {
      expect(item).toHaveStyle({ minHeight: "44px" });
    }
  });

  it("does not run a transition when the current destination is chosen", async () => {
    const onSelect = vi.fn(async () => ({ status: "selected" as const }));
    renderSwitcher({ onSelect });

    fireEvent.click(screen.getByRole("button", { name: /공간 전환/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "플랫폼 운영" }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
