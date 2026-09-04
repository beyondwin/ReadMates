import { readFileSync } from "node:fs";
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
    expect(screen.getByText(currentLabel)).toHaveClass("rm-sr-only");
  });

  it.each([
    {
      label: "platform+member",
      current: platform.identity,
      options: [platform, readingMember],
      currentKind: "platform",
    },
    {
      label: "platform+host+member",
      current: readingHost.identity,
      options: [platform, readingMember, readingHost],
      currentKind: "clubs",
    },
  ])("shows truthful current semantics for the two authorized first-level kinds: $label", async ({
    current,
    options,
    currentKind,
  }) => {
    const user = userEvent.setup();
    renderSwitcher({ currentIdentity: current, options });

    const trigger = screen.getByRole("button", { name: /공간 전환/ });
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "ReadMates 공간 전환" });
    const platformItem = within(menu).getByRole("menuitemradio", { name: "플랫폼 운영" });
    const clubsItem = within(menu).getByRole("menuitem", { name: "내 클럽" });

    expect(within(menu).getByText("현재 범위", { selector: ".rm-global-space-switcher__section-label" }))
      .toBeInTheDocument();
    expect(within(menu).getByText("이동할 범위", { selector: ".rm-global-space-switcher__section-label" }))
      .toBeInTheDocument();
    expect(within(menu).queryByText("범위 선택", { selector: ".rm-global-space-switcher__section-label" }))
      .not.toBeInTheDocument();
    expect(platformItem).toHaveAttribute("aria-checked", String(currentKind === "platform"));
    if (currentKind === "clubs") {
      expect(clubsItem).toHaveAttribute("aria-current", "true");
      expect(within(clubsItem).getByText("현재 범위")).toBeInTheDocument();
      expect(within(platformItem).queryByText("현재 범위")).not.toBeInTheDocument();
    } else {
      expect(clubsItem).not.toHaveAttribute("aria-current");
      expect(within(platformItem).getByText("현재 범위")).toBeInTheDocument();
      expect(within(clubsItem).queryByText("현재 범위")).not.toBeInTheDocument();
    }
    expect(within(menu).queryByRole("group", { name: "읽는사이" })).not.toBeInTheDocument();
    expect(within(menu).queryByText("PLATFORM")).not.toBeInTheDocument();
    expect(within(menu).queryByText("CLUBS")).not.toBeInTheDocument();
  });

  it("groups multiple clubs before member and host perspectives without raw role or status badges", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }));
    await user.click(screen.getByRole("menuitem", { name: "내 클럽" }));
    expect(screen.queryByRole("menuitemradio", { name: "플랫폼 운영" })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("menuitem", { name: "내 클럽" }));
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
    await user.click(screen.getByRole("menuitem", { name: "내 클럽" }));
    await user.click(screen.getByRole("menuitemradio", { name: "읽는사이 멤버로 보기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("진행 중인 작업을 마친 뒤 공간을 전환해 주세요.");
    expect(screen.getByRole("menu", { name: "ReadMates 공간 전환" })).toBeInTheDocument();
  });

  it("moves from an already-open trigger to 내 클럽 with Enter then ArrowDown", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" });

    await user.click(trigger);
    trigger.focus();
    await user.keyboard("{Enter}{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "내 클럽" })).toHaveFocus();
  });

  it("uses separate first- and second-level roving focus and Escape returns one level before closing", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" });

    trigger.focus();
    await user.keyboard("{Enter}");
    const platformItem = screen.getByRole("menuitemradio", { name: "플랫폼 운영" });
    const clubsItem = screen.getByRole("menuitem", { name: "내 클럽" });
    expect(screen.queryByRole("menuitemradio", { name: "읽는사이 멤버로 보기" })).not.toBeInTheDocument();
    expect(platformItem).toHaveFocus();
    expect(platformItem).toHaveAttribute("tabindex", "0");
    expect(clubsItem).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowDown}");
    expect(clubsItem).toHaveFocus();
    await user.keyboard("{Enter}");
    const memberItem = screen.getByRole("menuitemradio", { name: "읽는사이 멤버로 보기" });
    const lastItem = screen.getByRole("menuitemradio", {
      name: "아주 긴 한국어와 an intentionally long English club name 멤버로 보기",
    });
    expect(memberItem).toHaveFocus();
    expect(screen.queryByRole("menuitemradio", { name: "플랫폼 운영" })).not.toBeInTheDocument();
    await user.keyboard("{End}");
    expect(lastItem).toHaveFocus();
    await user.keyboard("{Home}");
    expect(memberItem).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(lastItem).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("menuitem", { name: "내 클럽" })).toHaveFocus();
    expect(screen.queryByRole("menuitemradio", { name: "읽는사이 멤버로 보기" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await user.keyboard("{ }");
    expect(screen.getByRole("menuitemradio", { name: "플랫폼 운영" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "플랫폼 운영" })).toHaveFocus();
  });

  it("returns from the club level with a 44px Korean Back action and restores first-level focus", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: /공간 전환/ }));
    await user.click(screen.getByRole("menuitem", { name: "내 클럽" }));
    const back = screen.getByRole("button", { name: "범위 선택으로 돌아가기" });
    expect(back).toHaveStyle({ minHeight: "44px" });
    expect(screen.getByRole("heading", { name: "내 클럽" })).toBeInTheDocument();

    await user.click(back);

    expect(screen.getByRole("menuitem", { name: "내 클럽" })).toHaveFocus();
    expect(screen.queryByRole("heading", { name: "내 클럽" })).not.toBeInTheDocument();
  });

  it("returns from the club level with ArrowLeft and focuses the 내 클럽 parent", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: /공간 전환/ }));
    await user.click(screen.getByRole("menuitem", { name: "내 클럽" }));
    expect(screen.getByRole("menuitemradio", { name: "읽는사이 멤버로 보기" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}");

    expect(screen.getByRole("menuitem", { name: "내 클럽" })).toHaveFocus();
    expect(screen.getByRole("menuitemradio", { name: "플랫폼 운영" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "읽는사이 멤버로 보기" })).not.toBeInTheDocument();
  });

  it("re-enters an already-open root menu at 플랫폼 운영 so Escape can close from that item", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "내 클럽" }));
    await user.click(screen.getByRole("button", { name: "범위 선택으로 돌아가기" }));
    expect(screen.getByRole("menuitem", { name: "내 클럽" })).toHaveFocus();

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitemradio", { name: "플랫폼 운영" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape from a focused menu item, not only from the trigger", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" });

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitemradio", { name: "플랫폼 운영" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
    for (const item of [...screen.getAllByRole("menuitemradio"), screen.getByRole("menuitem", { name: "내 클럽" })]) {
      expect(item).toHaveStyle({ minHeight: "44px" });
    }
  });

  it("removes trigger and chevron transitions when reduced motion is requested", () => {
    const css = readFileSync("src/styles/globals.css", "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.rm-global-space-switcher__trigger,[\s\S]*?\.rm-global-space-switcher__trigger \.rm-context-selector__chevron[\s\S]*?transition:\s*none/,
    );
  });

  it("does not run a transition when the current destination is chosen", async () => {
    const onSelect = vi.fn(async () => ({ status: "selected" as const }));
    renderSwitcher({ onSelect });

    fireEvent.click(screen.getByRole("button", { name: /공간 전환/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "플랫폼 운영" }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps 샘플 독서모임 in the club subflow and restores the root trigger", async () => {
    const sampleMember: GlobalSpaceSwitcherOption = {
      identity: {
        productSpace: "clubs",
        clubId: "club-sample-reading",
        clubSlug: "sample-reading",
        perspective: "member",
      },
      clubName: "샘플 독서모임",
    };
    const sampleHost: GlobalSpaceSwitcherOption = {
      identity: { ...sampleMember.identity, perspective: "host" },
      clubName: "샘플 독서모임",
    };
    const user = userEvent.setup();
    renderSwitcher({ options: [platform, sampleMember, sampleHost] });
    const trigger = screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" });

    await user.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: /플랫폼 운영/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitem", { name: "내 클럽" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /샘플 독서모임/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "내 클럽" }));
    expect(screen.getByRole("group", { name: "샘플 독서모임" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "샘플 독서모임 멤버로 보기" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "샘플 독서모임 호스트로 운영" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("menuitem", { name: "내 클럽" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
});
