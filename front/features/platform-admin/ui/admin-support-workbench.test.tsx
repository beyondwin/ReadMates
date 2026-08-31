import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminSupportWorkbench } from "./admin-support-workbench";

const grant = {
  grantId: "grant-1",
  clubId: "club-1",
  clubName: "읽는사이",
  granteeDisplayName: "지원 대상",
  granteeMaskedEmail: "s***@example.com",
  scope: "HOST_SUPPORT_READ" as const,
  reasonCategory: "MEMBER_ASSISTANCE" as const,
  notePresent: true,
  expiresAt: "2026-08-25T12:00:00Z",
  createdAt: "2026-08-25T10:00:00Z",
  revokedAt: null,
  status: "ACTIVE" as const,
  createdByRole: "OWNER",
};

const selected = {
  subjectId: "subject-1",
  displayName: "지원 대상",
  maskedEmail: "s***@example.com",
  kind: "USER",
  platformAdminRole: null,
  platformAdminStatus: null,
  clubMembershipSummary: [],
  grantEligible: true,
  grantBlockedReason: null,
};

const createPreview = {
  previewId: "preview-1",
  commandType: "CREATE" as const,
  grantId: null,
  clubId: "club-1",
  scope: "HOST_SUPPORT_READ" as const,
  grantExpiresAt: "2026-08-25T12:00:00Z",
  reasonCategory: "MEMBER_ASSISTANCE" as const,
  notePresent: false,
  impactCodes: ["GRANT_SUPPORT_ACCESS"],
  expiresAt: "2026-08-25T10:10:00Z",
  fingerprintPrefix: "00112233",
};

function props(overrides: Partial<ComponentProps<typeof AdminSupportWorkbench>> = {}): ComponentProps<typeof AdminSupportWorkbench> {
  return {
    clubs: [{ clubId: "club-1", name: "읽는사이" }],
    selectedClubId: "club-1",
    status: "",
    canManage: true,
    latestReceipt: null,
    search: { query: "", results: [], selected: null, hasSearched: false, pending: false, error: null, onQueryChange: vi.fn(), onSubmit: vi.fn(), onSelect: vi.fn(), onClear: vi.fn() },
    create: { reasonCategory: "MEMBER_ASSISTANCE", note: "", expiresAt: "2026-08-25T12:00", preview: null, receipt: null, recovery: null, previewPending: false, confirmPending: false, outcomeUnknown: false, onReasonCategoryChange: vi.fn(), onNoteChange: vi.fn(), onExpiresAtChange: vi.fn(), onPreview: vi.fn(), onConfirm: vi.fn(), onReset: vi.fn() },
    ledger: { items: [grant], pending: false, error: null, nextPageError: false, hasNextPage: false, loadingMore: false, onRetry: vi.fn(), onLoadMore: vi.fn() },
    revoke: { target: null, reasonCategory: "MEMBER_ASSISTANCE", note: "", preview: null, receipt: null, recovery: null, previewPending: false, confirmPending: false, outcomeUnknown: false, onStart: vi.fn(), onCancel: vi.fn(), onReasonCategoryChange: vi.fn(), onNoteChange: vi.fn(), onPreview: vi.fn(), onConfirm: vi.fn() },
    onClubChange: vi.fn(),
    onStatusChange: vi.fn(),
    ...overrides,
  };
}

