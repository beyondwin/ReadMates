import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMemoryRouter, Link as RouterLink, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppClubShell } from "./app-club-shell";
import type {
  ClubShellLinkComponent,
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

const clubs = [
  { slug: "reading-sai", name: "읽는사이", href: "/clubs/reading-sai/app" },
  { slug: "long-club", name: "아주 긴 한국어와 English club name", href: "/clubs/long-club/app" },
];

const workspaceItems = [
  { id: "member" as const, label: "멤버 공간", href: "/clubs/reading-sai/app" },
  { id: "host" as const, label: "호스트 공간", href: "/clubs/reading-sai/app/host" },
];

const RouterShellLink: ClubShellLinkComponent = ({ to, children, ...props }) => (
  <RouterLink to={to} {...props}>{children}</RouterLink>
);

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="route location">{JSON.stringify(location)}</output>;
}

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
      expect(within(navigation).queryByRole("link", { name: "읽는사이" })).not.toBeInTheDocument();
      expect(within(navigation).getByText("읽는사이")).toHaveAttribute("aria-current", "true");
      expect(within(navigation).getByRole("link", { name: "아주 긴 한국어와 English club name" })).toHaveAttribute(
        "href",
        "/clubs/long-club/app",
      );
    }
    for (const navigation of workspaceNavigations) {
      expect(within(navigation).queryByRole("link", { name: "호스트 공간" })).not.toBeInTheDocument();
      expect(within(navigation).getByText("호스트 공간")).toHaveAttribute("aria-current", "page");
      expect(within(navigation).getByRole("link", { name: "멤버 공간" })).toHaveAttribute(
        "href",
        "/clubs/reading-sai/app",
      );
    }
  });

  it("keeps the full record location and history when current selector items are activated", async () => {
    const user = userEvent.setup();
    const recordState = {
      readmatesReturnTo: "/clubs/reading-sai/app/host/records?filter=closed#session-7",
      readmatesReturnLabel: "기록으로",
      recordOwnership: "host-records",
    };
    const currentEntry = {
      pathname: "/clubs/reading-sai/app/host/sessions/session-7",
      search: "?section=records",
      hash: "#draft",
      state: recordState,
    };
    const router = createMemoryRouter(
      [{
        path: "*",
        element: (
          <AppClubShell
            clubs={clubs}
            currentClubSlug="reading-sai"
            workspace="host"
            workspaceItems={workspaceItems}
            primaryItems={primaryItems("host")}
            account={{ control: <button type="button">계정 메뉴</button> }}
            brandHref="/clubs/reading-sai/app/host"
            mobileTitle="기록"
            LinkComponent={RouterShellLink}
          >
            <main><h1>기록 상세</h1><LocationProbe /></main>
          </AppClubShell>
        ),
      }],
      {
        initialEntries: [
          "/clubs/reading-sai/app/host/records?filter=closed#session-7",
          currentEntry,
        ],
        initialIndex: 1,
      },
    );

    render(<RouterProvider router={router} />);

    const desktopClubNavigation = screen.getAllByRole("navigation", { name: "클럽 선택" })[0]!;
    const desktopWorkspaceNavigation = screen.getAllByRole("navigation", { name: "공간 선택" })[0]!;
    await user.click(within(desktopClubNavigation).getByText("읽는사이"));
    await user.click(within(desktopWorkspaceNavigation).getByText("호스트 공간"));

    expect(router.state.location).toMatchObject(currentEntry);
    expect(router.state.location.state).toEqual(recordState);

    await act(async () => router.navigate(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host/records"));
    expect(`${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`).toBe(
      "/clubs/reading-sai/app/host/records?filter=closed#session-7",
    );
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
