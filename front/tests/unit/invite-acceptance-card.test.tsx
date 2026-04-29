import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteAcceptanceRouteContent } from "@/features/auth/route/invite-route";
import { googleInviteHref } from "@/features/auth/model/invite-oauth";

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

const pendingPreview = {
  clubName: "읽는사이",
  clubSlug: "reading-sai",
  canonicalPath: "/clubs/reading-sai/invite/raw-token",
  email: "member@example.com",
  name: "새멤버",
  emailHint: "me****@example.com",
  status: "PENDING" as const,
  expiresAt: "2026-05-20T12:00:00Z",
  canAccept: true,
};

describe("InviteAcceptanceRouteContent", () => {
  it("shows pending invitation details after the legacy password endpoint is gone", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        clubName: "읽는사이",
        clubSlug: "reading-sai",
        canonicalPath: "/clubs/reading-sai/invite/raw-token",
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
      `/oauth2/authorization/google?inviteToken=raw-token&returnTo=${encodeURIComponent("/clubs/reading-sai/invite/raw-token")}`,
    );
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호 확인")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 수락" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads invitation previews from the token prop", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        clubName: "읽는사이",
        clubSlug: "reading-sai",
        canonicalPath: "/clubs/reading-sai/invite/raw-token",
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
    expect(screen.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
      "href",
      `/oauth2/authorization/google?inviteToken=raw-token&returnTo=${encodeURIComponent("/clubs/reading-sai/invite/raw-token")}`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads club-scoped invitation previews from the route slug", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        clubName: "읽는사이",
        clubSlug: "reading-sai",
        canonicalPath: "/clubs/reading-sai/invite/raw-token",
        email: "member@example.com",
        name: "새멤버",
        emailHint: "me****@example.com",
        status: "PENDING",
        expiresAt: "2026-05-20T12:00:00Z",
        canAccept: true,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<InviteAcceptanceRouteContent clubSlug="reading-sai" token="raw-token" />);

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/clubs/reading-sai/invitations/raw-token");
    expect(screen.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
      "href",
      `/oauth2/authorization/google?inviteToken=raw-token&returnTo=${encodeURIComponent("/clubs/reading-sai/invite/raw-token")}`,
    );
  });

  it("renders expired invitation state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            clubName: "읽는사이",
            clubSlug: "reading-sai",
            canonicalPath: "/clubs/reading-sai/invite/expired-token",
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
            clubSlug: "reading-sai",
            canonicalPath: "/clubs/reading-sai/invite/accepted-token",
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
          clubSlug: "reading-sai",
          canonicalPath: "/clubs/reading-sai/invite/old-token",
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
      `/oauth2/authorization/google?inviteToken=old-token&returnTo=${encodeURIComponent("/clubs/reading-sai/invite/old-token")}`,
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
        clubSlug: "reading-sai",
        canonicalPath: "/clubs/reading-sai/invite/new-token",
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
      `/oauth2/authorization/google?inviteToken=new-token&returnTo=${encodeURIComponent("/clubs/reading-sai/invite/new-token")}`,
    );
  });

  it("clears previous invitation details when the route slug changes for the same token", async () => {
    let resolveSecondPreview: (response: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          clubName: "읽는사이",
          clubSlug: "reading-sai",
          canonicalPath: "/clubs/reading-sai/invite/shared-token",
          email: "reading-member@example.com",
          name: "읽는 멤버",
          emailHint: "re****@example.com",
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

    const { rerender } = render(<InviteAcceptanceRouteContent clubSlug="reading-sai" token="shared-token" />);

    expect(await screen.findByText("reading-member@example.com")).toBeInTheDocument();

    rerender(<InviteAcceptanceRouteContent clubSlug="sample-book-club" token="shared-token" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("reading-member@example.com")).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Google로 초대 수락" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "초대장을 확인하는 중입니다." })).toBeInTheDocument();

    resolveSecondPreview(
      jsonResponse({
        clubName: "샘플 독서클럽",
        clubSlug: "sample-book-club",
        canonicalPath: "/clubs/sample-book-club/invite/shared-token",
        email: "sample-member@example.com",
        name: "샘플 멤버",
        emailHint: "sa****@example.com",
        status: "PENDING",
        expiresAt: "2026-05-21T12:00:00Z",
        canAccept: true,
      }),
    );

    expect(await screen.findByText("sample-member@example.com")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/bff/api/clubs/sample-book-club/invitations/shared-token");
  });
});

describe("googleInviteHref", () => {
  it("uses the canonical club path on local development origins", () => {
    expect(
      googleInviteHref("raw-token", pendingPreview, {
        origin: "http://localhost:3100",
        hostname: "localhost",
        pathname: "/invite/raw-token",
      }),
    ).toBe(
      `/oauth2/authorization/google?inviteToken=raw-token&returnTo=${encodeURIComponent("/clubs/reading-sai/invite/raw-token")}`,
    );
  });

  it("preserves the current custom-domain invite URL as OAuth returnTo", () => {
    expect(
      googleInviteHref("raw-token", pendingPreview, {
        origin: "https://reading.example.test",
        hostname: "reading.example.test",
        pathname: "/invite/raw-token",
      }),
    ).toBe(
      `/oauth2/authorization/google?inviteToken=raw-token&returnTo=${encodeURIComponent("https://reading.example.test/invite/raw-token")}`,
    );
  });
});
