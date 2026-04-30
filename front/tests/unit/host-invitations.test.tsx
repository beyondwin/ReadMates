import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostInvitationsActions } from "@/features/host/route/host-invitations-actions";
import HostInvitations from "@/features/host/ui/host-invitations";
import { hostInvitationsActions } from "@/features/host";
import type { HostInvitationListItem } from "@/features/host/api/host-contracts";

const invitations: HostInvitationListItem[] = [
  {
    invitationId: "invite-1",
    email: "pending@example.com",
    name: "대기 멤버",
    role: "MEMBER",
    status: "PENDING",
    effectiveStatus: "PENDING",
    expiresAt: "2026-05-20T12:00:00Z",
    acceptedAt: null,
    createdAt: "2026-04-20T12:00:00Z",
    canRevoke: true,
    canReissue: true,
    applyToCurrentSession: true,
  },
  {
    invitationId: "invite-2",
    email: "accepted@example.com",
    name: "수락 멤버",
    role: "MEMBER",
    status: "ACCEPTED",
    effectiveStatus: "ACCEPTED",
    expiresAt: "2026-05-20T12:00:00Z",
    acceptedAt: "2026-04-21T12:00:00Z",
    createdAt: "2026-04-20T12:00:00Z",
    canRevoke: false,
    canReissue: false,
    applyToCurrentSession: true,
  },
];

const hostInvitationsTestActions = {
  listInvitations: () => fetch("/api/bff/api/host/invitations", { cache: "no-store" }),
  createInvitation: (request) =>
    fetch("/api/bff/api/host/invitations", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(request),
      cache: "no-store",
    }),
  revokeInvitation: (invitationId) =>
    fetch(`/api/bff/api/host/invitations/${encodeURIComponent(invitationId)}/revoke`, {
      method: "POST",
      cache: "no-store",
    }),
  parseInvitation: async (response) => response.json(),
  parseInvitationList: async (response) => response.json(),
} satisfies HostInvitationsActions;

type HostInvitationsProps = Parameters<typeof HostInvitations>[0];

