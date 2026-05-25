import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdminRouteDescriptor } from "@/features/platform-admin/model/admin-route-catalog";
import { AdminComingSoon } from "@/features/platform-admin/ui/admin-coming-soon";
import { adminComingSoonLoader } from "./admin-coming-soon-data";

const descriptor: AdminRouteDescriptor = {
  path: "audit",
  label: "감사",
  group: "review",
  groupLabel: "감사/분석",
  slice: "S7",
  status: "coming_soon",
  requiredCapability: "view_audit",
  comingSoon: {
    title: "Audit / Activity ledger",
    summary: "통합 ledger 요약 문장.",
    bullets: ["a", "b", "c"],
    docHref: "/docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md#s7",
  },
};

describe("adminComingSoonLoader", () => {
  it("returns the descriptor passed in", async () => {
    const loader = adminComingSoonLoader(descriptor);
    await expect(loader()).resolves.toBe(descriptor);
  });
});

describe("AdminComingSoonRoute (view)", () => {
  // The route component is a thin passthrough: it reads the descriptor from useLoaderData()
  // and renders <AdminComingSoon descriptor={descriptor} />. We assert the view by rendering
  // AdminComingSoon directly here; the loader contract is covered above. This avoids the
  // AbortSignal mismatch when createMemoryRouter is initialised under the node test env.
  it("renders the descriptor coming-soon block", () => {
    render(<AdminComingSoon descriptor={descriptor} />);
    expect(screen.getByRole("heading", { name: "Audit / Activity ledger" })).toBeInTheDocument();
    for (const bullet of descriptor.comingSoon!.bullets) {
      expect(screen.getByText(bullet)).toBeInTheDocument();
    }
  });
});
