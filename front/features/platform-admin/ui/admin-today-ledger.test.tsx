import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PlatformAdminWorkbenchView } from "@/features/platform-admin/model/platform-admin-workbench-model";
import { AdminTodayLedger } from "@/features/platform-admin/ui/admin-today-ledger";

const baseWorkbench: PlatformAdminWorkbenchView = {
  permissions: {
    canCreateClub: true,
    canUpdateClub: true,
    canManageDomains: true,
    canCreateSupportGrant: true,
    canRevokeSupportGrant: true,
    canForceCancelAiJob: true,
  },
  metrics: {
    platformRole: "OWNER",
    activeClubCount: 2,
    needsActionCount: 2,
    domainActionRequiredCount: 1,
    publishReadyCount: 1,
    operationsWarningCount: 1,
  },
  queueItems: [
    {
      id: "club-club-ready",
      type: "club",
      clubId: "club-ready",
      slug: "ready-club",
      name: "Ready Club",
      severity: "ready",
      reason: "공개 전환 조건을 충족했습니다.",
      primaryActionLabel: "공개 전환",
      badges: ["ACTIVE", "PRIVATE"],
      sortRank: 40,
      href: "/admin/clubs/club-ready",
    },
    {
      id: "notification-platform",
      type: "notification",
      clubId: null,
      slug: "platform",
      name: "알림 outbox",
      severity: "critical",
      reason: "실패/정체 신호 3건",
      primaryActionLabel: "알림 운영",
      badges: ["outbox", "delivery"],
      sortRank: 18,
      href: "/admin/notifications?focus=outbox_backlog",
    },
  ],
  selectedBrief: {
    item: {
      id: "notification-platform",
      type: "notification",
      clubId: null,
      slug: "platform",
      name: "알림 outbox",
      severity: "critical",
      reason: "실패/정체 신호 3건",
      primaryActionLabel: "알림 운영",
      badges: ["outbox", "delivery"],
      sortRank: 18,
      href: "/admin/notifications?focus=outbox_backlog",
    },
    club: null,
    domains: [],
    publishChecklist: [],
    primaryAction: {
      kind: "open-notifications",
      label: "알림 운영 열기",
      href: "/admin/notifications?focus=outbox_backlog",
      disabled: false,
      reason: null,
    },
    drillLinks: [
      { label: "알림 운영", href: "/admin/notifications?focus=outbox_backlog" },
      { label: "감사 로그", href: "/admin/audit" },
    ],
    permissionNote: null,
  },
};

function renderLedger(
  workbench: PlatformAdminWorkbenchView = baseWorkbench,
  onSelectItem = vi.fn(),
  selectedItemId: string | null = workbench.selectedBrief?.item.id ?? null,
) {
  return {
    onSelectItem,
    ...render(
      <MemoryRouter>
        <AdminTodayLedger
          workbench={workbench}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
        />
      </MemoryRouter>,
    ),
  };
}

describe("AdminTodayLedger", () => {
  it("renders the operations ledger summary, queue, and selected brief", () => {
    renderLedger();

    expect(screen.getByRole("heading", { name: "오늘 할 일" })).toBeInTheDocument();
    expect(screen.getByText("조치 필요 2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 작업 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "선택 항목 브리프" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "알림 운영 열기" })).toHaveAttribute(
      "href",
      "/admin/notifications?focus=outbox_backlog",
    );
  });

  it("emits item ids when a queue row is selected", async () => {
    const user = userEvent.setup();
    const { onSelectItem } = renderLedger();

    await user.click(screen.getByRole("button", { name: /Ready Club/ }));

    expect(onSelectItem).toHaveBeenCalledWith("club-club-ready");
  });

  it("marks the selected brief item active even before the URL has a selected parameter", () => {
    renderLedger(baseWorkbench, vi.fn(), null);

    expect(screen.getByRole("button", { name: /알림 outbox/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows permission notes and disabled primary actions", () => {
    renderLedger({
      ...baseWorkbench,
      selectedBrief: {
        ...baseWorkbench.selectedBrief!,
        primaryAction: {
          kind: "make-public",
          label: "공개 전환",
          href: "/admin/clubs/club-ready",
          disabled: true,
          reason: "현재 역할은 변경 작업을 실행할 수 없습니다.",
        },
        permissionNote: "현재 역할은 변경 작업을 실행할 수 없습니다.",
      },
    });

    expect(screen.getByText("현재 역할은 변경 작업을 실행할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공개 전환" })).toBeDisabled();
  });

  it("renders an honest empty state", () => {
    renderLedger({ ...baseWorkbench, queueItems: [], selectedBrief: null });

    const queue = screen.getByRole("region", { name: "운영 작업 큐" });
    expect(within(queue).getByText("오늘 처리할 플랫폼 작업이 없습니다.")).toBeInTheDocument();
  });

  it("uses stable class hooks for desktop and mobile responsive styling", () => {
    const { container } = renderLedger();

    expect(container.querySelector(".admin-today-ledger__columns")).toBeInTheDocument();
    expect(container.querySelector(".admin-work-queue__row")).toBeInTheDocument();
    expect(container.querySelector(".admin-selected-brief__links")).toBeInTheDocument();
  });
});
