/**
 * Tests for ClubAiDefaultsSection (task 7.1).
 *
 * The section reads the club's default AI model from the host backend,
 * lets the host pick a new model from the club administration allowlist
 * allowlist, and saves the change via `putClubAiDefault`. Spec wording
 * for the post-save notice is fixed: "변경 사항은 새 generation 부터
 * 적용됩니다." (Korean per task spec).
 *
 * The aigen-api module is fully mocked so we can drive query / mutation
 * states without a real network.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLUB_AI_GEMINI_DEFAULT_MODEL_ID,
  CLUB_AI_OPENAI_DEFAULT_MODEL_ID,
} from "./club-ai-model-options";

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  getAiGenerationCapabilities: vi.fn(),
  getClubAiDefault: vi.fn(),
  putClubAiDefault: vi.fn(),
}));

import {
  getAiGenerationCapabilities,
  getClubAiDefault,
  putClubAiDefault,
} from "@/features/host/aigen/api/aigen-api";
import { ClubAiDefaultsSection } from "./ClubAiDefaultsSection";

const mockedCapabilities = vi.mocked(getAiGenerationCapabilities);
const mockedGet = vi.mocked(getClubAiDefault);
const mockedPut = vi.mocked(putClubAiDefault);

function createWrapper(staleTime = 0) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe("ClubAiDefaultsSection", () => {
  beforeEach(() => {
    mockedCapabilities.mockReset();
    mockedCapabilities.mockResolvedValue({ enabled: true });
    mockedGet.mockReset();
    mockedPut.mockReset();
  });

  // Helper to find the model dropdown by its `<label for>` association.
  // `findByLabelText` would otherwise also match the `<section
  // aria-labelledby>` heading because "AI 기본 모델 설정" contains the
  // same substring.
  function findModelSelect(): Promise<HTMLSelectElement> {
    return screen
      .findByRole("combobox", { name: /기본 모델/ })
      .then((el) => el as HTMLSelectElement);
  }

  it("does not request AI defaults when AI generation is disabled", async () => {
    mockedCapabilities.mockResolvedValue({ enabled: false });
    mockedGet.mockResolvedValue({ defaultModel: CLUB_AI_OPENAI_DEFAULT_MODEL_ID });
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    expect(
      await screen.findByText(
        "AI 생성 기능이 현재 꺼져 있어 기본 모델을 변경할 수 없습니다.",
      ),
    ).toHaveAttribute("role", "status");
    expect(screen.queryByRole("combobox", { name: /기본 모델/ })).not.toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("fails closed without requesting AI defaults when capability lookup fails", async () => {
    mockedCapabilities.mockRejectedValue(new Error("capability unavailable"));
    mockedGet.mockResolvedValue({ defaultModel: CLUB_AI_OPENAI_DEFAULT_MODEL_ID });
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI 기능 상태를 확인하지 못했습니다.",
    );
    expect(screen.queryByRole("combobox", { name: /기본 모델/ })).not.toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("rechecks a cached capability before requesting defaults after remount", async () => {
    mockedCapabilities
      .mockResolvedValueOnce({ enabled: true })
      .mockResolvedValueOnce({ enabled: false });
    mockedGet.mockResolvedValue({ defaultModel: CLUB_AI_OPENAI_DEFAULT_MODEL_ID });
    const { Wrapper } = createWrapper(30_000);

    const firstRender = render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );
    expect(await screen.findByRole("combobox", { name: /기본 모델/ })).toBeInTheDocument();
    firstRender.unmount();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    expect(
      await screen.findByText(
        "AI 생성 기능이 현재 꺼져 있어 기본 모델을 변경할 수 없습니다.",
      ),
    ).toHaveAttribute("role", "status");
    expect(mockedCapabilities).toHaveBeenCalledTimes(2);
  });

  it("renders the compact operations-tool variant without the standalone-card explanation", async () => {
    mockedGet.mockResolvedValue({ defaultModel: CLUB_AI_OPENAI_DEFAULT_MODEL_ID });
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" variant="compact" />
      </Wrapper>,
    );

    expect(await screen.findByRole("heading", { name: "AI 기본 모델" })).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "기본 모델" })).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "AI 기본 모델" });
    expect(section).toHaveClass("rm-host-ai-tool", "rm-host-ai-tool--ledger");
    expect(section.querySelector(".rm-host-ai-tool__header")).toBeInTheDocument();
    expect(screen.queryByText(/호스트가 업로드 시/)).not.toBeInTheDocument();
  });

  it("renders the current default model from the GET response", async () => {
    mockedGet.mockResolvedValue({ defaultModel: CLUB_AI_OPENAI_DEFAULT_MODEL_ID });
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    const select = await findModelSelect();
    await waitFor(() => {
      expect(select.value).toBe(CLUB_AI_OPENAI_DEFAULT_MODEL_ID);
    });
  });

  it("disables the save button until the selection changes", async () => {
    mockedGet.mockResolvedValue({ defaultModel: "claude-sonnet-4-6" });
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    const saveBtn = (await screen.findByRole("button", {
      name: /저장/,
    })) as HTMLButtonElement;
    expect(saveBtn).toBeDisabled();

    const select = await findModelSelect();
    await act(async () => {
      fireEvent.change(select, { target: { value: CLUB_AI_OPENAI_DEFAULT_MODEL_ID } });
    });

    expect(saveBtn).not.toBeDisabled();
  });

  it("calls putClubAiDefault with the selected model when save is clicked", async () => {
    mockedGet.mockResolvedValue({ defaultModel: "claude-sonnet-4-6" });
    mockedPut.mockResolvedValue(undefined);
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    const select = await findModelSelect();
    await act(async () => {
      fireEvent.change(select, { target: { value: CLUB_AI_GEMINI_DEFAULT_MODEL_ID } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /저장/ }));
    });

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith("club-a", {
        defaultModel: CLUB_AI_GEMINI_DEFAULT_MODEL_ID,
      });
    });
  });

  it("shows the 'applies to new generations' notice after a successful save", async () => {
    mockedGet.mockResolvedValue({ defaultModel: "claude-sonnet-4-6" });
    mockedPut.mockResolvedValue(undefined);
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    const select = await findModelSelect();
    await act(async () => {
      fireEvent.change(select, { target: { value: CLUB_AI_OPENAI_DEFAULT_MODEL_ID } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /저장/ }));
    });

    await waitFor(() => {
      expect(
        screen.getByText(/새 generation 부터 적용됩니다/),
      ).toBeInTheDocument();
    });
  });

  it("disables the save button while the mutation is in flight", async () => {
    mockedGet.mockResolvedValue({ defaultModel: "claude-sonnet-4-6" });
    let resolvePut: (() => void) | null = null;
    mockedPut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePut = () => resolve();
        }),
    );
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    const select = await findModelSelect();
    await act(async () => {
      fireEvent.change(select, { target: { value: CLUB_AI_OPENAI_DEFAULT_MODEL_ID } });
    });

    const saveBtn = screen.getByRole("button", { name: /저장/ }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(saveBtn).toBeDisabled();
    });

    // Resolve to let the test finish cleanly.
    await act(async () => {
      resolvePut?.();
    });
  });

  it("shows an error message when putClubAiDefault rejects", async () => {
    mockedGet.mockResolvedValue({ defaultModel: "claude-sonnet-4-6" });
    mockedPut.mockRejectedValue(new Error("서버 오류가 발생했습니다."));
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    const select = await findModelSelect();
    await act(async () => {
      fireEvent.change(select, { target: { value: CLUB_AI_OPENAI_DEFAULT_MODEL_ID } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /저장/ }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /서버 오류가 발생했습니다/,
      );
    });
  });
});
