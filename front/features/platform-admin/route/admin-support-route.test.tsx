import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminSupportGrantLedgerItem,
  AdminSupportSearchResult,
} from "@/features/platform-admin/model/platform-admin-support-model";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubsQuery,
  purgePlatformAdminState,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminSupportLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-support-queries";
import { AdminSupportRoute } from "./admin-support-route";

vi.mock("@/features/platform-admin/api/platform-admin-support-api", () => ({
  searchAdminSupportSubjects: vi.fn(),
  fetchAdminSupportGrantLedger: vi.fn(),
  previewAdminSupportGrant: vi.fn(),
  confirmAdminSupportGrant: vi.fn(),
  previewAdminSupportGrantRevoke: vi.fn(),
  confirmAdminSupportGrantRevoke: vi.fn(),
}));

import {
  confirmAdminSupportGrant,
  confirmAdminSupportGrantRevoke,
  fetchAdminSupportGrantLedger,
  previewAdminSupportGrant,
  previewAdminSupportGrantRevoke,
  searchAdminSupportSubjects,
} from "@/features/platform-admin/api/platform-admin-support-api";

const target: AdminSupportSearchResult = {
  subjectId: "00000000-0000-4000-8000-000000006001",
  displayName: "지원 대상",
  maskedEmail: "su***@example.com",
  kind: "USER",
  platformAdminRole: null,
  platformAdminStatus: null,
  clubMembershipSummary: [],
  grantEligible: true,
  grantBlockedReason: null,
};

const grant: AdminSupportGrantLedgerItem = {
  grantId: "00000000-0000-4000-8000-000000006002",
  clubId: "club-1",
  clubName: "읽는사이",
  granteeDisplayName: "지원 대상",
  granteeMaskedEmail: "su***@example.com",
  scope: "HOST_SUPPORT_READ",
  reasonCategory: "MEMBER_ASSISTANCE",
  notePresent: true,
  expiresAt: "2026-08-25T12:00:00Z",
  createdAt: "2026-08-25T10:00:00Z",
  revokedAt: null,
  status: "ACTIVE",
  createdByRole: "OWNER",
};