describe("AdminSupportWorkbench", () => {
  it("renders the page-context heading 지원 접근", () => {
    render(<AdminSupportWorkbench {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "지원 접근" })).toBeInTheDocument();
    expect(screen.getByText("처리 기록")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders the grant creator role as Korean primary copy and raw only in technical disclosure", () => {
    const { container } = render(<AdminSupportWorkbench {...props()} />);
    expect(screen.getByText(/처리 역할: 소유자/)).toBeInTheDocument();
    expect(container.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("OWNER");
  });

  it("disables the issue button when reason or expiry is missing", () => {
    const { rerender } = render(<AdminSupportWorkbench {...props({
      search: { ...props().search, selected },
      create: { ...props().create, reasonCategory: "" as "MEMBER_ASSISTANCE", expiresAt: "2026-08-25T12:00" },
    })} />);
    expect(screen.getByRole("button", { name: "발급 검토" })).toBeDisabled();

    rerender(<AdminSupportWorkbench {...props({
      search: { ...props().search, selected },
      create: { ...props().create, reasonCategory: "MEMBER_ASSISTANCE", expiresAt: "" },
    })} />);
    expect(screen.getByRole("button", { name: "발급 검토" })).toBeDisabled();

    rerender(<AdminSupportWorkbench {...props({
      search: { ...props().search, selected },
      create: { ...props().create, reasonCategory: "MEMBER_ASSISTANCE", expiresAt: "2026-08-25T12:00" },
    })} />);
    expect(screen.getByRole("button", { name: "발급 검토" })).toBeEnabled();
  });

  it("labels the L2 confirm button with the action sentence 지원 접근 발급", () => {
    render(<AdminSupportWorkbench {...props({
      search: { ...props().search, selected },
      create: { ...props().create, preview: createPreview },
    })} />);

    const dock = screen.getByRole("group", { name: "작업" });
    expect(dock.closest("[data-level]")).toHaveAttribute("data-level", "L2");
    expect(within(dock).getByRole("button", { name: "지원 접근 발급" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "발급 확정" })).not.toBeInTheDocument();
  });

  it("keeps search accessible and has no unnamed controls", () => {
    const { container } = render(<AdminSupportWorkbench {...props()} />);
    expect(screen.getByRole("searchbox", { name: "지원 대상 검색" })).toBeInTheDocument();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("keeps prior ledger rows visible beside a later-page recovery action", async () => {
    const onLoadMore = vi.fn();
    render(<AdminSupportWorkbench {...props({ ledger: { ...props().ledger, nextPageError: true, hasNextPage: true, onLoadMore } })} />);
    expect(document.querySelectorAll(".admin-support-workbench__ledger-row")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("현재 목록은 유지됩니다");
    await userEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("shows Korean grant status labels in a sentence ledger row", () => {
    render(<AdminSupportWorkbench {...props()} />);
    const ledger = document.querySelector(".admin-support-workbench__ledger")
      ?? document.querySelector(".admin-evidence-ledger");
    expect(ledger).not.toBeNull();
    expect(within(ledger!).getByText(/읽는사이에서 지원 대상에게 지원 접근을 발급함/)).toBeInTheDocument();
    expect(within(ledger!).getByText(/활성/)).toBeInTheDocument();
    expect(within(ledger!).queryByText(/\bACTIVE\b/)).toBeNull();
    expect(within(ledger!).queryByText(/\bMEMBER_ASSISTANCE\b/)).toBeNull();
  });

  it("starts revoke review only when the current capability permits it", async () => {
    const onStart = vi.fn();
    const { rerender } = render(<AdminSupportWorkbench {...props({ revoke: { ...props().revoke, onStart } })} />);
    await userEvent.click(screen.getByRole("button", { name: "권한 취소 검토" }));
    expect(onStart).toHaveBeenCalledWith(grant);

    rerender(<AdminSupportWorkbench {...props({ canManage: false })} />);
    expect(screen.queryByRole("button", { name: "권한 취소 검토" })).not.toBeInTheDocument();
    expect(screen.getByText("현재 권한으로는 지원 접근 권한을 변경할 수 없습니다.")).toBeInTheDocument();
  });

  it("disables existing create and revoke confirmations after capability loss", () => {
    render(<AdminSupportWorkbench {...props({
      canManage: false,
      search: { ...props().search, selected },
      create: { ...props().create, preview: createPreview },
      revoke: { ...props().revoke, target: grant, preview: { ...createPreview, commandType: "REVOKE", grantId: grant.grantId, impactCodes: ["REVOKE_SUPPORT_ACCESS"] } },
    })} />);

    expect(screen.getByRole("button", { name: "지원 접근 발급" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소 확정" })).toBeDisabled();
  });

  it("shows only safe receipt evidence after completion", () => {
    render(<AdminSupportWorkbench {...props({ latestReceipt: {
      receiptId: "receipt-1", previewId: "preview-1", commandType: "CREATE", grantId: "grant-1", clubId: "club-1", scope: "HOST_SUPPORT_READ", grantExpiresAt: "2026-08-25T12:00:00Z", reasonCategory: "MEMBER_ASSISTANCE", notePresent: true, beforeStatus: "ABSENT", afterStatus: "ACTIVE", outcome: "SUCCEEDED", createdAt: "2026-08-25T10:00:00Z",
    } })} />);
    const receipt = screen.getByLabelText("명령 영수증");
    expect(receipt).toHaveTextContent("receipt-1");
    expect(receipt).toHaveTextContent("완료");
    expect(receipt).toHaveTextContent("없음 → 활성");
    const primaryReceiptText = Array.from(receipt.querySelectorAll(":scope > p")).map((node) => node.textContent).join(" ");
    expect(primaryReceiptText).not.toContain("SUCCEEDED");
    expect(primaryReceiptText).not.toContain("ABSENT");
    expect(primaryReceiptText).not.toContain("ACTIVE");
    const disclosure = receipt.querySelector("[data-admin-technical-disclosure]");
    expect(disclosure).toHaveAttribute("aria-label", "기술 정보");
    expect(disclosure).toHaveTextContent("SUCCEEDED");
    expect(disclosure).toHaveTextContent("ABSENT");
    expect(disclosure).toHaveTextContent("ACTIVE");
    expect(receipt).toHaveTextContent("검토 시 사유 메모 사용");
    expect(receipt).not.toHaveTextContent("raw private note");
    expect(screen.queryByText(/내부 메모/)).not.toBeInTheDocument();
    const timeline = screen.getByRole("region", { name: "명령 기록" });
    expect(timeline).toHaveTextContent("receipt-1");
    expect(timeline).toHaveTextContent("발급 완료");
    expect(timeline).toHaveTextContent("없음 → 활성");
    expect(timeline).not.toHaveTextContent("SUCCEEDED");
    expect(timeline.querySelector(".admin-receipt-timeline__convergence")).toBeNull();
  });

  it("keeps the optional reason note as review-time-only copy", () => {
    render(<AdminSupportWorkbench {...props({
      search: { ...props().search, selected },
    })} />);
    expect(screen.getByLabelText("검토 시에만 확인하는 사유 메모 (저장되지 않음)")).toBeInTheDocument();
    expect(screen.queryByLabelText("내부 메모 (선택)")).not.toBeInTheDocument();
    expect(screen.queryByText(/오래 보관/)).not.toBeInTheDocument();
  });

  it("does not render an L2 timeline before an actual grant or revoke receipt", () => {
    render(<AdminSupportWorkbench {...props()} />);
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
  });
});
