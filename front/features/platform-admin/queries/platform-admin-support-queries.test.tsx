import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { confirmAdminSupportGrant } from "../api/platform-admin-support-api";
import {
  platformAdminSupportKeys,
  publishAdminSupportLedger,
  useAdminSupportCreateConfirmMutation,
} from "./platform-admin-support-queries";

vi.mock("../api/platform-admin-support-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/platform-admin-support-api")>()),
  confirmAdminSupportGrant: vi.fn(),
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

describe("platform admin support publication fence", () => {
  it("does not invalidate the ledger when a confirm mutation merely settles", async () => {
    const { client, Wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(confirmAdminSupportGrant).mockResolvedValue({ grantId: "grant-1" } as never);
    const { result } = renderHook(() => useAdminSupportCreateConfirmMutation(), { wrapper: Wrapper });

    await act(async () => { await result.current.confirm({ previewId: "preview-1" } as never); });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates only through the explicit publisher", async () => {
    const client = new QueryClient();
    client.setQueryData(platformAdminSupportKeys.ledger(), { pages: [] });
    await publishAdminSupportLedger(client);
    expect(client.getQueryState(platformAdminSupportKeys.ledger())?.isInvalidated).toBe(true);
  });
});
