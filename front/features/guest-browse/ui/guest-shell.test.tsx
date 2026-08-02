import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MobileTabBar } from "@/shared/ui/mobile-tab-bar";
import { TopNav } from "@/shared/ui/top-nav";
import { GuestAccountControl } from "./guest-account-control";
import { GuestAppHead } from "./guest-app-head";
import { GuestLockedPage } from "./guest-locked-page";
import { GuestMySpace } from "./guest-my-space";
import { GuestNavigationLink, GuestNavigationProvider } from "./guest-navigation-dialog";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('[data-readmates-club-app="true"]').forEach((node) => node.remove());
});

function TestLink({ to, children, ...props }: { to: string; children: ReactNode; className?: string }) {
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

describe("guest shell UI", () => {
  it("installs exactly one noindex meta tag and removes it on cleanup", () => {
    const view = render(
      <>
        <GuestAppHead audience="GUEST" />
        <GuestAppHead audience="GUEST" />
      </>,
    );
    expect(document.head.querySelectorAll('meta[name="robots"][content="noindex"]')).toHaveLength(1);

    view.rerender(<GuestAppHead audience="GUEST" />);
    expect(document.head.querySelectorAll('meta[name="robots"][content="noindex"]')).toHaveLength(1);

    view.unmount();
    expect(document.head.querySelectorAll('[data-readmates-club-app="true"]')).toHaveLength(0);
  });

  it.each(["VIEWER", "MEMBER", "HOST"] as const)("keeps every %s club app audience out of search indexes", (audience) => {
    const view = render(<GuestAppHead audience={audience} />);

    expect(document.head.querySelectorAll('meta[name="robots"][content="noindex"]')).toHaveLength(1);

    view.unmount();
    expect(document.head.querySelector('meta[name="robots"][data-readmates-club-app="true"]')).toBeNull();
  });

  it("renders a personal preview without fabricated data and preserves the full conversion return target", () => {
    render(<GuestMySpace returnTo="/clubs/alpha/app/me?tab=history#section" LinkComponent={TestLink} />);

    expect(screen.getByRole("heading", { name: "내 공간" })).toBeInTheDocument();
    expect(screen.getByText("멤버로 시작하면 내가 참석한 모임, 질문과 서평, 알림 설정을 이곳에서 이어볼 수 있어요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Falpha%2Fapp%2Fme%3Ftab%3Dhistory%23section",
    );
  });

  it("preserves pathname, search, and hash from a direct feedback lock URL", () => {
    render(
      <GuestLockedPage
        kind="feedback"
        returnTo="/clubs/alpha/app/feedback/s1?from=archive#document"
        LinkComponent={TestLink}
      />,
    );

    expect(screen.getByText("Google로 시작한 뒤 호스트의 정식 멤버 승인이 필요합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Falpha%2Fapp%2Ffeedback%2Fs1%3Ffrom%3Darchive%23document",
    );
  });

  it("renders guest account conversion and public-home controls without logout", () => {
    render(
      <GuestAccountControl
        clubSlug="alpha"
        returnTo="/clubs/alpha/app/feedback/s1?print=true#top"
        LinkComponent={TestLink}
      />,
    );

    expect(screen.getByText("게스트")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Falpha%2Fapp%2Ffeedback%2Fs1%3Fprint%3Dtrue%23top",
    );
    expect(screen.getByRole("link", { name: "공개 홈으로 나가기" })).toHaveAttribute("href", "/clubs/alpha");
    expect(screen.queryByRole("button", { name: /로그아웃/ })).not.toBeInTheDocument();
  });

  it("keeps the regular desktop and mobile member navigation while omitting host entry for guests", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/alpha/app/me"]}>
        <TopNav
          variant="member"
          appBasePath="/clubs/alpha/app"
          LinkComponent={TestLink}
          accountControl={<GuestAccountControl clubSlug="alpha" returnTo="/clubs/alpha/app/me" LinkComponent={TestLink} />}
        />
        <MobileTabBar variant="member" appBasePath="/clubs/alpha/app" LinkComponent={TestLink} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("link", { name: "오늘" })).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "노트" })).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "기록" })).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "내 공간" })).not.toHaveLength(0);
    expect(screen.queryByRole("link", { name: "운영" })).not.toBeInTheDocument();
    expect(screen.getByText("게스트")).toBeInTheDocument();
  });

  it("opens a guest lock dialog and restores focus for Escape, close, and backdrop dismissal", () => {
    render(
      <GuestNavigationProvider LinkComponent={TestLink}>
        <GuestNavigationLink to="/clubs/alpha/app/feedback/s1">피드백</GuestNavigationLink>
      </GuestNavigationProvider>,
    );
    const opener = screen.getByRole("button", { name: "피드백" });

    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");

    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    fireEvent.click(document.querySelector(".rm-guest-lock-dialog-backdrop")!);
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("traps Tab and Shift+Tab within the guest lock dialog", () => {
    render(
      <GuestNavigationProvider LinkComponent={TestLink}>
        <GuestNavigationLink to="/clubs/alpha/app/feedback/s1">피드백</GuestNavigationLink>
      </GuestNavigationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "피드백" }));
    const close = screen.getByRole("button", { name: "닫기" });
    const convert = screen.getByRole("link", { name: "멤버로 시작" });

    convert.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(convert).toHaveFocus();
  });
});
