import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AdminRouteDescriptor } from "@/features/platform-admin/model/admin-route-catalog";
import { AdminComingSoon } from "./admin-coming-soon";

const descriptor: AdminRouteDescriptor = {
  path: "health",
  label: "헬스",
  group: "today",
  groupLabel: "오늘/헬스",
  slice: "S2",
  status: "coming_soon",
  requiredCapability: "view_health",
  comingSoon: {
    title: "Platform Ops Health",
    summary: "DB · Redis · Kafka · AI provider · outbox · deploy 신호를 한 화면에서 봅니다.",
    bullets: ["a", "b", "c", "d"],
    docHref:
      "/docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md#s2--platform-ops-health--deploy-ledger",
  },
};

function renderWithRouter(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("AdminComingSoon", () => {
  it("renders the slice badge and title", () => {
    renderWithRouter(<AdminComingSoon descriptor={descriptor} />);
    expect(screen.getByText(/준비 중 · S2/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Platform Ops Health" })).toBeInTheDocument();
  });

  it("renders the summary text", () => {
    renderWithRouter(<AdminComingSoon descriptor={descriptor} />);
    expect(screen.getByText(/AI provider · outbox · deploy/)).toBeInTheDocument();
  });

  it("renders all bullets", () => {
    renderWithRouter(<AdminComingSoon descriptor={descriptor} />);
    for (const bullet of descriptor.comingSoon!.bullets) {
      expect(screen.getByText(bullet)).toBeInTheDocument();
    }
  });

  it("renders the doc link with the descriptor href", () => {
    renderWithRouter(<AdminComingSoon descriptor={descriptor} />);
    const link = screen.getByRole("link", { name: /로드맵에서 S2 자세히 보기/ });
    expect(link).toHaveAttribute("href", descriptor.comingSoon!.docHref);
  });
});
