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

const EMERGENCY_CSS = readFileSync(path.resolve("features/platform-admin/ui/admin-emergency-lane.css"), "utf8");
const blockedPreview = parseAdminTakedownPreview(previewFixture);
const enabledPreview = { ...blockedPreview, confirmEnabled: true, activationBoundary: "ACTIVE" };
const receipt = parseAdminTakedownReceipt(receiptFixture);

function renderWorkbench(state: AdminTakedownState, overrides = {}) {
  const props = {
    canOperate: true,
    state,
    pending: false,
    error: null,
    desktopHandoff: {
      href: "/admin/public-takedown",
      status: "idle" as const,
      onCopy: vi.fn(),
    },
    onPreview: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  return { ...render(<AdminPublicTakedownWorkbench {...props} />), props };
}

describe("AdminPublicTakedownWorkbench", () => {
  it("denies a capability-less actor without rendering the emergency mutation form", () => {
    renderWorkbench({ kind: "idle" }, { canOperate: false });
    expect(screen.getByText("이 작업을 실행할 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/OWNER|OPERATOR|capability/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
  });

  it("keeps compact desktop handoff primary without hiding the direct safe workflow", () => {
    const { props } = renderWorkbench({ kind: "idle" });
    const handoff = screen.getByRole("region", { name: "데스크톱에서 이어서 처리" });
    const workflow = screen.getByRole("region", { name: "이 기기에서 직접 처리" });
    expect(handoff.compareDocumentPosition(workflow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "데스크톱용 주소 복사" }));
    expect(props.desktopHandoff.onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "이 기기에서 계속 검토" })).toHaveAttribute(
      "href",
      "#takedown-direct-workflow",
    );
    expect(screen.getByLabelText("클럽 ID")).toBeInTheDocument();
  });

  it("honors server confirmEnabled=false while keeping its raw activation boundary technical", () => {
    const { props } = renderWorkbench({ kind: "preview", preview: blockedPreview });
    expect(screen.getByText(blockedPreview.remoteCopyLimitation)).toBeInTheDocument();
    expect(screen.getByText("안전 활성화 조건이 아직 충족되지 않았습니다.")).toBeInTheDocument();
    const technical = screen.getByRole("group", { name: "기술 정보" });
    expect(technical).toHaveTextContent(blockedPreview.activationBoundary);
    expect(screen.getByRole("button", { name: "긴급 회수 확인" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("translates all four server reason categories and confirms normalized input", () => {
    const { props } = renderWorkbench({ kind: "preview", preview: enabledPreview });
    expect(screen.getByRole("option", { name: "개인정보" })).toHaveValue("PRIVATE_DATA");
    expect(screen.getByRole("option", { name: "법적 요청" })).toHaveValue("LEGAL_REQUEST");
    expect(screen.getByRole("option", { name: "보안 사고" })).toHaveValue("SECURITY_INCIDENT");
    expect(screen.getByRole("option", { name: "공공 안전" })).toHaveValue("PUBLIC_SAFETY");
    expect(screen.queryByRole("option", { name: /PRIVATE_DATA|LEGAL_REQUEST|SECURITY_INCIDENT|PUBLIC_SAFETY/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("회수 사유"), { target: { value: "  개인정보 삭제 요청 확인  " } });
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));
    expect(props.onConfirm).toHaveBeenCalledWith({ reasonCategory: "PRIVATE_DATA", reason: "개인정보 삭제 요청 확인" });
  });

  it("renders immutable server receipt outcomes without convergence GET or retry UI", () => {
    renderWorkbench({ kind: "origin-denied", receipt });
    const region = screen.getByRole("region", { name: "변경 불가 회수 영수증" });
    expect(region).toHaveTextContent("원본 공개 경로를 차단했습니다.");
    expect(region).toHaveTextContent(receipt.remoteCopyLimitation);
    const technical = screen.getByRole("group", { name: "기술 정보" });
    expect(technical).toHaveTextContent(receipt.receiptId);
    expect(technical).toHaveTextContent(receipt.bffEvictionOutcome);
    expect(technical).toHaveTextContent(receipt.cdnPurgeOutcome);
    expect(technical).toHaveTextContent(receipt.browserRevalidationOutcome);
    expect(screen.getByRole("region", { name: "명령 기록" })).toHaveTextContent("공개 캐시 반영 기록");
    expect(screen.queryByRole("button", { name: /전파.*시도/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "전파 수렴 타임라인" })).not.toBeInTheDocument();
  });

  it("locks 44px targets and reduced motion in the scoped takedown stylesheet", () => {
    expect(EMERGENCY_CSS).toMatch(/\.admin-emergency-lane[\s\S]*min-height:\s*44px/);
    expect(EMERGENCY_CSS).toContain(":focus-visible");
    expect(EMERGENCY_CSS).toMatch(/@media \(max-width:\s*768px\)[\s\S]*\.admin-emergency-lane__compact-handoff[\s\S]*display:\s*grid/);
    expect(EMERGENCY_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.admin-emergency-lane[\s\S]*animation-duration:\s*0\.01ms/);
    expect(EMERGENCY_CSS).not.toMatch(/backdrop-filter|linear-gradient/);
  });
});