function HostInvitationsForTest({
  actions,
  ...props
}: Omit<HostInvitationsProps, "actions"> & { actions?: HostInvitationsActions }) {
  return <HostInvitations {...props} actions={actions ?? hostInvitationsTestActions} />;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("HostInvitations", () => {
  it("renders invitation list statuses and actions", () => {
    render(<HostInvitationsForTest initialInvitations={invitations} />);

    expect(screen.getByText("멤버 초대 관리")).toBeInTheDocument();
    expect(screen.getByText("초대 링크 생성부터 수락, 만료, 취소 상태까지 한곳에서 확인합니다.")).toBeInTheDocument();
    expect(screen.getByText("대기 멤버")).toBeInTheDocument();
    expect(screen.getByText("수락 멤버")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /운영 대시보드/ })).not.toBeInTheDocument();
    expect(screen.getByText("pending@example.com · 만료 2026.05.20")).toBeInTheDocument();
    expect(screen.getByText("accepted@example.com · 만료 2026.05.20")).toBeInTheDocument();
    expect(screen.getByLabelText("수락하면 이번 세션에도 추가")).toBeChecked();
    expect(screen.getByRole("button", { name: "pending@example.com 초대 취소" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "pending@example.com 초대 취소" })).toHaveTextContent(/^초대 취소$/);
    expect(screen.getByRole("button", { name: "pending@example.com 새 링크 발급" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "pending@example.com 새 링크 발급" })).toHaveTextContent(/^새 링크 발급$/);
    expect(screen.queryByRole("button", { name: "accepted@example.com 새 링크 발급" })).not.toBeInTheDocument();
  });

  it("loads the next invitation page and appends it", async () => {
    const nextInvitation = {
      ...invitations[1],
      invitationId: "invite-3",
      email: "next@example.com",
      name: "다음 멤버",
    } satisfies HostInvitationListItem;
    const actions = {
      ...hostInvitationsTestActions,
      listInvitations: vi.fn(async () => new Response(JSON.stringify({ items: [nextInvitation], nextCursor: null }))),
    } satisfies HostInvitationsActions;

    render(
      <HostInvitationsForTest
        initialInvitations={{ items: [invitations[0]], nextCursor: "cursor-1" }}
        actions={actions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));

    expect(actions.listInvitations).toHaveBeenCalledWith({ limit: 50, cursor: "cursor-1" });
    expect(await screen.findByText("다음 멤버")).toBeInTheDocument();
    expect(screen.getByText("대기 멤버")).toBeInTheDocument();
  });

  it("keeps load-more pagination on the route action URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null })));
    vi.stubGlobal("fetch", fetchMock);

    await hostInvitationsActions.listInvitations({ limit: 50, cursor: "cursor-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/invitations?limit=50&cursor=cursor-1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("creates an invitation and copies the returned link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitationId: "invite-3",
            email: "new@example.com",
            name: "새멤버",
            role: "MEMBER",
            status: "PENDING",
            effectiveStatus: "PENDING",
            expiresAt: "2026-05-20T12:00:00Z",
            acceptedAt: null,
            createdAt: "2026-04-20T12:00:00Z",
            canRevoke: true,
            canReissue: true,
            applyToCurrentSession: true,
            acceptUrl: "http://localhost:3000/invite/raw-token",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              invitationId: "invite-3",
              email: "new@example.com",
              name: "새멤버",
              role: "MEMBER",
              status: "PENDING",
              effectiveStatus: "PENDING",
              expiresAt: "2026-05-20T12:00:00Z",
              acceptedAt: null,
              createdAt: "2026-04-20T12:00:00Z",
              canRevoke: true,
              canReissue: true,
              applyToCurrentSession: true,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(navigator, { clipboard: { writeText } });
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<HostInvitationsForTest initialInvitations={[]} />);
    await user.type(screen.getByLabelText("이름"), "새멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    await waitFor(() => expect(screen.getByDisplayValue("http://localhost:3000/invite/raw-token")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "메일로 공유" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:new%40example.com"),
    );
    await user.click(screen.getByRole("button", { name: "초대 링크 복사" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@example.com", name: "새멤버", applyToCurrentSession: true }),
        cache: "no-store",
      }),
    );
    const createHeaders = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(createHeaders).toBeInstanceOf(Headers);
    expect((createHeaders as Headers).get("Content-Type")).toBe("application/json");
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/invite/raw-token");
    expect(await screen.findByRole("status")).toHaveTextContent("초대 링크를 복사했습니다.");
  });

  it("sends false when the current session checkbox is unchecked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitationId: "invite-3",
            email: "new@example.com",
            name: "새멤버",
            role: "MEMBER",
            status: "PENDING",
            effectiveStatus: "PENDING",
            expiresAt: "2026-05-20T12:00:00Z",
            acceptedAt: null,
            createdAt: "2026-04-20T12:00:00Z",
            canRevoke: true,
            canReissue: true,
            applyToCurrentSession: false,
            acceptUrl: "http://localhost:3000/invite/raw-token",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostInvitationsForTest initialInvitations={[]} />);
    await user.type(screen.getByLabelText("이름"), "새멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "new@example.com");
    await user.click(screen.getByLabelText("수락하면 이번 세션에도 추가"));
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@example.com", name: "새멤버", applyToCurrentSession: false }),
      }),
    );
  });

  it("requires an accessible name before creating an invitation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostInvitationsForTest initialInvitations={[]} />);
    await user.type(screen.getByLabelText("초대 이메일"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("이름")).toBeRequired();
    expect(screen.getByLabelText("이름")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("이름을 입력해 주세요.");
  });

  it("keeps create submit disabled while an invitation create request is pending", async () => {
    const createResponse = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(createResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostInvitationsForTest initialInvitations={[]} />);
    await user.type(screen.getByLabelText("이름"), "새멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "new@example.com");

    const submitButton = screen.getByRole("button", { name: "초대 링크 만들기" });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveTextContent("초대 링크를 만드는 중");
    expect(screen.getByText("초대 링크를 만드는 중입니다.")).toBeInTheDocument();
    await user.click(submitButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps row reissue disabled while a new invitation link is pending", async () => {
    const createResponse = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(createResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostInvitationsForTest initialInvitations={[invitations[0]]} />);

    const reissueButton = screen.getByRole("button", { name: "pending@example.com 새 링크 발급" });
    await user.click(reissueButton);

    expect(reissueButton).toBeDisabled();
    expect(reissueButton).toHaveTextContent("새 링크 발급 중");
    expect(screen.getByText("목록 작업이 끝난 뒤 새 초대 링크를 만들 수 있습니다.")).toBeInTheDocument();
    await user.click(reissueButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows feedback when copying the latest invite link fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitationId: "invite-3",
            email: "new@example.com",
            name: "새멤버",
            role: "MEMBER",
            status: "PENDING",
            effectiveStatus: "PENDING",
            expiresAt: "2026-05-20T12:00:00Z",
            acceptedAt: null,
            createdAt: "2026-04-20T12:00:00Z",
            canRevoke: true,
            canReissue: true,
            applyToCurrentSession: true,
            acceptUrl: "http://localhost:3000/invite/raw-token",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }));
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<HostInvitationsForTest initialInvitations={[]} />);
    await user.type(screen.getByLabelText("이름"), "새멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await screen.findByDisplayValue("http://localhost:3000/invite/raw-token");

    await user.click(screen.getByRole("button", { name: "초대 링크 복사" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("초대 링크 복사에 실패했습니다.");
  });

  it("clears the displayed invite link when a new create attempt fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitationId: "invite-old",
            email: "old@example.com",
            name: "기존 멤버",
            role: "MEMBER",
            status: "PENDING",
            effectiveStatus: "PENDING",
            expiresAt: "2026-05-20T12:00:00Z",
            acceptedAt: null,
            createdAt: "2026-04-20T12:00:00Z",
            canRevoke: true,
            canReissue: true,
            applyToCurrentSession: true,
            acceptUrl: "http://localhost:3000/invite/old-token",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "CREATE_FAILED" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostInvitationsForTest initialInvitations={[]} />);
    await user.type(screen.getByLabelText("이름"), "기존 멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "old@example.com");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await screen.findByDisplayValue("http://localhost:3000/invite/old-token");

    await user.type(screen.getByLabelText("이름"), "새 멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("초대 생성에 실패했습니다.");
    expect(screen.queryByDisplayValue("http://localhost:3000/invite/old-token")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 링크 복사" })).not.toBeInTheDocument();
  });

  it("clears the displayed invite link when reissue fails for a different target", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitationId: "invite-old",
            email: "old@example.com",
            name: "기존 멤버",
            role: "MEMBER",
            status: "PENDING",
            effectiveStatus: "PENDING",
            expiresAt: "2026-05-20T12:00:00Z",
            acceptedAt: null,
            createdAt: "2026-04-20T12:00:00Z",
            canRevoke: true,
            canReissue: true,
            applyToCurrentSession: true,
            acceptUrl: "http://localhost:3000/invite/old-token",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([invitations[0]]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "REISSUE_FAILED" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostInvitationsForTest initialInvitations={[]} />);
    await user.type(screen.getByLabelText("이름"), "기존 멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "old@example.com");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await screen.findByDisplayValue("http://localhost:3000/invite/old-token");
    await screen.findByText("pending@example.com · 만료 2026.05.20");

    await user.click(screen.getByRole("button", { name: "pending@example.com 새 링크 발급" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("새 링크 발급에 실패했습니다.");
    expect(screen.queryByDisplayValue("http://localhost:3000/invite/old-token")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 링크 복사" })).not.toBeInTheDocument();
  });

  it("clears the displayed invite link when that invitation is revoked", async () => {
    const displayedInvitation = {
      invitationId: "invite-displayed",
      email: "displayed@example.com",
      name: "표시 멤버",
      role: "MEMBER" as const,
      status: "PENDING" as const,
      effectiveStatus: "PENDING" as const,
      expiresAt: "2026-05-20T12:00:00Z",
      acceptedAt: null,
      createdAt: "2026-04-20T12:00:00Z",
      canRevoke: true,
      canReissue: true,
      applyToCurrentSession: true,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...displayedInvitation,
            acceptUrl: "http://localhost:3000/invite/displayed-token",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([displayedInvitation]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ revoked: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostInvitationsForTest initialInvitations={[]} />);
    await user.type(screen.getByLabelText("이름"), "표시 멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "displayed@example.com");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await screen.findByDisplayValue("http://localhost:3000/invite/displayed-token");

    await user.click(screen.getByRole("button", { name: "displayed@example.com 초대 취소" }));

    await waitFor(() => expect(screen.queryByText("displayed@example.com · 만료 2026.05.20")).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue("http://localhost:3000/invite/displayed-token")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 링크 복사" })).not.toBeInTheDocument();
  });

  it("refreshes invitations after reissue and keeps historical rows", async () => {
    const revokedInvitation = {
      ...invitations[1],
      invitationId: "invite-2",
      status: "REVOKED" as const,
      effectiveStatus: "REVOKED" as const,
      acceptedAt: null,
      canReissue: true,
      applyToCurrentSession: true,
    };
    const reissuedInvitation = {
      invitationId: "invite-3",
      email: "accepted@example.com",
      name: "수락 멤버",
      role: "MEMBER",
      status: "PENDING",
      effectiveStatus: "PENDING",
      expiresAt: "2026-05-25T12:00:00Z",
      acceptedAt: null,
      createdAt: "2026-04-25T12:00:00Z",
      canRevoke: true,
      canReissue: true,
      applyToCurrentSession: true,
      acceptUrl: "http://localhost:3000/invite/reissued-token",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(reissuedInvitation), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              ...reissuedInvitation,
              acceptUrl: undefined,
            },
            revokedInvitation,
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostInvitationsForTest initialInvitations={[revokedInvitation]} />);
    await user.click(screen.getByRole("button", { name: "accepted@example.com 새 링크 발급" }));

    await waitFor(() => expect(screen.getByText("accepted@example.com · 만료 2026.05.25")).toBeInTheDocument());
    expect(screen.getByText("accepted@example.com · 만료 2026.05.20")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/bff/api/host/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "accepted@example.com", name: "수락 멤버", applyToCurrentSession: true }),
        cache: "no-store",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/bff/api/host/invitations",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
