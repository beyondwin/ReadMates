/**
 * Tests for the RegenerateModal — verifies the camelCase → UPPER_SNAKE
 * item conversion (server defect workaround) and the spinner/error flow.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  regenerateItem: vi.fn(),
}));

import { regenerateItem } from "@/features/host/aigen/api/aigen-api";
import { RegenerateModal } from "./RegenerateModal";

const mockedRegenerate = vi.mocked(regenerateItem);

describe("RegenerateModal", () => {
  beforeEach(() => {
    mockedRegenerate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when open=false", () => {
    render(
      <RegenerateModal
        open={false}
        sessionId="s1"
        jobId="j1"
        item="summary"
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("converts camelCase item to UPPER_SNAKE when calling regenerateItem (server defect workaround)", async () => {
    mockedRegenerate.mockResolvedValue({
      item: "oneLineReviews",
      value: { oneLineReviews: [] },
      tokens: { input: 1, cachedInput: 0, output: 1 },
      costEstimateUsd: "0.01",
      warnings: [],
    });

    const onSuccess = vi.fn();
    render(
      <RegenerateModal
        open
        sessionId="s1"
        jobId="j1"
        item="oneLineReviews"
        onClose={() => {}}
        onSuccess={onSuccess}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /확인/ }));
    });

    await waitFor(() => {
      expect(mockedRegenerate).toHaveBeenCalledTimes(1);
    });
    const callArgs = mockedRegenerate.mock.calls[0];
    expect(callArgs[0]).toBe("s1");
    expect(callArgs[1]).toBe("j1");
    expect(callArgs[2].item).toBe("ONE_LINE_REVIEWS");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("sends model override and instructions when provided", async () => {
    mockedRegenerate.mockResolvedValue({
      item: "summary",
      value: { summary: "new" },
      tokens: { input: 1, cachedInput: 0, output: 1 },
      costEstimateUsd: "0.01",
      warnings: [],
    });

    render(
      <RegenerateModal
        open
        sessionId="s1"
        jobId="j1"
        item="summary"
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/지시문/), {
        target: { value: "더 짧게" },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/모델 변경/), {
        target: { value: "openai-gpt-4-1" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /확인/ }));
    });

    await waitFor(() => {
      expect(mockedRegenerate).toHaveBeenCalledTimes(1);
    });
    const req = mockedRegenerate.mock.calls[0][2];
    expect(req.item).toBe("SUMMARY");
    expect(req.model).toBe("openai-gpt-4-1");
    expect(req.instructions).toBe("더 짧게");
  });

  it("surfaces error message without closing on failure", async () => {
    mockedRegenerate.mockRejectedValue(new Error("server boom"));
    const onClose = vi.fn();
    render(
      <RegenerateModal
        open
        sessionId="s1"
        jobId="j1"
        item="highlights"
        onClose={onClose}
        onSuccess={() => {}}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /확인/ }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/server boom/);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when 닫기 is clicked", () => {
    const onClose = vi.fn();
    render(
      <RegenerateModal
        open
        sessionId="s1"
        jobId="j1"
        item="feedbackDocument"
        onClose={onClose}
        onSuccess={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
