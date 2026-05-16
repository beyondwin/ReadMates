/**
 * Tests for ClubAiDefaultsSection (task 7.1).
 *
 * The section reads the club's default AI model from the host backend,
 * lets the host pick a new model from the shared `AIGEN_MODEL_OPTIONS`
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

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  getClubAiDefault: vi.fn(),
  putClubAiDefault: vi.fn(),
}));

import {
  getClubAiDefault,
  putClubAiDefault,
} from "@/features/host/aigen/api/aigen-api";
import { ClubAiDefaultsSection } from "./ClubAiDefaultsSection";

const mockedGet = vi.mocked(getClubAiDefault);
const mockedPut = vi.mocked(putClubAiDefault);

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
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

  it("renders the current default model from the GET response", async () => {
    mockedGet.mockResolvedValue({ defaultModel: "gpt-4.1" });
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <ClubAiDefaultsSection clubSlug="club-a" />
      </Wrapper>,
    );

    const select = await findModelSelect();
    await waitFor(() => {
      expect(select.value).toBe("gpt-4.1");
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
      fireEvent.change(select, { target: { value: "gpt-4.1" } });
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
      fireEvent.change(select, { target: { value: "gemini-2-5-pro" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /저장/ }));
    });

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith("club-a", {
        defaultModel: "gemini-2-5-pro",
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
      fireEvent.change(select, { target: { value: "gpt-4.1" } });
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
      fireEvent.change(select, { target: { value: "gpt-4.1" } });
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
      fireEvent.change(select, { target: { value: "gpt-4.1" } });
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
