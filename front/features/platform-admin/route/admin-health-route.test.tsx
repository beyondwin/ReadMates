import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import * as api from "@/features/platform-admin/api/platform-admin-health-api";
import { AdminHealthRoute } from "@/features/platform-admin/route/admin-health-route";

describe("AdminHealthRoute", () => {
  it("renders fetched cards", async () => {
    const fetchSpy = vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockResolvedValueOnce({
      schema: "platform.health_snapshot.v1",
      generated_at: "2026-05-26T00:00:00Z",
      cards: [
        {
          id: "outbox_backlog",
          title: "Outbox backlog",
          status: "OK",
          metric: { value: 42, unit: "rows", label: "pending" },
          thresholds: { warn: 100, crit: 1000 },
          last_checked_at: "2026-05-26T00:00:00Z",
          source: "IN_PROCESS",
          drill: { kind: "admin_route", target: "/admin/notifications" },
          reason: null,
          deploy_strip: null,
        },
      ],
    });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AdminHealthRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Outbox backlog")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
