import {
  PublicGuestOnlyActions,
  PublicInviteGuidance,
  type AppLinkComponent,
  type AppLinkProps,
} from "@/shared/ui/public-auth-action";

type PublicFooterProps = {
  showGuestMemberActions?: boolean;
  publicBasePath?: string;
  LinkComponent?: AppLinkComponent;
};

function DefaultLink({ to, resetScroll = false, children, ...props }: AppLinkProps) {
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        if (!resetScroll || event.defaultPrevented || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
          return;
        }

        window.sessionStorage.removeItem("readmates:archive-scroll");
        window.sessionStorage.removeItem("readmates:public-records-scroll");
        window.scrollTo({ top: 0, behavior: "auto" });
      }}
    >
      {children}
    </a>
  );
}

function prefixedPath(publicBasePath: string, path: string) {
  return publicBasePath ? `${publicBasePath}${path === "/" ? "" : path}` : path;
}

export function PublicFooter({ publicBasePath = "", showGuestMemberActions = true, LinkComponent = DefaultLink }: PublicFooterProps) {
  return (
    <footer className="public-footer">
      <div className="container public-footer__inner">
        <div className="public-footer__brand">
          <div className="editorial h3" style={{ marginBottom: 6 }}>
            읽는사이
          </div>
          <div className="small">공개 기록은 누구나 읽고, 함께 읽는 자리는 초대받은 멤버와 이어갑니다.</div>
        </div>
        <nav className="public-footer__nav" aria-label="공개 하단 탐색">
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              클럽
            </div>
            <div className="small public-footer__links">
              <LinkComponent to={prefixedPath(publicBasePath, "/")} resetScroll>
                공개 홈
              </LinkComponent>
              <LinkComponent to={prefixedPath(publicBasePath, "/about")} resetScroll>
                클럽 소개
              </LinkComponent>
              <LinkComponent to={prefixedPath(publicBasePath, "/records")} resetScroll>
                공개 기록
              </LinkComponent>
            </div>
          </div>
          {showGuestMemberActions ? (
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                멤버
              </div>
              <div className="small public-footer__links">
                <PublicGuestOnlyActions>
                  <LinkComponent to="/login">기존 멤버 로그인</LinkComponent>
                  <PublicInviteGuidance className="public-footer__invite-guidance" />
                </PublicGuestOnlyActions>
              </div>
            </div>
          ) : null}
        </nav>
      </div>
      <div className="container" style={{ marginTop: 40 }}>
        <div className="rule">
          <span className="mono">© 2025 · 읽는사이</span>
        </div>
      </div>
    </footer>
  );
}
