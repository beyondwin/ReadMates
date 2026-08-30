import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import previewFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-preview.server.json";
import receiptFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-receipt.server.json";
import {
  parseAdminTakedownPreview,
  parseAdminTakedownReceipt,
} from "../api/platform-admin-takedown-contracts";
import type { AdminTakedownState } from "../model/platform-admin-takedown-model";
import { AdminPublicTakedownWorkbench } from "./admin-public-takedown-workbench";

const LEDGER_CSS = readFileSync(path.resolve("features/platform-admin/ui/admin-editorial-ledger.css"), "utf8");
const blockedPreview = parseAdminTakedownPreview(previewFixture);
const enabledPreview = { ...blockedPreview, confirmEnabled: true, activationBoundary: "ACTIVE" };
const receipt = parseAdminTakedownReceipt(receiptFixture);

function renderWorkbench(state: AdminTakedownState, overrides = {}) {
  const props = {
    canOperate: true,
    state,
    pending: false,
    error: null,
    onPreview: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  return { ...render(<AdminPublicTakedownWorkbench {...props} />), props };
}

describe("AdminPublicTakedownWorkbench", () => {
  it("denies a capability-less actor without rendering the emergency mutation form", () => {
    renderWorkbench({ kind: "idle" }, { canOperate: false });
    expect(screen.getByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
  });

  it("honors server confirmEnabled=false and exposes the activation boundary", () => {
    const { props } = renderWorkbench({ kind: "preview", preview: blockedPreview });
    expect(screen.getByText(blockedPreview.remoteCopyLimitation)).toBeInTheDocument();
    expect(screen.getAllByText(blockedPreview.activationBoundary)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "긴급 회수 확인" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("translates all four server reason categories and confirms normalized input", () => {
    const { props } = renderWorkbench({ kind: "preview", preview: enabledPreview });
    expect(screen.getByRole("option", { name: "PRIVATE_DATA · 개인정보" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "LEGAL_REQUEST · 법적 요청" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SECURITY_INCIDENT · 보안 사고" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PUBLIC_SAFETY · 공공 안전" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("회수 사유"), { target: { value: "  개인정보 삭제 요청 확인  " } });
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));
    expect(props.onConfirm).toHaveBeenCalledWith({ reasonCategory: "PRIVATE_DATA", reason: "개인정보 삭제 요청 확인" });
  });

  it("renders immutable server receipt outcomes without convergence GET or retry UI", () => {
    renderWorkbench({ kind: "origin-denied", receipt });
    const region = screen.getByRole("region", { name: "변경 불가 회수 영수증" });
    expect(region).toHaveTextContent(receipt.receiptId);
    expect(region).toHaveTextContent("사유 본문 비공개예");
    expect(region).toHaveTextContent(receipt.bffEvictionOutcome);
    expect(region).toHaveTextContent(receipt.cdnPurgeOutcome);
    expect(region).toHaveTextContent(receipt.browserRevalidationOutcome);
    expect(region).toHaveTextContent(receipt.remoteCopyLimitation);
    expect(screen.getByRole("region", { name: "명령 기록" })).toHaveTextContent("CDN purge");
    expect(screen.queryByRole("button", { name: /전파.*시도/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "전파 수렴 타임라인" })).not.toBeInTheDocument();
  });

  it("locks 44px targets and reduced motion in the scoped takedown stylesheet", () => {
    expect(LEDGER_CSS).toMatch(/\.admin-public-takedown[\s\S]*min-height:\s*44px/);
    expect(LEDGER_CSS).toContain(":focus-visible");
    expect(LEDGER_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.admin-public-takedown[\s\S]*animation-duration:\s*0\.01ms/);
    expect(LEDGER_CSS).not.toMatch(/backdrop-filter|linear-gradient/);
  });
});
