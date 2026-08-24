import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import {
  AdminClubDetailRouteError,
  AdminClubsRouteError,
} from "./admin-club-route-error";

describe("admin club route boundaries", () => {
  it("keeps a missing club inside admin navigation recovery", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/admin/clubs/:clubId",
          loader: () => {
            throw new Response("missing", { status: 404 });
          },
          element: <div>detail</div>,
          ErrorBoundary: AdminClubDetailRouteError,
        },
      ],
      { initialEntries: ["/admin/clubs/missing"] },
    );
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByText("클럽을 찾을 수 없습니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /클럽 목록/ })).toHaveAttribute(
      "href",
      "/admin/clubs",
    );
    expect(
      screen.queryByRole("link", { name: "로그인" }),
    ).not.toBeInTheDocument();
  });

  it("keeps an initial registry failure on a local retry surface", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/admin/clubs",
          loader: () => {
            throw new Error("network unavailable");
          },
          element: <div>registry</div>,
          ErrorBoundary: AdminClubsRouteError,
        },
      ],
      { initialEntries: ["/admin/clubs"] },
    );
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByText("클럽 목록을 불러오지 못했습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "다시 시도" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "로그인" }),
    ).not.toBeInTheDocument();
  });
});
