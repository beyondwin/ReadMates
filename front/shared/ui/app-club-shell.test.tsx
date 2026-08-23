import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AppClubShell } from "./app-club-shell";
import type { ClubWorkspace, PrimaryNavigationItem } from "../model/app-club-shell";

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

const clubs = [
  { slug: "reading-sai", name: "읽는사이", href: "/clubs/reading-sai/app" },
  { slug: "long-club", name: "아주 긴 한국어와 English club name", href: "/clubs/long-club/app" },
];

const workspaceItems = [
  { id: "member" as const, label: "멤버 공간", href: "/clubs/reading-sai/app" },
  { id: "host" as const, label: "호스트 공간", href: "/clubs/reading-sai/app/host" },
];

function primaryItems(workspace: ClubWorkspace): PrimaryNavigationItem[] {
  const labels = workspace === "member"
    ? ["오늘", "노트", "기록", "내 공간"]
    : ["오늘", "모임", "멤버", "기록"];

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
      clubs={clubs}
      currentClubSlug="reading-sai"
      workspace={workspace}
      workspaceItems={workspaceItems}
      primaryItems={primaryItems(workspace)}
      account={{ control: <button type="button">계정 메뉴</button> }}
      brandHref={workspace === "host" ? "/clubs/reading-sai/app/host" : "/clubs/reading-sai/app"}
      mobileTitle={workspace === "host" ? "오늘" : "읽는사이"}
      LinkComponent={LinkComponent}
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

  it("keeps club and workspace selection separate and names their current values", () => {
    renderShell("host");

    const clubNavigations = screen.getAllByRole("navigation", { name: "클럽 선택" });
    const workspaceNavigations = screen.getAllByRole("navigation", { name: "공간 선택" });
    expect(clubNavigations).toHaveLength(2);
    expect(workspaceNavigations).toHaveLength(2);
    for (const navigation of clubNavigations) {
      expect(within(navigation).getByRole("link", { name: "읽는사이" })).toHaveAttribute(
        "aria-current",
        "true",
      );
    }
    for (const navigation of workspaceNavigations) {
      expect(within(navigation).getByRole("link", { name: "호스트 공간" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
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
});
