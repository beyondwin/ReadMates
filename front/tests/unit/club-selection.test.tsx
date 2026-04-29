import { render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { recommendedClubEntryUrl } from "@/features/club-selection/model/club-entry";
import { ClubSelectionPage } from "@/features/club-selection/ui/club-selection-page";

const singleClubAuth = {
  authenticated: true,
  joinedClubs: [
    {
      clubId: "club-1",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      membershipId: "membership-1",
      role: "HOST",
      status: "ACTIVE",
      primaryHost: "reading-sai.example.test",
    },
  ],
};

const multiClubAuth = {
  authenticated: true,
  joinedClubs: [
    {
      clubId: "club-1",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      membershipId: "membership-1",
      role: "HOST",
      status: "ACTIVE",
      primaryHost: "reading-sai.example.test",
    },
    {
      clubId: "club-2",
      clubSlug: "sample-book-club",
      clubName: "샘플 북클럽",
      membershipId: "membership-2",
      role: "MEMBER",
      status: "VIEWER",
      primaryHost: null,
    },
  ],
};

describe("club selection entry", () => {
  it("redirects to the only joined club", () => {
    expect(recommendedClubEntryUrl(singleClubAuth)).toBe("/clubs/reading-sai/app");
  });

  it("honors the server-recommended app entry URL before local fallback", () => {
    expect(
      recommendedClubEntryUrl({
        authenticated: true,
        recommendedAppEntryUrl: "/clubs/server-choice/app",
      }),
    ).toBe("/clubs/server-choice/app");
  });

  it("ignores unsafe server-recommended app entry URLs", () => {
    expect(
      recommendedClubEntryUrl({
        authenticated: true,
        recommendedAppEntryUrl: "https://example.test/clubs/server-choice/app",
        joinedClubs: [{ clubSlug: "local-choice", status: "ACTIVE" }],
      }),
    ).toBe("/clubs/local-choice/app");
  });

  it("redirects anonymous users to login", () => {
    expect(recommendedClubEntryUrl({ authenticated: false })).toBe("/login");
  });

  it("shows selector when multiple usable clubs exist", () => {
    expect(recommendedClubEntryUrl(multiClubAuth)).toBeNull();
  });

  it("ignores non-usable memberships when choosing the entry club", () => {
    expect(
      recommendedClubEntryUrl({
        authenticated: true,
        joinedClubs: [
          { clubSlug: "invited-club", status: "INVITED" },
          { clubSlug: "left-club", status: "LEFT" },
          { clubSlug: "active-club", status: "ACTIVE" },
        ],
      }),
    ).toBe("/clubs/active-club/app");
  });

  it("renders joined clubs as scoped app links with role and status badges", () => {
    render(
      <MemoryRouter>
        <ClubSelectionPage auth={multiClubAuth} linkComponent={Link} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "클럽을 선택하세요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /읽는사이/ })).toHaveAttribute("href", "/clubs/reading-sai/app");
    expect(screen.getByRole("link", { name: /샘플 북클럽/ })).toHaveAttribute("href", "/clubs/sample-book-club/app");
    expect(screen.getByText("HOST")).toBeInTheDocument();
    expect(screen.getByText("VIEWER")).toBeInTheDocument();
  });
});
