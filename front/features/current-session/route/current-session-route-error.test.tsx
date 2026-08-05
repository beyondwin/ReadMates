import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it } from "vitest";
import { CurrentSessionRouteError as ProtectedRouteError } from "./current-session-route";
import { CurrentSessionRouteError } from "./current-session-route-error";

describe("CurrentSessionRouteError", () => {
  it("keeps the protected-route error boundary identity while remaining independently importable", async () => {
    expect(CurrentSessionRouteError).toBe(ProtectedRouteError);

    const router = createMemoryRouter(
      [
        {
          path: "/app/session/current",
          loader: () => {
            throw new Response("Unavailable", { status: 500 });
          },
          element: <main>현재 모임</main>,
          errorElement: <CurrentSessionRouteError />,
        },
      ],
      { initialEntries: ["/app/session/current"] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByText("요청을 마치지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "내 클럽으로" })).toHaveAttribute("href", "/app");
  });
});