function LocationProbe() {
  return <output aria-label="location">{useLocation().search}</output>;
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function renderRoute(options: { canManage?: boolean; pages?: AdminSupportGrantLedgerItem[][] } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities: ["VIEW_SUPPORT", ...(options.canManage === false ? [] : ["MANAGE_SUPPORT_ACCESS"])],
    generatedAt: "2026-08-25T00:00:00Z",
  });
  client.setQueryData(platformAdminClubsQuery().queryKey, {
    items: [{ clubId: "club-1", name: "읽는사이" }],
  });
  const pages = options.pages ?? [[grant]];
  client.setQueryData(platformAdminSupportLedgerInfiniteQuery({ clubId: "club-1" }).queryKey, {
    pages: pages.map((items, index) => ({ items, nextCursor: index < pages.length - 1 ? `cursor-${index + 2}` : null })),
    pageParams: pages.map((_, index) => (index === 0 ? undefined : `cursor-${index + 1}`)),
  });

  const router = createMemoryRouter([
    {
      path: "/admin/support",
      element: <><AdminSupportRoute /><LocationProbe /></>,
    },
    {
      path: "/admin/other",
      element: <p>Other admin route</p>,
    },
  ], { initialEntries: ["/admin/support?clubId=club-1"] });

  return {
    client,
    router,
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

describe("AdminSupportRoute", () => {
  beforeAll(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: memoryStorage() });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAdminSupportGrantLedger).mockResolvedValue({ items: [grant], nextCursor: null });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps private search values out of URL, storage, query keys and serialized mutation state", async () => {
    vi.mocked(searchAdminSupportSubjects).mockResolvedValue([target]);
    const { client } = renderRoute();
    const privateQuery = "private.member@example.com";

    fireEvent.change(screen.getByRole("searchbox", { name: "지원 대상 검색" }), { target: { value: privateQuery } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByRole("button", { name: /지원 대상/ })).toBeInTheDocument();
    expect(searchAdminSupportSubjects).toHaveBeenCalledWith(privateQuery, "club-1");
    expect(screen.getByLabelText("location")).toHaveTextContent("clubId=club-1");
    const persisted = JSON.stringify({
      queryKeys: client.getQueryCache().getAll().map((query) => query.queryKey),
      mutations: client.getMutationCache().getAll().map((mutation) => mutation.state.variables),
      localStorage: { ...window.localStorage },
      sessionStorage: { ...window.sessionStorage },
    });
    expect(persisted).not.toContain(privateQuery);
    expect(persisted).not.toContain(target.subjectId);
  });

  it("retries an ambiguous create confirmation with the same identity and renders an immutable receipt", async () => {
    vi.mocked(searchAdminSupportSubjects).mockResolvedValue([target]);
    vi.mocked(previewAdminSupportGrant).mockResolvedValue({
      previewId: "preview-1",
      commandType: "CREATE",
      grantId: null,
      clubId: "club-1",
      scope: "HOST_SUPPORT_READ",
      grantExpiresAt: "2026-08-25T12:00:00Z",
      reasonCategory: "MEMBER_ASSISTANCE",
      notePresent: true,
      impactCodes: ["GRANT_SUPPORT_ACCESS"],
      expiresAt: "2026-08-25T10:10:00Z",
      fingerprintPrefix: "00112233",
    });
    vi.mocked(confirmAdminSupportGrant)
      .mockRejectedValueOnce(Object.assign(new Error("pending"), { code: "COMMAND_IN_PROGRESS" }))
      .mockResolvedValueOnce({
        receiptId: "receipt-1",
        previewId: "preview-1",
        commandType: "CREATE",
        grantId: grant.grantId,
        clubId: "club-1",
        scope: "HOST_SUPPORT_READ",
        grantExpiresAt: "2026-08-25T12:00:00Z",
        reasonCategory: "MEMBER_ASSISTANCE",
        notePresent: true,
        beforeStatus: "ABSENT",
        afterStatus: "ACTIVE",
        outcome: "SUCCEEDED",
        createdAt: "2026-08-25T10:00:00Z",
      });
    const { router } = renderRoute();

    fireEvent.change(screen.getByRole("searchbox", { name: "지원 대상 검색" }), { target: { value: "private name" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByRole("button", { name: /지원 대상/ }));
    fireEvent.change(screen.getByLabelText("선택 사유"), { target: { value: "MEMBER_ASSISTANCE" } });
    fireEvent.change(screen.getByLabelText("검토 시에만 확인하는 사유 메모 (저장되지 않음)"), { target: { value: "raw private note" } });
    fireEvent.click(screen.getByRole("button", { name: "발급 검토" }));
    expect(await screen.findByText(/GRANT_SUPPORT_ACCESS/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "지원 접근 발급" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("같은 요청");
    await act(() => router.navigate("/admin/other"));
    expect(router.state.location.pathname).toBe("/admin/support");
    fireEvent.click(screen.getByRole("button", { name: "지원 접근 발급" }));

    expect(await screen.findByRole("region", { name: "명령 기록" })).toHaveTextContent("receipt-1");
    const calls = vi.mocked(confirmAdminSupportGrant).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0].idempotencyKey).toBe(calls[1]?.[0].idempotencyKey);
    const receipt = screen.getByLabelText("명령 영수증");
    expect(within(receipt).getByText(/회원 지원/)).toBeInTheDocument();
    expect(within(receipt).getByText(/검토 시 사유 메모 사용/)).toBeInTheDocument();
    expect(screen.queryByText("raw private note")).not.toBeInTheDocument();
    expect(screen.queryByText(/내부 메모/)).not.toBeInTheDocument();
    const timeline = screen.getByRole("region", { name: "명령 기록" });
    expect(timeline).toHaveTextContent("receipt-1");
    expect(timeline.querySelector(".admin-receipt-timeline__convergence")).toBeNull();
  });

  it("deduplicates cursor boundaries and clears private command state on authority loss", async () => {
    vi.mocked(searchAdminSupportSubjects).mockResolvedValue([target]);
    const { client } = renderRoute({ pages: [[grant], [grant, { ...grant, grantId: "grant-2" }]] });

    expect(document.querySelectorAll(".admin-support-workbench__ledger-row")).toHaveLength(2);
    fireEvent.change(screen.getByRole("searchbox", { name: "지원 대상 검색" }), { target: { value: "private name" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByRole("button", { name: /지원 대상/ }));
    expect(screen.getByRole("heading", { name: "지원 접근 권한 발급" })).toBeInTheDocument();

    act(() => purgePlatformAdminState(client));
    expect(screen.queryByRole("heading", { name: "지원 접근 권한 발급" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "지원 대상 검색" })).toHaveValue("");
  });

  it("previews revoke and preserves the same identity while its result is ambiguous", async () => {
    vi.mocked(previewAdminSupportGrantRevoke).mockResolvedValue({
      previewId: "revoke-preview-1",
      commandType: "REVOKE",
      grantId: grant.grantId,
      clubId: grant.clubId,
      scope: grant.scope,
      grantExpiresAt: grant.expiresAt,
      reasonCategory: "MEMBER_ASSISTANCE",
      notePresent: false,
      impactCodes: ["REVOKE_SUPPORT_ACCESS"],
      expiresAt: "2026-08-25T10:10:00Z",
      fingerprintPrefix: "00112233",
    });
    vi.mocked(confirmAdminSupportGrantRevoke)
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({
        receiptId: "revoke-receipt-1",
        previewId: "revoke-preview-1",
        commandType: "REVOKE",
        grantId: grant.grantId,
        clubId: grant.clubId,
        scope: grant.scope,
        grantExpiresAt: grant.expiresAt,
        reasonCategory: "MEMBER_ASSISTANCE",
        notePresent: false,
        beforeStatus: "ACTIVE",
        afterStatus: "REVOKED",
        outcome: "SUCCEEDED",
        createdAt: "2026-08-25T10:00:00Z",
      });
    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "권한 취소 검토" }));
    fireEvent.click(screen.getByRole("button", { name: "취소 검토" }));
    expect(await screen.findByText("REVOKE_SUPPORT_ACCESS")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("같은 요청");
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));

    expect(await screen.findByRole("region", { name: "명령 기록" })).toHaveTextContent("revoke-receipt-1");
    const calls = vi.mocked(confirmAdminSupportGrantRevoke).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1].idempotencyKey).toBe(calls[1]?.[1].idempotencyKey);
    expect(screen.getByRole("region", { name: "명령 기록" })).toHaveTextContent("revoke-receipt-1");
  });

  it("fails closed when the authoritative capability is absent", async () => {
    renderRoute({ canManage: false });
    expect(screen.getByText("현재 권한으로는 지원 접근 권한을 변경할 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "권한 취소 검토" })).not.toBeInTheDocument();
  });

  it("does not give SUPPORT a mutation from the role name without MANAGE_SUPPORT_ACCESS", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
    });
    client.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "SUPPORT",
      status: "ACTIVE",
      capabilities: ["VIEW_SUPPORT"],
      generatedAt: "2026-08-25T00:00:00Z",
    });
    client.setQueryData(platformAdminClubsQuery().queryKey, {
      items: [{ clubId: "club-1", name: "읽는사이" }],
    });
    client.setQueryData(platformAdminSupportLedgerInfiniteQuery({ clubId: "club-1" }).queryKey, {
      pages: [{ items: [grant], nextCursor: null }],
      pageParams: [undefined],
    });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={createMemoryRouter([
          { path: "/admin/support", element: <AdminSupportRoute /> },
        ], { initialEntries: ["/admin/support?clubId=club-1"] })} />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("button", { name: "권한 취소 검토" })).not.toBeInTheDocument();
    expect(previewAdminSupportGrant).not.toHaveBeenCalled();
    expect(confirmAdminSupportGrant).not.toHaveBeenCalled();
    expect(previewAdminSupportGrantRevoke).not.toHaveBeenCalled();
    expect(confirmAdminSupportGrantRevoke).not.toHaveBeenCalled();
  });

  it("clears an existing preview when the current capability is removed", async () => {
    vi.mocked(searchAdminSupportSubjects).mockResolvedValue([target]);
    vi.mocked(previewAdminSupportGrant).mockResolvedValue({
      previewId: "preview-1",
      commandType: "CREATE",
      grantId: null,
      clubId: "club-1",
      scope: "HOST_SUPPORT_READ",
      grantExpiresAt: "2026-08-25T12:00:00Z",
      reasonCategory: "MEMBER_ASSISTANCE",
      notePresent: false,
      impactCodes: ["GRANT_SUPPORT_ACCESS"],
      expiresAt: "2026-08-25T10:10:00Z",
      fingerprintPrefix: "00112233",
    });
    const { client } = renderRoute();
    fireEvent.change(screen.getByRole("searchbox", { name: "지원 대상 검색" }), { target: { value: "private name" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByRole("button", { name: /지원 대상/ }));
    fireEvent.click(screen.getByRole("button", { name: "발급 검토" }));
    expect(await screen.findByRole("button", { name: "지원 접근 발급" })).toBeInTheDocument();

    act(() => client.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_SUPPORT"],
      generatedAt: "2026-08-25T01:00:00Z",
    }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "지원 접근 발급" })).not.toBeInTheDocument());
    expect(screen.getByRole("searchbox", { name: "지원 대상 검색" })).toHaveValue("");
    expect(confirmAdminSupportGrant).not.toHaveBeenCalled();
  });

  it("purges private ledger cache when the support route is left", () => {
    const { client, unmount } = renderRoute();
    const key = platformAdminSupportLedgerInfiniteQuery({ clubId: "club-1" }).queryKey;
    expect(client.getQueryData(key)).toBeDefined();

    unmount();

    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("preserves existing ledger rows when loading a later page fails", async () => {
    const { client } = renderRoute();
    const query = client.getQueryCache().find({ queryKey: platformAdminSupportLedgerInfiniteQuery({ clubId: "club-1" }).queryKey });
    expect(query).toBeDefined();
    const ledgerRows = () => document.querySelectorAll(".admin-support-workbench__ledger-row");
    expect(ledgerRows()).toHaveLength(1);
    await waitFor(() => expect(ledgerRows()).toHaveLength(1));
  });
});
