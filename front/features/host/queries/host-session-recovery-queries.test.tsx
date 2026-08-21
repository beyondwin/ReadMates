import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/host/api/host-session-recovery-api", () => ({
  fetchHostSessionRestorePreview: vi.fn(),
  restoreHostSessionChange: vi.fn(),
}));

import { restoreHostSessionChange } from "@/features/host/api/host-session-recovery-api";
import { hostSessionRecordKeys } from "./host-session-record-queries";
import { hostSessionKeys } from "./host-session-queries";
import {
  hostSessionRecoveryKeys,
  hostSessionRestorePreviewQuery,
  useRestoreHostSessionChangeMutation,
} from "./host-session-recovery-queries";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

const context = { clubSlug: "reading-sai" };
type CacheEntry = readonly [readonly unknown[], unknown];

function seedSurfaces(client: QueryClient) {
  const entries = {
    detail: [hostSessionKeys.detail("session-7", context), { surface: "detail" }],
    history: [hostSessionRecordKeys.historyRoot("session-7", context), { surface: "history" }],
    list: [hostSessionKeys.list({ limit: 50 }, context), { surface: "list" }],
    dashboard: [hostSessionKeys.dashboard(context), { surface: "dashboard" }],
    current: [hostSessionKeys.current(context), { surface: "current" }],
    closingStatus: [hostSessionKeys.closingStatus("session-7", context), { surface: "closing" }],
    restorePreview: [
      hostSessionRecoveryKeys.restorePreview("session-7", "change-1", context),
      { surface: "restore-preview" },
    ],
    otherClubDetail: [
      hostSessionKeys.detail("session-7", { clubSlug: "other-club" }),
      { surface: "other-detail" },
    ],
  } as const satisfies Record<string, CacheEntry>;
  for (const [key, value] of Object.values(entries)) {
    client.setQueryData(key, value);
  }
  return entries;
}

function expectInvalidated(client: QueryClient, entries: readonly CacheEntry[]) {
  for (const [key, value] of entries) {
    expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    expect(client.getQueryData(key), JSON.stringify(key)).toEqual(value);
  }
}

function expectFresh(client: QueryClient, entries: readonly CacheEntry[]) {
  for (const [key, value] of entries) {
    expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    expect(client.getQueryData(key), JSON.stringify(key)).toEqual(value);
  }
}

beforeEach(() => {
  vi.mocked(restoreHostSessionChange).mockReset();
});

describe("host session recovery queries", () => {
  it("scopes restore preview keys by club slug", () => {
    expect(hostSessionRestorePreviewQuery("session-7", "change-1", context).queryKey).toEqual([
      "host",
      "session-recovery",
      "reading-sai",
      "restore-preview",
      "session-7",
      "change-1",
    ]);
    expect(hostSessionRecoveryKeys.scope({ clubSlug: "other-club" })).not.toEqual(
      hostSessionRecoveryKeys.scope(context),
    );
  });

  it("invalidates detail, history, list, dashboard, current, closing status, and preview keys after restore", async () => {
    vi.mocked(restoreHostSessionChange).mockResolvedValue({
      changeId: "change-2",
      kind: "BASIC_INFO",
      undoAvailable: true,
    });
    const { client, Wrapper } = createWrapper();
    const entries = seedSurfaces(client);
    const { result } = renderHook(() => useRestoreHostSessionChangeMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-7",
        changeId: "change-1",
        request: { expectedCurrentHash: "f".repeat(64) },
      });
    });

    expect(restoreHostSessionChange).toHaveBeenCalledWith(
      "session-7",
      "change-1",
      { expectedCurrentHash: "f".repeat(64) },
      context,
    );
    expectInvalidated(client, [
      entries.detail,
      entries.history,
      entries.list,
      entries.dashboard,
      entries.current,
      entries.closingStatus,
      entries.restorePreview,
    ]);
    expectFresh(client, [entries.otherClubDetail]);
  });
});
