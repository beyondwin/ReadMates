import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminClubDomainCommandPanel,
  type DomainProvisioningPreview,
  type DomainProvisioningReceipt,
} from "./domain-provisioning-panel";

const preview: DomainProvisioningPreview = {
  previewId: "preview-1",
  expiresAt: "2026-08-24T01:00:00Z",
  kind: "CUSTOM_DOMAIN",
  isPrimary: false,
  impactCodes: ["DOMAIN_CREATED"],
  requestFingerprintPrefix: "abcd1234",
};
const receipt: DomainProvisioningReceipt = {
  receiptId: "receipt-1",
  resultCode: "DOMAIN_CREATED",
  convergenceState: "PENDING",
};

function renderPanel(
  onPreview: (
    request: Parameters<
      Parameters<typeof AdminClubDomainCommandPanel>[0]["onPreview"]
    >[0],
  ) => Promise<DomainProvisioningPreview>,
  onConfirm = vi.fn().mockResolvedValue(receipt),
  canManageDomains = true,
) {
  return render(
    <AdminClubDomainCommandPanel
      revision={7}
      domains={[]}
      canManageDomains={canManageDomains}
      previewPending={false}
      confirmPending={false}
      recheckPending={false}
      onRefresh={vi.fn()}
      onPreview={onPreview}
      onConfirm={onConfirm}
      onRecheck={vi.fn()}
    />,
  );
}

