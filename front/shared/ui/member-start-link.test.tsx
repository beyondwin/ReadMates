import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberStartLink } from "./member-start-link";

describe("MemberStartLink", () => {
  it("POSTs an exact same-origin JSON intent before navigating to OAuth", async () => {
    const navigate = vi.fn();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ intent: "issued-nonce-00000000000000000000", expiresAt: "2026-08-02T01:00:00Z" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    render(
      <MemberStartLink
        className="btn"
        returnTo="/clubs/reading-sai/app"
        clubSlug="reading-sai"
        fetcher={fetcher}
        navigate={navigate}
      >
        멤버로 시작
      </MemberStartLink>,
    );

    const link = screen.getByRole("link", { name: "멤버로 시작" });
    expect(link).toHaveAttribute("href", "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp");
    fireEvent.click(link);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(
      "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&joinClub=reading-sai&joinIntent=issued-nonce-00000000000000000000",
    ));
    expect(fetcher).toHaveBeenCalledWith("/api/bff/api/auth/oauth/join-intent", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ clubSlug: "reading-sai", returnTo: "/clubs/reading-sai/app" }),
    }));
  });

  it("does not navigate when intent issuance fails and remains retryable", async () => {
    const navigate = vi.fn();
    const fetcher = vi.fn(async () => new Response("{}", { status: 403 }));
    render(<MemberStartLink returnTo="/clubs/reading-sai/app" clubSlug="reading-sai" fetcher={fetcher} navigate={navigate}>멤버로 시작</MemberStartLink>);

    fireEvent.click(screen.getByRole("link", { name: "멤버로 시작" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("멤버 시작 요청을 만들지 못했습니다");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute("aria-disabled", "false");
  });
});
