import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PlatformAdminOnboardingWizard,
  type PlatformAdminOnboardingPreviewView,
  type PlatformAdminOnboardingResultView,
} from "./platform-admin-onboarding-wizard";

const preview: PlatformAdminOnboardingPreviewView = {
  previewId: "preview-1",
  expiresAt: "2026-08-24T01:00:00Z",
  clubSlug: "reading-circle",
  firstHostKind: "EXISTING_USER",
  requiredConfirmation: "ASSIGN_EXISTING_USER_AS_HOST",
  impactCodes: ["CLUB_CREATED", "HOST_ASSIGNED"],
  prerequisiteCodes: ["EXISTING_USER_CONFIRMATION_REQUIRED"],
  requestFingerprintPrefix: "abcd1234",
};
const result: PlatformAdminOnboardingResultView = {
  receiptId: "receipt-1",
  club: {
    clubId: "club-1",
    name: "Reading Circle",
  },
  originStatus: "SUCCEEDED",
  firstHostKind: "EXISTING_USER_ASSIGNED",
  invitationDelivery: "NOT_REQUIRED",
};

function fillDraft() {
  fireEvent.change(screen.getByRole("textbox", { name: "클럽 이름" }), {
    target: { value: "Reading Circle" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Slug" }), {
    target: { value: "reading-circle" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Tagline" }), {
    target: { value: "함께 읽는 모임" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "About" }), {
    target: { value: "공개 소개" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "첫 호스트 이메일" }), {
    target: { value: "contact-fixture" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "첫 호스트 이름" }), {
    target: { value: "Existing member" },
  });
}

describe("PlatformAdminOnboardingWizard", () => {
  it("requires every server-required club and host field before preview", () => {
    render(
      <PlatformAdminOnboardingWizard onPreview={vi.fn()} onCommit={vi.fn()} />,
    );
    fillDraft();
    const previewButton = screen.getByRole("button", { name: "미리 확인" });
    expect(previewButton).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Tagline" }), {
      target: { value: "   " },
    });
    expect(previewButton).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Tagline" }), {
      target: { value: "함께 읽는 모임" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "About" }), {
      target: { value: "   " },
    });
    expect(previewButton).toBeDisabled();
  });

  it("reviews only public-safe labels and requires explicit confirmation", async () => {
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onCommit = vi.fn().mockResolvedValue(result);
    render(
      <PlatformAdminOnboardingWizard
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    expect(await screen.findByText("CLUB_CREATED")).toBeInTheDocument();
    expect(screen.getByText(/첫 호스트 EXISTING_USER/)).toBeInTheDocument();
    expect(screen.queryByText(/contact-fixture/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "클럽 생성 확정" }),
    ).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "확인 문구" })).toHaveValue("");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    expect(
      screen.getByRole("button", { name: "클럽 생성 확정" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "확인 문구" }), {
      target: { value: "ASSIGN_EXISTING_USER_AS_HOST" },
    });
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    expect(await screen.findByText(/receipt-1/)).toBeInTheDocument();
    expect(screen.getByText(/NOT_REQUIRED/)).toBeInTheDocument();
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        existingUserConfirmation: "ASSIGN_EXISTING_USER_AS_HOST",
      }),
    );
  });

  it("retains one idempotency identity across response-loss retry", async () => {
    const onCommit = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(result);
    render(
      <PlatformAdminOnboardingWizard
        onPreview={vi.fn().mockResolvedValue(preview)}
        onCommit={onCommit}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "확인 문구" }), {
      target: { value: "ASSIGN_EXISTING_USER_AS_HOST" },
    });
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "같은 명령으로 다시 시도",
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));
    expect(onCommit.mock.calls[0][0].idempotencyKey).toBe(
      onCommit.mock.calls[1][0].idempotencyKey,
    );
  });

  it("blocks conflicting prerequisites and disables a completed command", async () => {
    const onCommit = vi.fn().mockResolvedValue(result);
    const conflictPreview = {
      ...preview,
      prerequisiteCodes: ["CLUB_SLUG_CONFLICT", "CLUB_DOMAIN_CONFLICT"],
    };
    const { rerender } = render(
      <PlatformAdminOnboardingWizard
        onPreview={vi.fn().mockResolvedValue(conflictPreview)}
        onCommit={onCommit}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    expect(
      await screen.findByText(/slug 또는 도메인 중복을 해결/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    expect(
      screen.getByRole("button", { name: "클럽 생성 확정" }),
    ).toBeDisabled();
    expect(onCommit).not.toHaveBeenCalled();

    rerender(
      <PlatformAdminOnboardingWizard
        onPreview={vi.fn().mockResolvedValue(preview)}
        onCommit={onCommit}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Tagline" }), {
      target: { value: "새 미리보기" },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.change(screen.getByRole("textbox", { name: "확인 문구" }), {
      target: { value: "ASSIGN_EXISTING_USER_AS_HOST" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    await screen.findByText(/receipt-1/);
    expect(
      screen.getByRole("button", { name: "클럽 생성 확정" }),
    ).toBeDisabled();
  });

  it.each([
    ["PREVIEW_EXPIRED", /새 미리보기를 만들어/],
    ["IDEMPOTENCY_CONFLICT", /새 명령으로 다시 시작/],
    ["COMMAND_IN_PROGRESS", /같은 명령으로 다시 확인/],
  ])("offers bounded recovery for %s", async (code, message) => {
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onCommit = vi.fn().mockRejectedValue({ code });
    render(
      <PlatformAdminOnboardingWizard
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.change(screen.getByRole("textbox", { name: "확인 문구" }), {
      target: { value: "ASSIGN_EXISTING_USER_AS_HOST" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    if (code === "COMMAND_IN_PROGRESS") {
      expect(screen.getByText("CLUB_CREATED")).toBeInTheDocument();
    } else {
      expect(screen.queryByText("CLUB_CREATED")).not.toBeInTheDocument();
    }
  });

  it("refreshes pending delivery with the same completed command identity", async () => {
    const onCommit = vi
      .fn()
      .mockResolvedValueOnce({ ...result, invitationDelivery: "PENDING" })
      .mockResolvedValueOnce({ ...result, invitationDelivery: "SUCCEEDED" });
    render(
      <PlatformAdminOnboardingWizard
        onPreview={vi.fn().mockResolvedValue(preview)}
        onCommit={onCommit}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.change(screen.getByRole("textbox", { name: "확인 문구" }), {
      target: { value: "ASSIGN_EXISTING_USER_AS_HOST" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    await screen.findByText(/초대 전달 PENDING/);
    fireEvent.click(screen.getByRole("button", { name: "전달 상태 새로고침" }));
    await screen.findByText(/초대 전달 SUCCEEDED/);
    expect(onCommit.mock.calls[0][0].idempotencyKey).toBe(
      onCommit.mock.calls[1][0].idempotencyKey,
    );
    expect(onCommit.mock.calls[0][0].previewId).toBe(
      onCommit.mock.calls[1][0].previewId,
    );
  });

  it("ignores a preview response that arrives after the draft changed", async () => {
    let resolvePreview:
      | ((value: PlatformAdminOnboardingPreviewView) => void)
      | undefined;
    const pendingPreview = new Promise<PlatformAdminOnboardingPreviewView>(
      (resolve) => {
        resolvePreview = resolve;
      },
    );
    render(
      <PlatformAdminOnboardingWizard
        onPreview={vi.fn().mockReturnValue(pendingPreview)}
        onCommit={vi.fn()}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tagline" }), {
      target: { value: "changed while pending" },
    });
    resolvePreview?.(preview);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "미리 확인" })).toBeEnabled(),
    );
    expect(screen.queryByText("CLUB_CREATED")).not.toBeInTheDocument();
  });

  it("ignores a stale preview failure after the draft changed", async () => {
    let rejectPreview: ((error: unknown) => void) | undefined;
    const pendingPreview = new Promise<PlatformAdminOnboardingPreviewView>(
      (_resolve, reject) => {
        rejectPreview = reject;
      },
    );
    render(
      <PlatformAdminOnboardingWizard
        onPreview={vi.fn().mockReturnValue(pendingPreview)}
        onCommit={vi.fn()}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tagline" }), {
      target: { value: "changed while pending" },
    });
    rejectPreview?.({ code: "PREVIEW_EXPIRED" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "미리 확인" })).toBeEnabled(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("locks the submitted draft and preserves a completed command receipt", async () => {
    let resolveCommit:
      | ((value: PlatformAdminOnboardingResultView) => void)
      | undefined;
    const pendingCommit = new Promise<PlatformAdminOnboardingResultView>(
      (resolve) => {
        resolveCommit = resolve;
      },
    );
    render(
      <PlatformAdminOnboardingWizard
        onPreview={vi.fn().mockResolvedValue(preview)}
        onCommit={vi.fn().mockReturnValue(pendingCommit)}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.change(screen.getByRole("textbox", { name: "확인 문구" }), {
      target: { value: "ASSIGN_EXISTING_USER_AS_HOST" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    expect(screen.getByRole("textbox", { name: "클럽 이름" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Tagline" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "About" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "확인 문구" })).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    ).toBeDisabled();
    resolveCommit?.(result);
    expect(await screen.findByText(/receipt-1/)).toBeInTheDocument();
  });

  it("keeps the submitted identity after a response-loss rejection", async () => {
    let rejectCommit: ((error: unknown) => void) | undefined;
    const pendingCommit = new Promise<PlatformAdminOnboardingResultView>(
      (_resolve, reject) => {
        rejectCommit = reject;
      },
    );
    const onCommit = vi
      .fn()
      .mockReturnValueOnce(pendingCommit)
      .mockResolvedValueOnce(result);
    render(
      <PlatformAdminOnboardingWizard
        onPreview={vi.fn().mockResolvedValue(preview)}
        onCommit={onCommit}
      />,
    );
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.change(screen.getByRole("textbox", { name: "확인 문구" }), {
      target: { value: "ASSIGN_EXISTING_USER_AS_HOST" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    expect(screen.getByRole("textbox", { name: "Tagline" })).toBeDisabled();
    rejectCommit?.(new Error("response lost"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "같은 명령으로 다시 시도",
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));
    expect(onCommit.mock.calls[0][0].idempotencyKey).toBe(
      onCommit.mock.calls[1][0].idempotencyKey,
    );
  });
});