describe("AdminClubDomainCommandPanel request binding", () => {
  it("ignores a stale preview failure after the hostname changed", async () => {
    let rejectPreview: ((error: unknown) => void) | undefined;
    renderPanel(
      () =>
        new Promise((_resolve, reject) => {
          rejectPreview = reject;
        }),
    );
    const hostname = screen.getByRole("textbox", { name: "Hostname" });
    fireEvent.change(hostname, { target: { value: "first.example.test" } });
    fireEvent.click(
      screen.getByRole("button", { name: "도메인 추가 미리보기" }),
    );
    fireEvent.change(hostname, { target: { value: "second.example.test" } });
    rejectPreview?.({ code: "PREVIEW_EXPIRED" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "도메인 추가 미리보기" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["resolve", "reject"] as const)(
    "locks the submitted draft and preserves the confirm %s outcome",
    async (outcome) => {
      let resolveConfirm:
        | ((value: DomainProvisioningReceipt) => void)
        | undefined;
      let rejectConfirm: ((error: unknown) => void) | undefined;
      const onConfirm = vi.fn().mockReturnValue(
        new Promise<DomainProvisioningReceipt>((resolve, reject) => {
          resolveConfirm = resolve;
          rejectConfirm = reject;
        }),
      );
      renderPanel(vi.fn().mockResolvedValue(preview), onConfirm);
      const hostname = screen.getByRole("textbox", { name: "Hostname" });
      fireEvent.change(hostname, { target: { value: "first.example.test" } });
      fireEvent.click(
        screen.getByRole("button", { name: "도메인 추가 미리보기" }),
      );
      await screen.findByText("DOMAIN_CREATED");
      fireEvent.click(
        screen.getByRole("checkbox", { name: "도메인 영향을 확인했습니다" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "도메인 추가 확정" }));
      expect(hostname).toBeDisabled();
      expect(screen.getByRole("combobox", { name: "종류" })).toBeDisabled();
      expect(
        screen.getByRole("checkbox", { name: "기본 도메인" }),
      ).toBeDisabled();
      if (outcome === "resolve") resolveConfirm?.(receipt);
      else rejectConfirm?.(new Error("response lost"));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "도메인 추가 미리보기" }),
        ).toBeEnabled(),
      );
      if (outcome === "resolve") {
        expect(screen.getByText(/receipt-1/)).toBeInTheDocument();
      } else {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "같은 명령으로 다시 시도",
        );
        fireEvent.click(
          screen.getByRole("button", { name: "도메인 추가 확정" }),
        );
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
        expect(onConfirm.mock.calls[0][0].idempotencyKey).toBe(
          onConfirm.mock.calls[1][0].idempotencyKey,
        );
      }
    },
  );

  it.each([
    [
      "종류",
      () =>
        fireEvent.change(screen.getByRole("combobox", { name: "종류" }), {
          target: { value: "SUBDOMAIN" },
        }),
    ],
    [
      "기본 도메인",
      () =>
        fireEvent.click(screen.getByRole("checkbox", { name: "기본 도메인" })),
    ],
  ])("clears reviewed state when %s changes", async (_label, changeDraft) => {
    renderPanel(vi.fn().mockResolvedValue(preview));
    fireEvent.change(screen.getByRole("textbox", { name: "Hostname" }), {
      target: { value: "first.example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "도메인 추가 미리보기" }),
    );
    await screen.findByText("DOMAIN_CREATED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "도메인 영향을 확인했습니다" }),
    );
    changeDraft();
    expect(screen.queryByText("DOMAIN_CREATED")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "도메인 추가 확정" }),
    ).not.toBeInTheDocument();
  });

  it("ignores a domain preview that arrives after MANAGE_CLUB_DOMAINS is restored", async () => {
    let resolvePreview:
      | ((value: DomainProvisioningPreview) => void)
      | undefined;
    const { rerender } = renderPanel(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Hostname" }), {
      target: { value: "late.example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "도메인 추가 미리보기" }),
    );

    rerender(
      <AdminClubDomainCommandPanel
        revision={7}
        domains={[]}
        canManageDomains={false}
        previewPending={false}
        confirmPending={false}
        recheckPending={false}
        onRefresh={vi.fn()}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onRecheck={vi.fn()}
      />,
    );
    rerender(
      <AdminClubDomainCommandPanel
        revision={7}
        domains={[]}
        canManageDomains
        previewPending={false}
        confirmPending={false}
        recheckPending={false}
        onRefresh={vi.fn()}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onRecheck={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Hostname" })).toHaveValue("");
    await act(async () => {
      resolvePreview?.(preview);
      await Promise.resolve();
    });
    expect(screen.queryByText("DOMAIN_CREATED")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Hostname" })).toHaveValue("");
  });

  it("purges domain draft, preview, confirmation, idempotency, and receipt when MANAGE_CLUB_DOMAINS is lost", async () => {
    const onConfirm = vi.fn().mockResolvedValue(receipt);
    const { rerender } = renderPanel(vi.fn().mockResolvedValue(preview), onConfirm);
    fireEvent.change(screen.getByRole("textbox", { name: "Hostname" }), {
      target: { value: "first.example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "도메인 추가 미리보기" }),
    );
    await screen.findByText("DOMAIN_CREATED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "도메인 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "도메인 추가 확정" }));
    expect(await screen.findByText(/receipt-1/)).toBeInTheDocument();

    rerender(
      <AdminClubDomainCommandPanel
        revision={7}
        domains={[]}
        canManageDomains={false}
        previewPending={false}
        confirmPending={false}
        recheckPending={false}
        onRefresh={vi.fn()}
        onPreview={vi.fn()}
        onConfirm={onConfirm}
        onRecheck={vi.fn()}
      />,
    );
    expect(screen.queryByText("DOMAIN_CREATED")).not.toBeInTheDocument();
    expect(screen.queryByText(/receipt-1/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Hostname" }),
    ).not.toBeInTheDocument();

    rerender(
      <AdminClubDomainCommandPanel
        revision={7}
        domains={[]}
        canManageDomains
        previewPending={false}
        confirmPending={false}
        recheckPending={false}
        onRefresh={vi.fn()}
        onPreview={vi.fn()}
        onConfirm={onConfirm}
        onRecheck={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Hostname" })).toHaveValue("");
    expect(screen.queryByText("DOMAIN_CREATED")).not.toBeInTheDocument();
    expect(screen.queryByText(/receipt-1/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "도메인 영향을 확인했습니다" }),
    ).not.toBeInTheDocument();
  });
});
