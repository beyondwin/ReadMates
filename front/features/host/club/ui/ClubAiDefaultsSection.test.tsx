import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CLUB_AI_GEMINI_DEFAULT_MODEL_ID } from "./club-ai-model-options";
import { ClubAiDefaultsSection, type ClubAiDefaultsPresentation } from "./ClubAiDefaultsSection";

function state(overrides: Partial<ClubAiDefaultsPresentation> = {}): ClubAiDefaultsPresentation {
  return {
    enabled: true, capabilityLoading: false, capabilityError: false,
    model: "gpt-5.4", loading: false, pending: false, error: null, saved: false, canSave: false,
    onModelChange: vi.fn(), onSave: vi.fn(), onRetryCapabilities: vi.fn(), onRetryDefault: vi.fn(),
    ...overrides,
  };
}

describe("ClubAiDefaultsSection", () => {
  it("is prop and callback only for a disabled capability", () => {
    render(<ClubAiDefaultsSection state={state({ enabled: false })} />);
    expect(screen.getByRole("status")).toHaveTextContent("AI 생성 기능이 현재 꺼져");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders compact controlled state and invokes injected callbacks", () => {
    const props = state({ canSave: true });
    render(<ClubAiDefaultsSection state={props} variant="compact" />);
    fireEvent.change(screen.getByRole("combobox", { name: "기본 모델" }), { target: { value: CLUB_AI_GEMINI_DEFAULT_MODEL_ID } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(props.onModelChange).toHaveBeenCalledWith(CLUB_AI_GEMINI_DEFAULT_MODEL_ID);
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("renders owner-supplied pending, error, and accepted copy", () => {
    const { rerender } = render(<ClubAiDefaultsSection state={state({ pending: true, canSave: false })} />);
    expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
    rerender(<ClubAiDefaultsSection state={state({ error: "저장 실패" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("저장 실패");
    rerender(<ClubAiDefaultsSection state={state({ saved: true })} />);
    expect(screen.getByText(/새 generation 부터 적용됩니다/)).toBeInTheDocument();
  });
});
