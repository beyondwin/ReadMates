import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";

vi.mock("@/features/platform-admin/api/platform-admin-takedown-api", () => ({
  confirmAdminPublicTakedown: vi.fn(),
  fetchAdminTakedownConvergence: vi.fn(),
  previewAdminPublicTakedown: vi.fn(),
  retryAdminTakedownConvergence: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-api")>()),
  fetchPlatformAdminSummary: vi.fn(),
}));

import { fetchPlatformAdminSummary } from "@/features/platform-admin/api/platform-admin-api";
import { previewAdminPublicTakedown } from "@/features/platform-admin/api/platform-admin-takedown-api";
import { AdminPublicTakedownRoute } from "./admin-public-takedown-route";

const summary = {
  platformRole: "OPERATOR" as const,
  activeClubCount: 1,
  domainActionRequiredCount: 0,
  domains: [],
  domainsRequiringAction: [],
};

function renderRoute(role = summary.platformRole) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(platformAdminSummaryQuery().queryKey, { ...summary, platformRole: role });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/public-takedown"]}>
        <AdminPublicTakedownRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("AdminPublicTakedownRoute", () => {
  it("keeps the system-admin workbench and previews the exact entered UUID target", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue({
      schema: "admin.public_takedown.preview.v1",
      previewId: "40000000-0000-4000-8000-000000000004",
      expiresAt: "2026-08-26T04:05:00Z",
      clubId: "10000000-0000-4000-8000-000000000001",
      sessionId: "20000000-0000-4000-8000-000000000002",
      publicationId: "30000000-0000-4000-8000-000000000003",
      targetGeneration: 17,
      currentSurfaces: ["PUBLIC_CLUB", "PUBLIC_SESSION"],
      limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
    });
    renderRoute();

    fireEvent.change(screen.getByLabelText("클럽 ID"), { target: { value: "10000000-0000-4000-8000-000000000001" } });
    fireEvent.change(screen.getByLabelText("모임 ID"), { target: { value: "20000000-0000-4000-8000-000000000002" } });
    fireEvent.change(screen.getByLabelText("공개 기록 ID"), { target: { value: "30000000-0000-4000-8000-000000000003" } });
    fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));

    await waitFor(() => expect(previewAdminPublicTakedown).toHaveBeenCalledWith({
      clubId: "10000000-0000-4000-8000-000000000001",
      sessionId: "20000000-0000-4000-8000-000000000002",
      publicationId: "30000000-0000-4000-8000-000000000003",
    }));
    expect(screen.queryByLabelText(/클럽 선택/)).not.toBeInTheDocument();
  });

  it("fails closed for SUPPORT", () => {
    renderRoute("SUPPORT");
    expect(screen.getByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
  });

  it("does not throw or expose the mutation form before summary has loaded", () => {
    vi.mocked(fetchPlatformAdminSummary).mockImplementation(() => new Promise(() => undefined));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    expect(() =>
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/admin/public-takedown"]}>
            <AdminPublicTakedownRoute />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByRole("heading", { name: "긴급 공개 회수" })).toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
  });

  it("fails closed when the summary projection cannot be loaded", async () => {
    vi.mocked(fetchPlatformAdminSummary).mockRejectedValue(new Error("summary unavailable"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin/public-takedown"]}>
          <AdminPublicTakedownRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
  });
});
