import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteAcceptanceRouteContent } from "@/features/auth/route/invite-route";

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

describe("InviteAcceptanceRouteContent", () => {
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

    render(<InviteAcceptanceRouteContent token="raw-token" />);

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("읽는사이")).toBeInTheDocument();
    expect(screen.getByText("새멤버")).toBeInTheDocument();
    expect(screen.getByText("me****@example.com")).toBeInTheDocument();
    expect(screen.getByText("정식 멤버 초대 대기")).toBeInTheDocument();
    expect(screen.getByText("로그인 계정은 초대 이메일과 일치해야 합니다.")).toBeInTheDocument();
    expect(screen.getByText("만료 2026.05.20")).toBeInTheDocument();
    expect(screen.getByText("초대 대상 Gmail 계정과 이름을 확인한 뒤 같은 Google 계정으로 수락해 주세요.")).toBeInTheDocument();
    expect(
      screen.getByText("Google 인증이 끝나면 정식 멤버로 연결되고 현재 세션, RSVP, 질문과 서평 작성 권한이 열립니다."),
    ).toBeInTheDocument();
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

    render(<InviteAcceptanceRouteContent token="raw-token" />);

    expect(await screen.findByText("초대가 만료되었습니다.")).toBeInTheDocument();
    expect(screen.getByText("만료되어 수락 불가")).toBeInTheDocument();
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

    render(<InviteAcceptanceRouteContent token="accepted-token" />);

    expect(await screen.findByText("이미 사용된 초대입니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute("href", "/login");
  });

  it("clears previous invitation details while a new token is loading", async () => {
    let resolveSecondPreview: (response: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          clubName: "읽는사이",
          email: "old-member@example.com",
          name: "이전멤버",
          emailHint: "ol****@example.com",
          status: "PENDING",
          expiresAt: "2026-05-20T12:00:00Z",
          canAccept: true,
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondPreview = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<InviteAcceptanceRouteContent token="old-token" />);

    expect(await screen.findByText("old-member@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google?inviteToken=old-token",
    );

    rerender(<InviteAcceptanceRouteContent token="new-token" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("old-member@example.com")).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Google로 초대 수락" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "초대장을 확인하는 중입니다." })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("초대를 확인하는 중입니다.");

    resolveSecondPreview(
      jsonResponse({
        clubName: "읽는사이",
        email: "new-member@example.com",
        name: "새멤버",
        emailHint: "ne****@example.com",
        status: "PENDING",
        expiresAt: "2026-05-21T12:00:00Z",
        canAccept: true,
      }),
    );

    expect(await screen.findByText("new-member@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google?inviteToken=new-token",
    );
  });
});
