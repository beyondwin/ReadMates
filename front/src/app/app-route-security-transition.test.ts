import { describe, expect, it } from "vitest";
import {
  consumeWorkspaceRouteReceipt,
  createWorkspaceRouteTransitionStore,
  prepareWorkspaceRouteReceipt,
  type CommittedWorkspaceRoute,
} from "./app-route-security-transition";

const memberRoute: CommittedWorkspaceRoute = {
  workspace: "member",
  clubScope: "reading-sai",
  href: "/clubs/reading-sai/app?tab=mine#latest",
  locationKey: "member-a",
};

const hostRoute: CommittedWorkspaceRoute = {
  workspace: "host",
  clubScope: "reading-sai",
  href: "/clubs/reading-sai/app/host?day=today#queue",
  locationKey: "host-a",
};

describe("workspace route receipt state", () => {
  it("keeps live page memory authoritative after the persisted mirror TTL", () => {
    const member = prepareWorkspaceRouteReceipt(null, memberRoute, {
      pageSessionId: "page-a",
      now: 1_000,
    });
    const host = prepareWorkspaceRouteReceipt(member.receipt, hostRoute, {
      pageSessionId: "page-a",
      now: 1_000 + (6 * 60 * 60 * 1_000) + 1,
    });

    expect(host.announcementPending).toBe(true);
    expect(host.receipt.transitionSource).toMatchObject(memberRoute);
  });

  it("preserves an unconsumed receipt only for the exact same route identity", () => {
    const member = prepareWorkspaceRouteReceipt(null, memberRoute, {
      pageSessionId: "page-a",
      now: 1_000,
    });
    const host = prepareWorkspaceRouteReceipt(member.receipt, hostRoute, {
      pageSessionId: "page-a",
      now: 2_000,
    });
    const strictModeSetup = prepareWorkspaceRouteReceipt(host.receipt, hostRoute, {
      pageSessionId: "page-a",
      now: 2_001,
    });

    expect(strictModeSetup.announcementPending).toBe(true);
    const consumed = consumeWorkspaceRouteReceipt(strictModeSetup.receipt, hostRoute);
    expect(consumed.consumed).toBe(true);
    expect(consumeWorkspaceRouteReceipt(consumed.receipt, hostRoute).consumed).toBe(false);
  });

  it.each([
    {
      label: "another href and location key in the same workspace",
      route: {
        ...hostRoute,
        href: "/clubs/reading-sai/app/host/meetings/next",
        locationKey: "host-b",
      },
    },
    {
      label: "another club",
      route: {
        ...hostRoute,
        clubScope: "book-wave",
        href: "/clubs/book-wave/app/host",
        locationKey: "host-club-b",
      },
    },
  ])("does not migrate an unconsumed receipt to $label", ({ route }) => {
    const member = prepareWorkspaceRouteReceipt(null, memberRoute, {
      pageSessionId: "page-a",
      now: 1_000,
    });
    const pendingHost = prepareWorkspaceRouteReceipt(member.receipt, hostRoute, {
      pageSessionId: "page-a",
      now: 2_000,
    });
    const moved = prepareWorkspaceRouteReceipt(pendingHost.receipt, route, {
      pageSessionId: "page-a",
      now: 3_000,
    });

    expect(moved.announcementPending).toBe(false);
    expect(moved.receipt.transitionSource).toBeNull();
    expect(consumeWorkspaceRouteReceipt(moved.receipt, route).consumed).toBe(false);
    expect(consumeWorkspaceRouteReceipt(moved.receipt, hostRoute).consumed).toBe(false);
  });
});

describe("workspace route transition store", () => {
  it("uses newer page memory when storage reads succeed but writes are denied", () => {
    let persistedReceipt: string | null = null;
    const storage = {
      getItem: () => persistedReceipt,
      setItem: () => {
        throw new Error("storage write denied");
      },
      removeItem: () => {
        throw new Error("storage remove denied");
      },
    };
    const store = createWorkspaceRouteTransitionStore({
      storage,
      pageSessionId: "page-a",
      now: () => 1_000,
    });

    expect(store.prepare(memberRoute)).toBe(false);
    persistedReceipt = JSON.stringify({
      version: 1,
      pageSessionId: "page-a",
      committedAt: 1_000,
      ...hostRoute,
      transitionSource: null,
      announcementPending: false,
    });
    expect(store.prepare(hostRoute)).toBe(true);
    expect(store.consume(hostRoute)).toBe(true);
    expect(store.consume(hostRoute)).toBe(false);
  });
});
