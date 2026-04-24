import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PendingApprovalPage from "@/src/pages/pending-approval";
import { AuthContext } from "@/src/app/auth-state";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const viewerAuth: AuthMeResponse = {
  authenticated: true,
  userId: "viewer-user",
  membershipId: "viewer-membership",
  clubId: "club-id",
  email: "viewer@example.com",
  displayName: "둘러보기 멤버",
  accountName: "둘러보기",
  role: "MEMBER",
  membershipStatus: "VIEWER",
  approvalState: "VIEWER",
};

function renderPendingPage(auth: AuthMeResponse) {
  return render(
    <AuthContext.Provider value={{ status: "ready", auth }}>
      <MemoryRouter>
        <PendingApprovalPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("PendingApprovalPage", () => {
  it("explains viewer approval state and keeps read-only member CTAs available", () => {
    renderPendingPage(viewerAuth);

    expect(screen.getByText("둘러보기 멤버")).toBeInTheDocument();
    expect(screen.getByText("승인 대기")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "기록은 읽을 수 있고, 참여 기능은 승인 뒤 열립니다." })).toBeInTheDocument();
    expect(screen.getByText("viewer@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("VIEWER")).toHaveLength(2);
    expect(screen.getByText("초대 링크를 받았다면 해당 링크에서 같은 Google 계정으로 수락해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "아카이브 둘러보기" })).toHaveAttribute("href", "/app/archive");
    expect(screen.getByRole("link", { name: "이번 세션 보기" })).toHaveAttribute("href", "/app/session/current");
  });

  it("explains blocked approval states without member-app dead controls", () => {
    renderPendingPage({
      ...viewerAuth,
      email: "inactive@example.com",
      membershipStatus: "INACTIVE",
      approvalState: "INACTIVE",
    });

    expect(screen.getByText("승인 필요")).toBeInTheDocument();
    expect(screen.getByText("접근 보류")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "이 계정은 멤버 공간에 들어갈 수 없는 상태입니다." })).toBeInTheDocument();
    expect(screen.getByText("호스트가 이 멤버십을 비활성 상태로 전환했습니다. 공개 기록은 계속 읽을 수 있지만 멤버 앱은 열리지 않습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 기록 보기" })).toHaveAttribute("href", "/records");
    expect(screen.getByRole("link", { name: "공개 홈으로" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "이번 세션 보기" })).not.toBeInTheDocument();
  });
});
