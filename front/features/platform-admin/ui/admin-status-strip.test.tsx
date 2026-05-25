import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AdminStripMetrics } from "@/features/platform-admin/model/admin-status-strip-model";
import { AdminStatusStrip } from "./admin-status-strip";

function renderStrip(props: { metrics: AdminStripMetrics; error?: boolean }) {
  return render(
    <MemoryRouter>
      <AdminStatusStrip {...props} />
    </MemoryRouter>,
  );
}

const baseMetrics: AdminStripMetrics = {
  platformRole: "OWNER",
  setupRequiredCount: 0,
  readyToPublishCount: 0,
  domainActionRequiredCount: 0,
};

describe("AdminStatusStrip", () => {
  it("renders the role badge", () => {
    renderStrip({ metrics: { ...baseMetrics, platformRole: "OPERATOR" } });
    expect(screen.getByText("OPERATOR")).toBeInTheDocument();
  });

  it("links each count card to the today route with the corresponding filter", () => {
    renderStrip({
      metrics: { ...baseMetrics, setupRequiredCount: 2, readyToPublishCount: 1, domainActionRequiredCount: 3 },
    });
    expect(screen.getByRole("link", { name: /조치 필요 클럽/ })).toHaveAttribute(
      "href",
      "/admin/today?filter=setup_required",
    );
    expect(screen.getByRole("link", { name: /공개 준비/ })).toHaveAttribute(
      "href",
      "/admin/today?filter=ready_to_publish",
    );
    expect(screen.getByRole("link", { name: /도메인 조치/ })).toHaveAttribute(
      "href",
      "/admin/today?filter=domain_action",
    );
  });

  it("highlights count cards when the count is at least 1", () => {
    const { container } = renderStrip({ metrics: { ...baseMetrics, setupRequiredCount: 1 } });
    const highlighted = container.querySelector(".admin-status-strip__card--highlight");
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toContain("조치 필요 클럽");
  });

  it("falls back to a single error card when error=true", () => {
    renderStrip({ metrics: baseMetrics, error: true });
    expect(screen.getByText("상태를 확인할 수 없습니다 · 재시도")).toBeInTheDocument();
    expect(screen.queryByText("OWNER")).not.toBeInTheDocument();
  });
});
