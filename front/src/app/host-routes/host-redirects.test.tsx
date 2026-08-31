import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { HostInvitationsRedirectElement } from "./invitations-redirect-element";
import { HostMembersRedirectElement } from "./members-redirect-element";
import { HostOperationsRedirectElement } from "./operations-redirect-element";
import { readAppReturnTarget } from "@/shared/routing/readmates-route-state";
import { AppRouteSecurityController } from "@/src/app/app-route-security-controller";

const fallbackReturnTarget = { href: "/app/host", label: "운영실로" };

function DestinationProbe({ focus = false }: { focus?: boolean }) {
  const location = useLocation();
  const returnTarget = readAppReturnTarget(location.state, location.pathname, fallbackReturnTarget);

  return (
    <>
      {focus ? (
        <QueryClientProvider client={new QueryClient()}>
          <AppRouteSecurityController
            workspace="host"
            transitionStore={{ prepare: () => false, consume: () => false }}
          />
        </QueryClientProvider>
      ) : null}
      <main>
        <h1>canonical destination</h1>
        <output aria-label="return target">{returnTarget.href}</output>
      </main>
    </>
  );
}

async function renderRedirect(options: {
  path: string;
  element: ReactElement;
  destinationPath: string;
  initialEntry: string | { pathname: string; search?: string; state?: unknown };
  focusDestination?: boolean;
}) {
  const router = createMemoryRouter(
    [
      { path: options.path, element: options.element },
      { path: options.destinationPath, element: <DestinationProbe focus={options.focusDestination} /> },
      { path: "*", element: <div>unexpected destination</div> },
    ],
    { initialEntries: [options.initialEntry] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("legacy host route redirects", () => {
  it("replaces unscoped /members with /people and preserves search and same-scope return state", async () => {
    const router = await renderRedirect({
      path: "/app/host/members",
      element: <HostMembersRedirectElement />,
      destinationPath: "/app/host/people",
      initialEntry: {
        pathname: "/app/host/members",
        search: "?status=active",
        state: {
          readmatesReturnTo: "/app/host/records?view=all#session-7",
          readmatesReturnLabel: "기록으로",
        },
      },
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/host/people");
    });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.search).toBe("?status=active");
    expect(router.state.location.state).toEqual({
      readmatesReturnTo: "/app/host/records?view=all#session-7",
      readmatesReturnLabel: "기록으로",
    });
    expect(screen.getByRole("status", { name: "return target" })).toHaveTextContent(
      "/app/host/records?view=all#session-7",
    );
  });

  it("replaces scoped /members with scoped /people and preserves its incoming hash", async () => {
    const router = await renderRedirect({
      path: "/clubs/:slug/app/host/members",
      element: <HostMembersRedirectElement />,
      destinationPath: "/clubs/:slug/app/host/people",
      initialEntry: "/clubs/reading-sai/app/host/members?status=active#member-7",
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host/people");
    });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.search).toBe("?status=active");
    expect(router.state.location.hash).toBe("#member-7");
  });

  it("replaces unscoped /operations with host root and preserves search, hash, and focus", async () => {
    const router = await renderRedirect({
      path: "/app/host/operations",
      element: <HostOperationsRedirectElement />,
      destinationPath: "/app/host",
      initialEntry: {
        pathname: "/app/host/operations",
        search: "?focus=alerts",
        state: {
          readmatesReturnTo: "/app/host/sessions",
          readmatesReturnLabel: "모임으로",
        },
      },
      focusDestination: true,
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/host");
    });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.search).toBe("?focus=alerts");
    expect(router.state.location.hash).toBe("");
    expect(router.state.location.state).toEqual({
      readmatesReturnTo: "/app/host/sessions",
      readmatesReturnLabel: "모임으로",
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "canonical destination" })).toHaveFocus();
    });
  });

  it("replaces scoped /operations with scoped host root and preserves search and hash", async () => {
    const router = await renderRedirect({
      path: "/clubs/:slug/app/host/operations",
      element: <HostOperationsRedirectElement />,
      destinationPath: "/clubs/:slug/app/host",
      initialEntry: "/clubs/reading-sai/app/host/operations?panel=ops#current-work",
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host");
    });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.search).toBe("?panel=ops");
    expect(router.state.location.hash).toBe("#current-work");
  });

  it("replaces unscoped /invitations with /settings#invitations and overrides an obsolete hash", async () => {
    const router = await renderRedirect({
      path: "/app/host/invitations",
      element: <HostInvitationsRedirectElement />,
      destinationPath: "/app/host/settings",
      initialEntry: {
        pathname: "/app/host/invitations",
        search: "?status=pending",
        state: {
          readmatesReturnTo: "/app/host/people?status=active#member-7",
          readmatesReturnLabel: "사람으로",
        },
      },
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/host/settings");
    });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.search).toBe("?status=pending");
    expect(router.state.location.hash).toBe("#invitations");
    expect(router.state.location.state).toEqual({
      readmatesReturnTo: "/app/host/people?status=active#member-7",
      readmatesReturnLabel: "사람으로",
    });
  });

  it("replaces scoped /invitations with scoped settings and normalizes a safe unscoped return target", async () => {
    const router = await renderRedirect({
      path: "/clubs/:slug/app/host/invitations",
      element: <HostInvitationsRedirectElement />,
      destinationPath: "/clubs/:slug/app/host/settings",
      initialEntry: {
        pathname: "/clubs/reading-sai/app/host/invitations",
        search: "?invite=open",
        state: {
          readmatesReturnTo: "/app/host/records?view=all",
          readmatesReturnLabel: "기록으로",
        },
      },
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host/settings");
    });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.search).toBe("?invite=open");
    expect(router.state.location.hash).toBe("#invitations");
    expect(router.state.location.state).toEqual({
      readmatesReturnTo: "/clubs/reading-sai/app/host/records?view=all",
      readmatesReturnLabel: "기록으로",
    });
  });

  it.each([
    ["an open redirect", "https://evil.example/app/host/records"],
    ["cross-club state", "/clubs/other-club/app/host/records"],
  ])("drops %s instead of injecting it into the canonical destination", async (_name, readmatesReturnTo) => {
    const router = await renderRedirect({
      path: "/clubs/:slug/app/host/invitations",
      element: <HostInvitationsRedirectElement />,
      destinationPath: "/clubs/:slug/app/host/settings",
      initialEntry: {
        pathname: "/clubs/reading-sai/app/host/invitations",
        state: {
          readmatesReturnTo,
          readmatesReturnLabel: "unsafe",
          clubSlug: "other-club",
        },
      },
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host/settings");
    });
    expect(router.state.location.state).toBeNull();
    expect(screen.getByRole("status", { name: "return target" })).toHaveTextContent("/app/host");
  });
});
