import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiGenerationProblem, AvailableGenerationModel } from "../api/aigen-contracts";
import { TranscriptUploadForm } from "./TranscriptUploadForm";

const models: AvailableGenerationModel[] = [
  { id: "gpt-5.4-mini", provider: "OPENAI", isDefault: true },
  { id: "claude-sonnet-4-6", provider: "CLAUDE", isDefault: false },
];

function renderForm(overrides: Partial<React.ComponentProps<typeof TranscriptUploadForm>> = {}) {
  const props: React.ComponentProps<typeof TranscriptUploadForm> = {
    models,
    loadingModels: false,
    modelError: false,
    startProblem: null,
    submitting: false,
    onRetryModels: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  return { ...render(<TranscriptUploadForm {...props} />), props };
}

describe("TranscriptUploadForm", () => {
  it("accepts only .txt files and rejects files larger than 1 MiB", async () => {
    const { props } = renderForm();
    const fileInput = screen.getByLabelText(/대본 파일/);

    await act(async () => {
      fireEvent.change(fileInput, {
        target: { files: [new File(["# note"], "notes.md", { type: "text/markdown" })] },
      });
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/\.txt/);

    const oversized = new File(["x"], "huge.txt", { type: "text/plain" });
    Object.defineProperty(oversized, "size", { value: 1024 * 1024 + 1 });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [oversized] } });
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/1 ?MB/);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("uses the dynamic default, preserves a still-available selection, and omits alias mode", async () => {
    const onSubmit = vi.fn();
    const rendered = renderForm({ onSubmit });
    const select = screen.getByLabelText(/모델/) as HTMLSelectElement;
    expect(select.value).toBe("gpt-5.4-mini");

    fireEvent.change(select, { target: { value: "claude-sonnet-4-6" } });
    rendered.rerender(
      <TranscriptUploadForm
        {...rendered.props}
        models={[...models, { id: "gemini-3-flash-preview", provider: "GEMINI", isDefault: false }]}
      />,
    );
    expect((screen.getByLabelText(/모델/) as HTMLSelectElement).value).toBe(
      "claude-sonnet-4-6",
    );
    expect(screen.queryByText(/별칭|닉네임|발화자 이름 표시/)).not.toBeInTheDocument();

    const file = new File(["회원 하나 00:00\n안녕하세요"], "transcript.txt", {
      type: "text/plain",
    });
    fireEvent.change(screen.getByLabelText(/대본 파일/), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/추가 지시문/), { target: { value: "간결하게" } });
    fireEvent.click(screen.getByRole("button", { name: /생성 시작/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      transcript: file,
      model: "claude-sonnet-4-6",
      instructions: "간결하게",
    });
  });

  it("keeps submission disabled while models fail and offers retry", () => {
    const onRetryModels = vi.fn();
    renderForm({ models: [], modelError: true, onRetryModels });

    expect(screen.getByRole("button", { name: /생성 시작/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /모델 다시 불러오기/ }));
    expect(onRetryModels).toHaveBeenCalledTimes(1);
  });

  it("shows exact invalid labels, keeps the selected file, and never auto-resubmits", async () => {
    const onSubmit = vi.fn();
    const rendered = renderForm({ onSubmit });
    const file = new File(["확인 필요 00:00\n안녕하세요"], "transcript.txt", {
      type: "text/plain",
    });
    fireEvent.change(screen.getByLabelText(/대본 파일/), { target: { files: [file] } });

    const problem: AiGenerationProblem = {
      code: "TRANSCRIPT_SPEAKER_NOT_MEMBER",
      detail: "대본의 화자 이름을 확인해 주세요.",
      invalidSpeakerLabels: ["확인 필요"],
    };
    rendered.rerender(<TranscriptUploadForm {...rendered.props} startProblem={problem} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "멤버로 확인되지 않은 화자가 있습니다: 확인 필요",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /현재 활성 멤버 이름과 같게 수정한 뒤 다시 업로드/,
    );
    expect((screen.getByLabelText(/대본 파일/) as HTMLInputElement).files?.[0]).toBe(file);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
