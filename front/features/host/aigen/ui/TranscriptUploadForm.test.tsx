/**
 * Tests for TranscriptUploadForm: file-size constraint (spec §7.1 ≤ 1 MB),
 * model dropdown population from club default, and submit payload.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AIGEN_OPENAI_DEFAULT_MODEL_ID } from "./aigen-model-options";
import { TranscriptUploadForm } from "./TranscriptUploadForm";

describe("TranscriptUploadForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects files larger than 1 MB and surfaces a message", async () => {
    const onSubmit = vi.fn();
    render(
      <TranscriptUploadForm
        defaultModel="claude-sonnet-4-6"
        loadingDefaults={false}
        submitting={false}
        onSubmit={onSubmit}
      />,
    );

    // Construct a fake file > 1 MB by stubbing `.size`.
    const oversized = new File(["x"], "huge.txt", { type: "text/plain" });
    Object.defineProperty(oversized, "size", { value: 2 * 1024 * 1024, configurable: true });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/대본 파일/), { target: { files: [oversized] } });
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/1 ?MB/);
    expect(screen.getByRole("button", { name: /생성 시작/ })).toBeDisabled();
  });

  it("populates the model dropdown from defaultModel", () => {
    render(
      <TranscriptUploadForm
        defaultModel={AIGEN_OPENAI_DEFAULT_MODEL_ID}
        loadingDefaults={false}
        submitting={false}
        onSubmit={() => {}}
      />,
    );
    const select = screen.getByLabelText(/모델/) as HTMLSelectElement;
    expect(select.value).toBe(AIGEN_OPENAI_DEFAULT_MODEL_ID);
  });

  it("calls onSubmit with file, model, authorNameMode, and instructions when submitted", async () => {
    const onSubmit = vi.fn();
    render(
      <TranscriptUploadForm
        defaultModel="claude-sonnet-4-6"
        loadingDefaults={false}
        submitting={false}
        onSubmit={onSubmit}
      />,
    );

    const file = new File(["abc"], "transcript.txt", { type: "text/plain" });
    Object.defineProperty(file, "size", { value: 1024, configurable: true });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/대본 파일/), { target: { files: [file] } });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/추가 지시문/), {
        target: { value: "간결하게" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /생성 시작/ }));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.transcript.name).toBe("transcript.txt");
    expect(arg.model).toBe("claude-sonnet-4-6");
    expect(arg.authorNameMode).toBe("alias");
    expect(arg.instructions).toBe("간결하게");
  });

  it("disables submit while loadingDefaults", () => {
    render(
      <TranscriptUploadForm
        defaultModel={null}
        loadingDefaults
        submitting={false}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /생성 시작/ })).toBeDisabled();
  });

  it("disables submit while submitting", () => {
    render(
      <TranscriptUploadForm
        defaultModel="claude-sonnet-4-6"
        loadingDefaults={false}
        submitting
        onSubmit={() => {}}
      />,
    );
    // While submitting the button label becomes "시작 중…"; assert the
    // single form-submit button is disabled.
    expect(screen.getByRole("button", { name: /시작/ })).toBeDisabled();
  });
});
