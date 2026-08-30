import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AppClubShell } from "./app-club-shell";
import { GlobalSpaceSwitcher } from "./global-space-switcher";
import type {
  ClubWorkspace,
  PrimaryNavigationItem,
} from "../model/app-club-shell";

const LinkComponent = ({ to, children, ...props }: {
  to: string;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
  "aria-current"?: "page" | "true";
}) => (
  <a href={to} {...props}>
    {children}
  </a>
);

function primaryItems(workspace: ClubWorkspace): PrimaryNavigationItem[] {
  const labels = workspace === "member"
    ? ["오늘", "노트", "기록", "내 공간"]
    : ["오늘", "모임", "멤버"];

  return labels.map((label, index) => ({
    id: `${workspace}-${index}`,
    label,
    href: `/clubs/reading-sai/app${workspace === "host" ? "/host" : ""}/${index}`,
    icon: index === 0 ? "home" : "archive",
    current: index === 0,
  }));
}

function renderShell(workspace: ClubWorkspace) {
  return render(
    <AppClubShell
      workspace={workspace}
      primaryItems={primaryItems(workspace)}
      account={{ control: <button type="button">계정 메뉴</button> }}
      brandHref={workspace === "host" ? "/clubs/reading-sai/app/host" : "/clubs/reading-sai/app"}
      mobileTitle={workspace === "host" ? "오늘" : "읽는사이"}
      LinkComponent={LinkComponent}
      spaceSwitcher={{
        desktop: <button type="button">데스크톱 공간 전환</button>,
        mobile: <button type="button">모바일 공간 전환</button>,
      }}
    >
      <main><h1>{workspace} content</h1></main>
    </AppClubShell>,
  );
}

describe("AppClubShell", () => {
  it("keeps the shared shell presentation boundary free of app, feature, and router imports", () => {
    for (const path of [
      "shared/model/app-club-shell.ts",
      "shared/ui/app-club-shell.tsx",
      "shared/ui/global-space-switcher.tsx",
      "shared/ui/workspace-selector.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/from ["'](?:@\/src\/app|@\/features|react-router)/);
    }
  });

  it.each(["member", "host"] as const)(
    "uses the same global shell regions for the %s workspace",
    (workspace) => {
      const { container } = renderShell(workspace);

      expect(
        [...container.querySelectorAll("[data-club-shell-region]")].map((region) =>
          region.getAttribute("data-club-shell-region"),
        ),
      ).toEqual([
        "desktop-spine",
        "mobile-spine",
        "mobile-context",
        "content",
        "mobile-primary",
      ]);
      expect(container.querySelector(".rm-app-club-shell")).toHaveAttribute("data-workspace", workspace);
      expect(screen.getAllByRole("button", { name: "계정 메뉴" })).toHaveLength(2);
    },
  );

  it("renders one app-owned global space control in each responsive shell and keeps account separate", () => {
    renderShell("host");

    expect(screen.getByRole("button", { name: "데스크톱 공간 전환" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모바일 공간 전환" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "계정 메뉴" })).toHaveLength(2);
    expect(screen.queryByRole("navigation", { name: "클럽 선택" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "공간 선택" })).not.toBeInTheDocument();
  });

  it("renders only the app-provided primary destinations", () => {
    renderShell("member");

    const desktopPrimary = screen.getByRole("navigation", { name: "멤버 주 메뉴" });
    const mobilePrimary = screen.getByRole("navigation", { name: "멤버 주 메뉴 모바일" });
    expect(within(desktopPrimary).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "오늘",
      "노트",
      "기록",
      "내 공간",
    ]);
    expect(within(mobilePrimary).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "오늘",
      "노트",
      "기록",
      "내 공간",
    ]);
    expect(screen.queryByRole("navigation", { name: "플랫폼 운영" })).not.toBeInTheDocument();
  });

  it("uses the desktop control as the mobile fallback when no mobile variant is supplied", () => {
    render(
      <AppClubShell
        workspace="host"
        primaryItems={primaryItems("host")}
        account={{ control: <button type="button">계정 메뉴</button> }}
        brandHref="/clubs/reading-sai/app/host"
        mobileTitle="운영실"
        LinkComponent={LinkComponent}
        spaceSwitcher={{
          desktop: <button type="button">공통 공간 전환</button>,
        }}
      >
        <main><h1>host content</h1></main>
      </AppClubShell>,
    );

    expect(screen.getAllByRole("button", { name: "공통 공간 전환" })).toHaveLength(2);
  });

  it("hides a static one-kind label accessibly without reserving an empty mobile context strip", () => {
    const platform = { productSpace: "platform" as const };
    const staticSwitcher = (
      <GlobalSpaceSwitcher
        currentIdentity={platform}
        options={[{ identity: platform }]}
        onSelect={async () => ({ status: "selected" })}
      />
    );
    const { container } = render(
      <AppClubShell
        workspace="member"
        primaryItems={primaryItems("member")}
        account={{ control: <button type="button">계정 메뉴</button> }}
        brandHref="/clubs/reading-sai/app"
        mobileTitle="읽는사이"
        LinkComponent={LinkComponent}
        spaceSwitcher={{ desktop: staticSwitcher, mobile: staticSwitcher }}
      >
        <main>member content</main>
      </AppClubShell>,
    );

    const mobileContext = container.querySelector('[data-club-shell-region="mobile-context"]');
    expect(mobileContext?.querySelector(":scope > .rm-club-shell-mobile-context__inner > .rm-sr-only:only-child"))
      .toHaveTextContent("현재 공간 플랫폼 운영");
    const mobileCss = readFileSync("shared/styles/mobile.css", "utf8");
    expect(mobileCss).toMatch(
      /\.rm-club-shell-mobile-context:has\(> \.rm-club-shell-mobile-context__inner > \.rm-sr-only:only-child\)[^{]*\{[^}]*display:\s*none/,
    );
  });
});
