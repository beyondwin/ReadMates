import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppRouteSecurityController } from "./app-route-security-controller";
import { requestWorkspaceTransition } from "./app-route-security-transition";

describe("AppRouteSecurityController", () => {
  it("announces a workspace change, updates the title, and moves focus to the route heading", async () => {
    document.title = "기록 · 읽는사이";
    const { rerender } = render(
      <>
        <AppRouteSecurityController workspace="member" />
        <main><h1>기록</h1></main>
      </>,
    );

    expect(screen.queryByRole("status")).toBeNull();

    rerender(
      <>
        <AppRouteSecurityController workspace="host" />
        <main><h1>오늘의 운영</h1></main>
      </>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("호스트 공간으로 전환했습니다");
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    expect(document.title).toContain("호스트 공간");
  });

  it("preserves transition feedback when the route layout remounts", async () => {
    document.title = "오늘 · 읽는사이";
    requestWorkspaceTransition("host");

    render(
      <>
        <AppRouteSecurityController workspace="host" />
        <main><h1>오늘의 운영</h1></main>
      </>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("호스트 공간으로 전환했습니다");
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    expect(document.title).toContain("호스트 공간");
  });
});
