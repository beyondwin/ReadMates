import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminTakedownState } from "../model/platform-admin-takedown-model";
import { AdminPublicTakedownWorkbench } from "./admin-public-takedown-workbench";

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
    role: "OWNER" as const,
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
  it("denies SUPPORT without rendering the emergency mutation form", () => {
    renderWorkbench({ kind: "idle" }, { role: "SUPPORT" });
    expect(screen.getByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
  });

  it("shows exact target, current surfaces, generation, limitation, and one primary confirm", () => {
    const { props, container } = renderWorkbench({ kind: "preview", preview });
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
  });
});
