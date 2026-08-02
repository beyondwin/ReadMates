import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginRoute } from "@/features/auth/route/login-route";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("[data-readmates-page-head]").forEach((node) => node.remove());
  document.title = "";
  window.history.pushState({}, "", "/");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LoginRoute", () => {
  it("sets public-safe page metadata for Lighthouse and browser tabs", () => {
    render(<LoginRoute />);

    expect(document.title).toBe("로그인 | ReadMates");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Google 계정으로 ReadMates 독서 모임에 들어가고, 초대받은 클럽의 멤버 공간으로 안전하게 이동합니다.",
    );
  });

  it("shows only the Google login action outside dev login mode", () => {
    render(<LoginRoute />);

    expect(screen.getByText("둘러보기부터 멤버 참여까지")).toBeVisible();
    expect(screen.getByRole("heading", { name: "읽는사이 들어가기" })).toBeVisible();
    expect(screen.getByText(/로그인 없이 공개된 클럽 기록을 둘러볼 수 있습니다/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Google로 시작하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
    expect(screen.queryByRole("button", { name: "김호스트 · 호스트" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("이메일")).toBeNull();
    expect(screen.queryByLabelText("비밀번호")).toBeNull();
  });

  it("adds a safe returnTo value to the Google login action", () => {
    window.history.pushState({}, "", "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail");

    render(<LoginRoute />);

    expect(screen.getByRole("link", { name: "둘러보기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/feedback/session-1?from=email",
    );
    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
    );
  });

  it("keeps generic login unscoped and without an implicit club join", () => {
    render(<LoginRoute />);

    expect(screen.queryByRole("link", { name: "둘러보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 시작하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
  });

  it("ignores unsafe returnTo values on the login route", () => {
    window.history.pushState({}, "", "/login?returnTo=https%3A%2F%2Fevil.example%2Fapp");

    render(<LoginRoute />);

    expect(screen.getByRole("link", { name: "Google로 시작하기" })).toHaveAttribute("href", "/oauth2/authorization/google");
  });

  it("hides dev login shortcuts in production builds even when the flag is true", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_LOGIN", "true");

    render(<LoginRoute />);

    expect(screen.getByRole("link", { name: "Google로 시작하기" })).toBeInTheDocument();
    expect(screen.queryByText("Local development only")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "김호스트 · 호스트" })).not.toBeInTheDocument();
  });

  it("shows seeded existing-user shortcuts in dev login mode", () => {
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");

    render(<LoginRoute />);

    expect(screen.getByLabelText("로컬 개발 전용 로그인")).toBeInTheDocument();
    expect(screen.getByText("프로덕션 제외")).toBeInTheDocument();
    expect(screen.getByText(/실제 Google 자격 증명은 브라우저에 노출하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "김호스트 · 호스트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "플랫폼 관리자 · OWNER" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "안멤버1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최멤버2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "김멤버3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "송멤버4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이멤버5" })).toBeInTheDocument();
  });

  it("does not offer a broken Google OAuth link in local dev mode unless it is explicitly enabled", () => {
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");

    render(<LoginRoute />);

    expect(screen.queryByRole("link", { name: "Google로 시작하기" })).not.toBeInTheDocument();
    expect(screen.getByRole("note", { name: "로컬 Google 로그인 설정 안내" })).toHaveTextContent(
      "Google OAuth 자격 증명을 안전하게 설정한 뒤에만 활성화할 수 있습니다",
    );
  });

  it("offers Google OAuth in local dev mode only after the explicit public flag is enabled", () => {
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");
    vi.stubEnv("VITE_ENABLE_GOOGLE_LOGIN", "true");

    render(<LoginRoute />);

    expect(screen.getByRole("link", { name: "Google로 시작하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
    expect(screen.queryByRole("note", { name: "로컬 Google 로그인 설정 안내" })).not.toBeInTheDocument();
  });

  it("submits dev login through the shared BFF client and preserves the user redirect", async () => {
    const user = userEvent.setup();
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "",
      pathname: "/login",
      search: "?returnTo=%2Fclubs%2Freading-sai%2Fapp",
    });

    render(<LoginRoute />);

    await user.click(screen.getByRole("button", { name: "김호스트 · 호스트" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/dev/login",
      expect.objectContaining({
        body: JSON.stringify({ email: "host@example.com" }),
        cache: "no-store",
        method: "POST",
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Content-Type")).toBe("application/json");
    expect(assignMock).toHaveBeenCalledWith("/clubs/reading-sai/app");
  });

  it("submits admin dev login and enters the admin console by default", async () => {
    const user = userEvent.setup();
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "",
      pathname: "/login",
      search: "",
    });

    render(<LoginRoute />);

    await user.click(screen.getByRole("button", { name: "플랫폼 관리자 · OWNER" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/dev/login",
      expect.objectContaining({
        body: JSON.stringify({ email: "admin-owner@example.com" }),
        cache: "no-store",
        method: "POST",
      }),
    );
    expect(assignMock).toHaveBeenCalledWith("/admin");
  });

  it("offers another Google account after a left-membership login", () => {
    window.history.pushState(
      {},
      "",
      "/login?error=membership-left&returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );

    render(<LoginRoute />);

    expect(screen.getByRole("alert")).toHaveTextContent("이전 멤버십이 종료된 계정입니다.");
    expect(screen.getByRole("link", { name: "다른 Google 계정으로 로그인" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );
  });

  it("prioritizes external-browser recovery in KakaoTalk", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const origin = window.location.origin;
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 KAKAOTALK/25.7.0",
      clipboard: { writeText },
    });
    window.history.pushState(
      {},
      "",
      "/login?error=membership-left&returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );

    render(<LoginRoute />);

    expect(screen.getByRole("heading", { name: "외부 브라우저에서 로그인해 주세요" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "로그인 주소 복사" }));
    expect(writeText).toHaveBeenCalledWith(
      `${origin}/login?error=membership-left&returnTo=%2Fclubs%2Freading-sai%2Fapp`,
    );
    expect(screen.getByRole("status")).toHaveTextContent("로그인 주소를 복사했습니다");
    expect(screen.getByRole("link", { name: "둘러보기" })).toHaveAttribute("href", "/clubs/reading-sai/app");
    expect(screen.getByRole("link", { name: "Google 로그인 시도" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );
  });

  it("explains clipboard failure without hiding the browser-menu recovery", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 KAKAOTALK/25.7.0",
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    render(<LoginRoute />);
    await user.click(screen.getByRole("button", { name: "로그인 주소 복사" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "주소를 복사하지 못했습니다. 브라우저 메뉴에서 다른 브라우저로 열어 주세요",
    );
  });

  it("offers account selection after a generic Google failure", () => {
    window.history.pushState({}, "", "/login?error=google");

    render(<LoginRoute />);

    expect(screen.getByRole("alert")).toHaveTextContent("Google 인증을 완료하지 못했습니다.");
    expect(screen.getByRole("link", { name: "Google 로그인 다시 시도" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google?chooseAccount=true",
    );
  });

  it("ignores unknown OAuth errors without changing the normal action", () => {
    window.history.pushState({}, "", "/login?error=provider-detail");

    render(<LoginRoute />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 시작하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
  });

});
