import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { PlatformAdminDashboard } from "@/features/platform-admin/ui/platform-admin-dashboard";
import { PlatformAdminOnboardingWizard } from "@/features/platform-admin/ui/platform-admin-onboarding-wizard";
import { platformAdminLoader } from "@/features/platform-admin/route/platform-admin-data";
import { platformAdminKeys } from "@/features/platform-admin/queries/platform-admin-queries";
import { AuthContext, type AuthState } from "@/src/app/auth-state";
import { AuthProvider } from "@/src/app/auth-context";
import { RequirePlatformAdmin } from "@/src/app/route-guards";
import { buildRoutes, routes, routesQueryClient } from "@/src/app/router";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const baseAuth: AuthMeResponse = {
  authenticated: true,
  userId: "user-1",
  membershipId: null,
  clubId: null,
  email: "user@example.com",
  displayName: "관리자",
  accountName: "관리자",
  role: null,
  membershipStatus: null,
  approvalState: "INACTIVE",
  joinedClubs: [],
};

const anonymousAuth: AuthMeResponse = {
  authenticated: false,
  userId: null,
  membershipId: null,
  clubId: null,
  email: null,
  displayName: null,
  accountName: null,
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
};

function renderWithAuth(auth: AuthMeResponse) {
  const state: AuthState = { status: "ready", auth };

  return render(
    <AuthContext.Provider value={state}>
      <MemoryRouter>
        <RequirePlatformAdmin>
          <div>admin</div>
        </RequirePlatformAdmin>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  routesQueryClient.clear();
  vi.unstubAllGlobals();
});

function renderAdminRouter(router: ReturnType<typeof createMemoryRouter>, queryClient = routesQueryClient) {
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function createRouteTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function installRouterRequestShim() {
  const NativeRequest = globalThis.Request;

  vi.stubGlobal(
    "Request",
    class RouterTestRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init === undefined ? init : { ...init, signal: undefined });
      }
    },
  );
}

