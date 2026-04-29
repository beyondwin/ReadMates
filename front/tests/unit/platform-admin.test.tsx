import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { PlatformAdminDashboard } from "@/features/platform-admin/ui/platform-admin-dashboard";
import { platformAdminLoader } from "@/features/platform-admin/route/platform-admin-data";
import { AuthContext, type AuthState } from "@/src/app/auth-state";
import { AuthProvider } from "@/src/app/auth-context";
import { RequirePlatformAdmin } from "@/src/app/route-guards";
import { routes } from "@/src/app/router";
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
  vi.unstubAllGlobals();
});

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

      return Promise.reject(new Error(`Unexpected fetch: ${input.toString()}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(platformAdminLoader()).resolves.toEqual({
      summary: {
        platformRole: "OWNER",
        activeClubCount: 2,
        domainActionRequiredCount: 0,
        domainsRequiringAction: [],
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

  it("renders summary metrics without club-role wording", () => {
    render(
      <PlatformAdminDashboard
        summary={{
          platformRole: "OWNER",
          activeClubCount: 2,
          domainActionRequiredCount: 0,
          domainsRequiringAction: [],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "플랫폼 관리" })).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText(/호스트|멤버 승인/)).not.toBeInTheDocument();
  });

  it("renders domain provisioning status and manual action text", () => {
    render(
      <PlatformAdminDashboard
        summary={{
          platformRole: "OPERATOR",
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
            {
              id: "domain-2",
              clubId: "club-1",
              hostname: "failed.example.test",
              kind: "SUBDOMAIN",
              status: "FAILED",
              desiredState: "ENABLED",
              manualAction: "NONE",
              errorCode: "DNS_NOT_CONNECTED",
              isPrimary: false,
              verifiedAt: null,
              lastCheckedAt: null,
            },
          ],
          domainsRequiringAction: [],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Cloudflare Pages custom domain" })).toBeInTheDocument();
    expect(screen.getByText("reading-sai.example.test")).toBeInTheDocument();
    expect(screen.getByText("ACTION_REQUIRED")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare Pages custom domain 연결 후 상태 확인을 실행하세요.")).toBeInTheDocument();
    expect(screen.getByText("failed.example.test")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
    expect(screen.getByText("DNS_NOT_CONNECTED")).toBeInTheDocument();
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

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/admin"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "플랫폼 관리" })).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
  });
});
