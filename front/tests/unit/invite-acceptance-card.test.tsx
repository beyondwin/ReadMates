import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InviteAcceptanceCard from "@/features/auth/components/invite-acceptance-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("InviteAcceptanceCard", () => {
  it("shows pending invitation details after the legacy password endpoint is gone", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        clubName: "읽는사이",
        email: "member@example.com",
        name: "새멤버",
        emailHint: "me****@example.com",
        status: "PENDING",
        expiresAt: "2026-05-20T12:00:00Z",
        canAccept: true,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<InviteAcceptanceCard token="raw-token" />);

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("새멤버")).toBeInTheDocument();
    expect(screen.getByText("만료 2026.05.20")).toBeInTheDocument();
    expect(screen.getByText("초대 대상 Gmail 계정과 이름을 확인한 뒤 Google 로그인으로 수락해 주세요.")).toBeInTheDocument();
    expect(screen.getByText("Google로 초대 수락하면 바로 정식 멤버가 됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google?inviteToken=raw-token",
    );
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호 확인")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 수락" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders expired invitation state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            clubName: "읽는사이",
            email: "expired@example.com",
            name: "만료 멤버",
            emailHint: "ex****@example.com",
            status: "EXPIRED",
            expiresAt: "2026-04-01T12:00:00Z",
            canAccept: false,
          }),
        ),
    );

    render(<InviteAcceptanceCard token="raw-token" />);

    expect(await screen.findByText("초대가 만료되었습니다.")).toBeInTheDocument();
    expect(screen.getByText("만료 2026.04.01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 수락" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Google로 초대 수락" })).not.toBeInTheDocument();
  });

  it("shows a login action for an accepted invitation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            clubName: "읽는사이",
            email: "accepted@example.com",
            name: "수락 멤버",
            emailHint: "ac****@example.com",
            status: "ACCEPTED",
            expiresAt: "2026-05-20T12:00:00Z",
            canAccept: false,
          }),
        ),
    );

    render(<InviteAcceptanceCard token="accepted-token" />);

    expect(await screen.findByText("이미 사용된 초대입니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute("href", "/login");
  });
});
