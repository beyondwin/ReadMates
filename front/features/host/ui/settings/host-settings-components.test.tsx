import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostClubClosePreview, HostClubSettings as Settings } from "@/features/host/api/host-club-settings-contracts";
import type { HostInvitationLink } from "@/features/host/api/host-invitation-link-contracts";
import { HostClubCloseDialog } from "./host-club-close-dialog";
import { HostClubSettings } from "./host-club-settings";
import { HostInvitationLinks } from "./host-invitation-links";

const link: HostInvitationLink = { linkId: "link-1", name: "가을 신규 멤버", status: "ACTIVE", maxUses: 4, usedCount: 1, expiresAt: "2026-09-30T00:00:00Z", revision: 2, createdAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z" };
const settings: Settings = { clubId: "club-1", clubSlug: "reading-sai", name: "읽는사이", approvalPolicy: "INVITE_ONLY", defaultTimezone: "Asia/Seoul", scheduleReminderEnabled: true, recordPublicationDefault: "MEMBER", revision: 3, status: "ACTIVE" };

describe("host settings controls", () => {
  it("copies a newly issued path once and exposes link status controls", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({ link, oneTimeSharePath: "/clubs/reading-sai/invite/lnk_fixture", receipt: { receiptId: "r", action: "CREATED", linkId: "link-1", revision: 2, replayed: false } });
    render(<HostInvitationLinks links={[link]} loading={false} error={null} onRetry={vi.fn()} onCreate={create} onUpdate={vi.fn()} />);
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    await user.type(screen.getByLabelText("링크 이름"), "새 멤버");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await user.click(await screen.findByRole("button", { name: "한 번만 복사" }));
    expect(writeText).toHaveBeenCalledWith("/clubs/reading-sai/invite/lnk_fixture");
    expect(screen.queryByText("/clubs/reading-sai/invite/lnk_fixture")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "링크 일시정지" })).toBeInTheDocument();
  });

  it("submits editable settings with the visible revision", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<HostClubSettings settings={settings} saving={false} stale={false} error={null} onSave={save} />);
    expect(screen.getByText("revision 3")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("클럽 이름"));
    await user.type(screen.getByLabelText("클럽 이름"), "읽는사이 새 이름");
    await user.click(screen.getByRole("button", { name: "설정 저장" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "읽는사이 새 이름", expectedRevision: 3 }));
  });

  it("requires a bound preview before club end and keeps unknown outcome recoverable", async () => {
    const user = userEvent.setup();
    const preview: HostClubClosePreview = { previewId: "preview-1", clubId: "club-1", actorMembershipId: "member-1", clubRevision: 3, effectHash: "a".repeat(64), effects: { clubStatus: "ARCHIVED", memberAccess: "ENDED", publicRecords: "UNCHANGED" }, expiresAt: "2026-08-30T01:00:00Z" };
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onConfirm = vi.fn().mockRejectedValue(new Error("NETWORK"));
    render(<HostClubCloseDialog open onClose={vi.fn()} onPreview={onPreview} onConfirm={onConfirm} />);
    expect(screen.queryByRole("button", { name: "클럽 운영 종료 확인" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "종료 영향 미리보기" }));
    expect(await screen.findByText("공개 기록은 유지됩니다.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "클럽 운영 종료 확인" }));
    expect(await screen.findByText(/결과를 확인할 수 없습니다/)).toBeInTheDocument();
  });
});
