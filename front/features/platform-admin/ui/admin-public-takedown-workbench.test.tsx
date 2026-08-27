import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminTakedownState } from "../model/platform-admin-takedown-model";
import { AdminPublicTakedownWorkbench } from "./admin-public-takedown-workbench";

const LEDGER_CSS = readFileSync(
  path.resolve("features/platform-admin/ui/admin-editorial-ledger.css"),
  "utf8",
);

const preview = {
  schema: "admin.public_takedown.preview.v1" as const,
  previewId: "40000000-0000-4000-8000-000000000004",
  expiresAt: "2026-08-26T04:05:00Z",
  clubId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000002",
  publicationId: "30000000-0000-4000-8000-000000000003",
  targetGeneration: 17,
  currentSurfaces: ["PUBLIC_CLUB", "PUBLIC_SESSION"],
  limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN" as const,
};

const receipt = {
  schema: "admin.public_takedown.receipt.v1" as const,
  receiptId: "50000000-0000-4000-8000-000000000005",
  convergenceId: "60000000-0000-4000-8000-000000000006",
  clubId: preview.clubId,
  sessionId: preview.sessionId,
  publicationId: preview.publicationId,
  originResult: "DENIED" as const,
  committedGeneration: 18,
  committedClubGeneration: 9,
  reasonCategory: "PRIVACY",
  createdAt: "2026-08-26T04:01:00Z",
  limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN" as const,
};

function renderWorkbench(state: AdminTakedownState, overrides = {}) {
  const props = {
    canOperate: true,
    state,
    pending: false,
    error: null,
    onPreview: vi.fn(),
    onConfirm: vi.fn(),
    onRetryConvergence: vi.fn(),
    ...overrides,
  };
  return { ...render(<AdminPublicTakedownWorkbench {...props} />), props };
}

describe("AdminPublicTakedownWorkbench", () => {
  it("denies a capability-less actor without rendering the emergency mutation form", () => {
    renderWorkbench({ kind: "idle" }, { canOperate: false });
    expect(screen.getByText("운영 · 긴급 공개 회수")).toBeInTheDocument();
    expect(screen.getByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
  });

  it("shows exact target, current surfaces, generation, limitation, and one primary confirm", () => {
    const { props, container } = renderWorkbench({ kind: "preview", preview });
    expect(screen.getByText("운영 · 긴급 공개 회수")).toBeInTheDocument();
    expect(screen.getByText(preview.clubId)).toBeInTheDocument();
    expect(screen.getByText(preview.sessionId)).toBeInTheDocument();
    expect(screen.getByText(preview.publicationId)).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("PUBLIC_CLUB")).toBeInTheDocument();
    expect(screen.getByText("PUBLIC_SESSION")).toBeInTheDocument();
    expect(screen.getByText(/저장하거나 오프라인으로 보관한 사본/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PRIVACY · 개인정보" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SECURITY · 보안" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "LEGAL · 법적 요청" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CONTENT_POLICY · 콘텐츠 정책" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /SAFETY|OTHER/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));
    expect(screen.getByRole("alert")).toHaveTextContent("회수 사유를 입력해 주세요.");
    expect(props.onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("회수 사유"), { target: { value: "  개인정보 삭제 요청 확인  " } });
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));
    expect(props.onConfirm).toHaveBeenCalledWith({ reasonCategory: "PRIVACY", reason: "개인정보 삭제 요청 확인" });
  });

  it("renders an immutable receipt separately from the convergence timeline", () => {
    renderWorkbench({
      kind: "convergence-failed",
      receipt,
      convergence: {
        schema: "admin.public_takedown.convergence.v1",
        convergenceId: receipt.convergenceId,
        originResult: "DENIED",
        committedGeneration: 18,
        status: "FAILED",
        lastAttemptAt: "2026-08-26T04:02:00Z",
        retryable: true,
        attempts: [{ attemptNo: 1, status: "FAILED", observedAt: "2026-08-26T04:02:00Z", resultCategory: "TEMPORARY_FAILURE" }],
      },
    });

    expect(screen.getByRole("region", { name: "변경 불가 회수 영수증" })).toHaveTextContent(receipt.receiptId);
    expect(screen.getByRole("region", { name: "전파 수렴 타임라인" })).toHaveTextContent("시도 1");
    expect(screen.getAllByText("원본 접근 차단 완료")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "전파 다시 시도" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "긴급 회수 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "명령 기록" })).toHaveTextContent(receipt.receiptId);
    expect(document.querySelector(".admin-safe-action-dock")).toHaveAttribute("data-level", "L3");
  });

  it("renders an L3 receipt timeline with convergence only after an actual receipt", () => {
    const { rerender } = renderWorkbench({ kind: "preview", preview });

    expect(document.querySelector(".admin-safe-action-dock")).toHaveAttribute("data-level", "L3");
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    expect(screen.queryByText("공개 반영 추적")).not.toBeInTheDocument();

    rerender(
      <AdminPublicTakedownWorkbench
        canOperate
        state={{
          kind: "origin-denied",
          receipt,
          convergence: {
            schema: "admin.public_takedown.convergence.v1",
            convergenceId: receipt.convergenceId,
            originResult: "DENIED",
            committedGeneration: 18,
            status: "PENDING",
            lastAttemptAt: "2026-08-26T04:01:01Z",
            retryable: false,
            attempts: [{ attemptNo: 1, status: "PENDING", observedAt: "2026-08-26T04:01:01Z", resultCategory: null }],
          },
        }}
        pending={false}
        error={null}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onRetryConvergence={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "명령 기록" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "전파 수렴 타임라인" })).toHaveTextContent("시도 1");
  });

  it("locks 44px targets and reduced motion in the scoped takedown stylesheet", () => {
    expect(LEDGER_CSS).toMatch(/\.admin-public-takedown[\s\S]*min-height:\s*44px/);
    expect(LEDGER_CSS).toContain(".admin-public-takedown");
    expect(LEDGER_CSS).toContain(":focus-visible");
    expect(LEDGER_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.admin-public-takedown[\s\S]*animation-duration:\s*0\.01ms/,
    );
    expect(LEDGER_CSS).not.toMatch(/backdrop-filter|linear-gradient/);
  });
});