describe("platform admin frontend shell", () => {
  it("blocks non-admin users from admin route", () => {
    renderWithAuth({ ...baseAuth, platformAdmin: null });

    expect(screen.queryByText("admin")).not.toBeInTheDocument();
  });

  it("allows owner users into admin route", () => {
    renderWithAuth({
      ...baseAuth,
      platformAdmin: {
        userId: "user-1",
        email: "owner@example.com",
        role: "OWNER",
      },
    });

    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it.each(["OWNER", "OPERATOR", "SUPPORT"] as const)("allows %s platform admins into admin route", (role) => {
    renderWithAuth({
      ...baseAuth,
      platformAdmin: {
        userId: "user-1",
        email: `${role.toLowerCase()}@example.com`,
        role,
      },
    });

    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("loads the platform admin summary through the BFF", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (input.toString() === "/api/bff/api/auth/me") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...baseAuth,
              platformAdmin: {
                userId: "user-1",
                email: "owner@example.com",
                role: "OWNER",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (input.toString() === "/api/bff/api/admin/summary") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              platformRole: "OWNER",
              activeClubCount: 2,
              domainActionRequiredCount: 0,
              domainsRequiringAction: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (input.toString() === "/api/bff/api/admin/clubs") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  clubId: "club-1",
                  slug: "reading-sai",
                  name: "읽는사이",
                  tagline: "함께 읽는 모임",
                  about: "공개 소개",
                  status: "ACTIVE",
                  publicVisibility: "PUBLIC",
                  domainCount: 1,
                  domainActionRequiredCount: 0,
                  firstHostOnboardingState: "ASSIGNED",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${input.toString()}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(platformAdminLoader()).resolves.toMatchObject({
      summary: {
        platformRole: "OWNER",
        activeClubCount: 2,
      },
      clubs: {
        items: [
          {
            slug: "reading-sai",
            publicVisibility: "PUBLIC",
            firstHostOnboardingState: "ASSIGNED",
          },
        ],
      },
    });
  });

  it("checks platform admin auth before loading summary data", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (input.toString() === "/api/bff/api/auth/me") {
        return Promise.resolve(new Response(JSON.stringify({ ...baseAuth, platformAdmin: null }), { status: 200 }));
      }

      if (input.toString() === "/api/bff/api/admin/summary") {
        return Promise.reject(new Error("summary should not be requested"));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${input.toString()}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(platformAdminLoader()).rejects.toMatchObject({
      status: 302,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/auth/me",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("redirects anonymous admin loader requests to login with returnTo", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (input.toString() === "/api/bff/api/auth/me") {
        return Promise.resolve(new Response(JSON.stringify(anonymousAuth), { status: 200 }));
      }

      if (input.toString() === "/api/bff/api/admin/summary") {
        return Promise.reject(new Error("summary should not be requested"));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${input.toString()}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await platformAdminLoader({
        params: {},
        request: new Request("https://app.readmates.example/admin?tab=domains"),
      } as Parameters<typeof platformAdminLoader>[0]);
      throw new Error("Expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(302);
      expect((error as Response).headers.get("Location")).toBe("/login?returnTo=%2Fadmin%3Ftab%3Ddomains");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows existing user confirmation in onboarding wizard", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn().mockResolvedValue({
      club: { slug: "new-club", available: true },
      firstHost: {
        kind: "EXISTING_USER",
        email: "host@example.com",
        existingUserId: "user-1",
        existingUserName: "Host User",
        requiredConfirmation: "ASSIGN_EXISTING_USER_AS_HOST",
      },
      domain: null,
    });
    const onCommit = vi.fn();

    render(<PlatformAdminOnboardingWizard onPreview={onPreview} onCommit={onCommit} />);

    await user.type(screen.getByLabelText("클럽 이름"), "New Club");
    await user.type(screen.getByLabelText("Slug"), "new-club");
    await user.type(screen.getByLabelText("Tagline"), "A reading club");
    await user.type(screen.getByLabelText("About"), "A detailed public introduction");
    await user.type(screen.getByLabelText("첫 호스트 이메일"), "host@example.com");
    await user.type(screen.getByLabelText("첫 호스트 이름"), "Host User");
    await user.click(screen.getByRole("button", { name: "미리 확인" }));

    expect(await screen.findByText("기존 사용자 확인 필요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "기존 사용자에게 HOST 권한 부여" })).toBeDisabled();
  });

  it("runs domain status check from the platform admin route", async () => {
    const ownerAuth: AuthMeResponse = {
      ...baseAuth,
      platformAdmin: {
        userId: "user-1",
        email: "owner@example.com",
        role: "OWNER",
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(new Response(JSON.stringify(ownerAuth), { status: 200 }));
      }

      if (url === "/api/bff/api/admin/summary") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              platformRole: "OWNER",
              activeClubCount: 2,
              domainActionRequiredCount: 1,
              domains: [
                {
                  id: "domain-1",
                  clubId: "club-1",
                  hostname: "reading-sai.example.test",
                  kind: "SUBDOMAIN",
                  status: "ACTION_REQUIRED",
                  desiredState: "ENABLED",
                  manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
                  errorCode: null,
                  isPrimary: false,
                  verifiedAt: null,
                  lastCheckedAt: null,
                },
              ],
              domainsRequiringAction: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/clubs") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  clubId: "club-1",
                  slug: "reading-sai",
                  name: "읽는사이",
                  tagline: "함께 읽는 모임",
                  about: "공개 소개",
                  status: "ACTIVE",
                  publicVisibility: "PUBLIC",
                  domainCount: 1,
                  domainActionRequiredCount: 1,
                  firstHostOnboardingState: "ASSIGNED",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/support-access-grants?clubId=club-1") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      if (url === "/api/bff/api/admin/domains/domain-1/check") {
        expect(init?.method).toBe("POST");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "domain-1",
              clubId: "club-1",
              hostname: "reading-sai.example.test",
              kind: "SUBDOMAIN",
              status: "ACTIVE",
              desiredState: "ENABLED",
              manualAction: "NONE",
              errorCode: null,
              isPrimary: false,
              verifiedAt: "2026-04-30T01:00:00Z",
              lastCheckedAt: "2026-04-30T01:00:00Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/admin"] });
    const user = userEvent.setup();

    renderAdminRouter(router);

    await user.click(await screen.findByRole("button", { name: /상태 확인/ }));

    expect(await screen.findByText("추가 조치 없음")).toBeInTheDocument();
    expect(screen.getAllByText("ACTIVE").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/admin/domains/domain-1/check",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders a triage work queue and selected club brief", () => {
    render(
      <PlatformAdminDashboard
        workbench={{
          permissions: {
            canCreateClub: true,
            canUpdateClub: true,
            canManageDomains: true,
            canCreateSupportGrant: true,
            canRevokeSupportGrant: true,
          },
          metrics: {
            platformRole: "OWNER",
            activeClubCount: 1,
            needsActionCount: 1,
            domainActionRequiredCount: 2,
            publishReadyCount: 0,
          },
          queueItems: [
            {
              clubId: "club-1",
              slug: "reading-sai",
              name: "읽는사이",
              severity: "blocked",
              reason: "첫 호스트가 아직 없습니다.",
              primaryActionLabel: "체크리스트",
              badges: ["SETUP_REQUIRED", "PRIVATE", "host MISSING"],
              sortRank: 10,
            },
          ],
          selectedClub: {
            clubId: "club-1",
            slug: "reading-sai",
            name: "읽는사이",
            tagline: "함께 읽는 모임",
            about: "공개 소개",
            status: "SETUP_REQUIRED",
            publicVisibility: "PRIVATE",
            domainCount: 0,
            domainActionRequiredCount: 0,
            firstHostOnboardingState: "MISSING",
            domains: [],
            publishChecklist: [
              {
                id: "first-host",
                label: "첫 호스트 지정",
                passed: false,
                detail: "첫 호스트가 아직 없습니다.",
              },
            ],
            primaryAction: {
              kind: "make-public",
              label: "공개 전환",
              disabled: true,
              reason: "첫 호스트가 아직 없습니다.",
            },
            queueItem: {
              clubId: "club-1",
              slug: "reading-sai",
              name: "읽는사이",
              severity: "blocked",
              reason: "첫 호스트가 아직 없습니다.",
              primaryActionLabel: "체크리스트",
              badges: ["SETUP_REQUIRED", "PRIVATE", "host MISSING"],
              sortRank: 10,
            },
          },
        }}
        selectedClubId="club-1"
        onSelectClub={vi.fn()}
        activeGrants={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "플랫폼 관리" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "운영 작업 큐" })).toBeInTheDocument();
    const summary = screen.getByLabelText("플랫폼 요약");
    expect(summary).toBeInTheDocument();
    expect(within(summary).getByText("플랫폼 역할")).toBeInTheDocument();
    expect(within(summary).getByText("활성 클럽")).toBeInTheDocument();
    expect(within(summary).getByText("조치 필요")).toBeInTheDocument();
    expect(within(summary).getByText("도메인 조치 필요")).toBeInTheDocument();
    expect(within(summary).getByText("공개 준비")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /읽는사이/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("첫 호스트가 아직 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "읽는사이" })).toBeInTheDocument();
  });

  it("loads support access grants for the selected club", async () => {
    const ownerAuth: AuthMeResponse = {
      ...baseAuth,
      platformAdmin: {
        userId: "user-1",
        email: "owner@example.com",
        role: "OWNER",
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(new Response(JSON.stringify(ownerAuth), { status: 200 }));
      }

      if (url === "/api/bff/api/admin/summary") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              platformRole: "OWNER",
              activeClubCount: 2,
              domainActionRequiredCount: 0,
              domains: [],
              domainsRequiringAction: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/clubs") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  clubId: "club-1",
                  slug: "first-club",
                  name: "첫 클럽",
                  tagline: "첫 클럽 tagline",
                  about: "첫 클럽 소개",
                  status: "ACTIVE",
                  publicVisibility: "PUBLIC",
                  domainCount: 0,
                  domainActionRequiredCount: 0,
                  firstHostOnboardingState: "ASSIGNED",
                },
                {
                  clubId: "club-2",
                  slug: "second-club",
                  name: "둘째 클럽",
                  tagline: "둘째 클럽 tagline",
                  about: "둘째 클럽 소개",
                  status: "ACTIVE",
                  publicVisibility: "PRIVATE",
                  domainCount: 0,
                  domainActionRequiredCount: 0,
                  firstHostOnboardingState: "ASSIGNED",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/support-access-grants?clubId=club-1") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      if (url === "/api/bff/api/admin/support-access-grants?clubId=club-2") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "grant-1",
                clubId: "club-2",
                grantedByUserId: "owner-1",
                granteeUserId: "support-1",
                scope: "HOST_SUPPORT_READ",
                reason: "Support review",
                expiresAt: "2099-01-01T12:00:00Z",
                revokedAt: null,
                createdAt: "2026-05-17T00:00:00Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/admin"] });
    const user = userEvent.setup();

    renderAdminRouter(router);

    await user.click(await screen.findByRole("button", { name: /둘째 클럽/ }));

    expect(await screen.findByText("Support review")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/admin/support-access-grants?clubId=club-2",
      expect.anything(),
    );
  });

  it("mounts the platform admin route at /admin", async () => {
    const ownerAuth: AuthMeResponse = {
      ...baseAuth,
      platformAdmin: {
        userId: "user-1",
        email: "owner@example.com",
        role: "OWNER",
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(new Response(JSON.stringify(ownerAuth), { status: 200 }));
      }

      if (url === "/api/bff/api/admin/summary") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              platformRole: "OWNER",
              activeClubCount: 2,
              domainActionRequiredCount: 0,
              domainsRequiringAction: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/clubs") {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/admin"] });

    renderAdminRouter(router);

    expect(await screen.findByRole("heading", { name: "플랫폼 관리" })).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
  });

  it("seeds platform admin query cache from the app route loader", async () => {
    const ownerAuth: AuthMeResponse = {
      ...baseAuth,
      platformAdmin: {
        userId: "user-1",
        email: "owner@example.com",
        role: "OWNER",
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(new Response(JSON.stringify(ownerAuth), { status: 200 }));
      }

      if (url === "/api/bff/api/admin/summary") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              platformRole: "OWNER",
              activeClubCount: 1,
              domainActionRequiredCount: 0,
              domains: [],
              domainsRequiringAction: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/clubs") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  clubId: "club-1",
                  slug: "reading-sai",
                  name: "읽는사이",
                  tagline: "함께 읽는 모임",
                  about: "공개 소개",
                  status: "ACTIVE",
                  publicVisibility: "PUBLIC",
                  domainCount: 0,
                  domainActionRequiredCount: 0,
                  firstHostOnboardingState: "ASSIGNED",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/support-access-grants?clubId=club-1") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const queryClient = createRouteTestQueryClient();
    const router = createMemoryRouter(buildRoutes(queryClient), { initialEntries: ["/admin"] });

    renderAdminRouter(router, queryClient);

    expect(await screen.findByRole("heading", { name: "플랫폼 관리" })).toBeInTheDocument();
    expect(queryClient.getQueryData(platformAdminKeys.summary())).toMatchObject({
      platformRole: "OWNER",
      activeClubCount: 1,
    });
    expect(queryClient.getQueryData(platformAdminKeys.clubs())).toMatchObject({
      items: [{ slug: "reading-sai" }],
    });
  });

  it("selects the created club and shows returned domain after onboarding commit", async () => {
    const onPreview = vi.fn().mockResolvedValue({
      club: { slug: "new-club", available: true },
      firstHost: {
        kind: "NEW_USER",
        email: "host@example.com",
        existingUserId: null,
        existingUserName: null,
        requiredConfirmation: null,
      },
      domain: { hostname: "new-club.example.com", available: true },
    });
    const onCommit = vi.fn().mockResolvedValue({
      club: {
        clubId: "club-new",
        slug: "new-club",
        name: "새 클럽",
        tagline: "새 클럽 tagline",
        about: "새 클럽 소개",
        status: "SETUP_REQUIRED",
        publicVisibility: "PRIVATE",
        domainCount: 1,
        domainActionRequiredCount: 1,
        firstHostOnboardingState: "INVITED",
      },
      hostOnboarding: {
        kind: "INVITATION_CREATED",
        email: "host@example.com",
        userId: null,
        invitationId: "invite-1",
        acceptUrl: "https://readmates.example/invite/example",
        emailDelivery: { status: "SENT" },
      },
      domain: {
        id: "domain-new",
        clubId: "club-new",
        hostname: "new-club.example.com",
        kind: "SUBDOMAIN",
        status: "ACTION_REQUIRED",
        desiredState: "ENABLED",
        manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
        errorCode: null,
        isPrimary: false,
        verifiedAt: null,
        lastCheckedAt: null,
      },
    });

    render(<PlatformAdminOnboardingWizard onPreview={onPreview} onCommit={onCommit} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("클럽 이름"), "새 클럽");
    await user.type(screen.getByLabelText("Slug"), "new-club");
    await user.type(screen.getByLabelText("Tagline"), "새 클럽 tagline");
    await user.type(screen.getByLabelText("About"), "새 클럽 소개");
    await user.type(screen.getByLabelText("첫 호스트 이메일"), "host@example.com");
    await user.type(screen.getByLabelText("첫 호스트 이름"), "Host User");
    await user.click(screen.getByRole("button", { name: "미리 확인" }));
    await user.click(await screen.findByRole("button", { name: "클럽 생성" }));

    expect(await screen.findByText("new-club")).toBeInTheDocument();
    expect(screen.getByText("메일: SENT")).toBeInTheDocument();
  });

  it("selects the created club and adds returned domain after onboarding commit (route)", async () => {
    const ownerAuth: AuthMeResponse = {
      ...baseAuth,
      platformAdmin: {
        userId: "user-1",
        email: "owner@example.com",
        role: "OWNER",
      },
    };
    const newClub = {
      clubId: "club-new",
      slug: "new-club",
      name: "새 클럽",
      tagline: "새 클럽 tagline",
      about: "새 클럽 소개",
      status: "SETUP_REQUIRED",
      publicVisibility: "PRIVATE",
      domainCount: 1,
      domainActionRequiredCount: 1,
      firstHostOnboardingState: "INVITED",
    };
    const newDomain = {
      id: "domain-new",
      clubId: "club-new",
      hostname: "new-club.example.com",
      kind: "SUBDOMAIN",
      status: "ACTION_REQUIRED",
      desiredState: "ENABLED",
      manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
      errorCode: null,
      isPrimary: false,
      verifiedAt: null,
      lastCheckedAt: null,
    };
    const onboardingResult = {
      club: newClub,
      hostOnboarding: {
        kind: "INVITATION_CREATED",
        email: "host@example.com",
        userId: null,
        invitationId: "invite-1",
        acceptUrl: "https://readmates.example/invite/example",
        emailDelivery: { status: "SENT" },
      },
      domain: newDomain,
    };
    let onboardingCommitted = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(new Response(JSON.stringify(ownerAuth), { status: 200 }));
      }

      if (url === "/api/bff/api/admin/summary") {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              onboardingCommitted
                ? {
                    platformRole: "OWNER",
                    activeClubCount: 1,
                    domainActionRequiredCount: 1,
                    domains: [newDomain],
                    domainsRequiringAction: [newDomain],
                  }
                : {
                    platformRole: "OWNER",
                    activeClubCount: 0,
                    domainActionRequiredCount: 0,
                    domains: [],
                    domainsRequiringAction: [],
                  },
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/clubs") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ items: onboardingCommitted ? [newClub] : [] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/clubs/onboarding/preview") {
        expect(init?.method).toBe("POST");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              club: { slug: "new-club", available: true },
              firstHost: {
                kind: "NEW_USER",
                email: "host@example.com",
                existingUserId: null,
                existingUserName: null,
                requiredConfirmation: null,
              },
              domain: { hostname: "new-club.example.com", available: true },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/clubs/onboarding") {
        expect(init?.method).toBe("POST");
        onboardingCommitted = true;
        return Promise.resolve(
          new Response(
            JSON.stringify(onboardingResult),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url === "/api/bff/api/admin/support-access-grants?clubId=club-new") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/admin"] });
    const user = userEvent.setup();

    renderAdminRouter(router);

    await user.click(await screen.findByRole("button", { name: "새 클럽" }));
    await user.type(screen.getByLabelText("클럽 이름"), "새 클럽");
    await user.type(screen.getByLabelText("Slug"), "new-club");
    await user.type(screen.getByLabelText("Tagline"), "새 클럽 tagline");
    await user.type(screen.getByLabelText("About"), "새 클럽 소개");
    await user.type(screen.getByLabelText("첫 호스트 이메일"), "host@example.com");
    await user.type(screen.getByLabelText("첫 호스트 이름"), "Host User");
    await user.click(screen.getByRole("button", { name: "미리 확인" }));
    await user.click(await screen.findByRole("button", { name: "클럽 생성" }));

    expect(await screen.findByRole("heading", { name: "새 클럽" })).toBeInTheDocument();
    expect(screen.getByText("new-club.example.com")).toBeInTheDocument();
    expect(screen.getAllByText("ACTION_REQUIRED").length).toBeGreaterThan(0);
  });
});
