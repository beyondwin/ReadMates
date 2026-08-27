import { render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { HostInvitationsRedirectElement } from "./invitations-redirect-element";
import { HostOperationsRedirectElement } from "./operations-redirect-element";
import { HostRecordsRedirectElement } from "./records-redirect-element";

async function renderRedirect(options: {
  path: string;
  element: ReactElement;
  destinationPath: string;
  initialEntry: string | { pathname: string; search?: string; state?: unknown };
}) {
  const router = createMemoryRouter(
    [
      { path: options.path, element: options.element },
      { path: options.destinationPath, element: <div>destination</div> },
    ],
    { initialEntries: [options.initialEntry] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("HostRecordsRedirectElement", () => {
  it("redirects unscoped /records to /sessions and preserves search + state", async () => {
    const router = await renderRedirect({
      path: "/app/host/records",
      element: <HostRecordsRedirectElement />,
      destinationPath: "/app/host/sessions",
      initialEntry: {
        pathname: "/app/host/records",
        search: "?view=open",
        state: { from: "nav" },
      },
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/host/sessions");
    });
    expect(router.state.location.search).toBe("?view=open");
    expect(router.state.location.state).toEqual({ from: "nav" });
  });

  it("redirects scoped /records to /sessions and preserves search", async () => {
    const router = await renderRedirect({
      path: "/clubs/:slug/app/host/records",
      element: <HostRecordsRedirectElement />,
      destinationPath: "/clubs/:slug/app/host/sessions",
      initialEntry: "/clubs/reading-sai/app/host/records?tab=ledger",
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host/sessions");
    });
    expect(router.state.location.search).toBe("?tab=ledger");
  });
});

describe("HostOperationsRedirectElement", () => {
  it("redirects unscoped /operations to host root and preserves search + state", async () => {
    const router = await renderRedirect({
      path: "/app/host/operations",
      element: <HostOperationsRedirectElement />,
      destinationPath: "/app/host",
      initialEntry: {
        pathname: "/app/host/operations",
        search: "?focus=alerts",
        state: { from: "bookmark" },
      },
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/host");
    });
    expect(router.state.location.search).toBe("?focus=alerts");
    expect(router.state.location.state).toEqual({ from: "bookmark" });
  });

  it("redirects scoped /operations to scoped host root and preserves search", async () => {
    const router = await renderRedirect({
      path: "/clubs/:slug/app/host/operations",
      element: <HostOperationsRedirectElement />,
      destinationPath: "/clubs/:slug/app/host",
      initialEntry: "/clubs/reading-sai/app/host/operations?panel=ops",
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host");
    });
    expect(router.state.location.search).toBe("?panel=ops");
  });
});

describe("HostInvitationsRedirectElement", () => {
  it("redirects unscoped /invitations to /members and preserves search + state", async () => {
    const router = await renderRedirect({
      path: "/app/host/invitations",
      element: <HostInvitationsRedirectElement />,
      destinationPath: "/app/host/members",
      initialEntry: {
        pathname: "/app/host/invitations",
        search: "?status=pending",
        state: { from: "email" },
      },
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/host/members");
    });
    expect(router.state.location.search).toBe("?status=pending");
    expect(router.state.location.state).toEqual({ from: "email" });
  });

  it("redirects scoped /invitations to /members and preserves search", async () => {
    const router = await renderRedirect({
      path: "/clubs/:slug/app/host/invitations",
      element: <HostInvitationsRedirectElement />,
      destinationPath: "/clubs/:slug/app/host/members",
      initialEntry: "/clubs/reading-sai/app/host/invitations?invite=open",
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host/members");
    });
    expect(router.state.location.search).toBe("?invite=open");
  });
});
