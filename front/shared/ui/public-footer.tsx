import { Link } from "@/src/app/router-link";
import { PublicGuestOnlyActions, PublicInviteGuidance } from "@/shared/ui/public-auth-action";

type PublicFooterProps = {
  showGuestMemberActions?: boolean;
};

export function PublicFooter({ showGuestMemberActions = true }: PublicFooterProps) {
  return (
    <footer className="public-footer">
      <div className="container public-footer__inner">
        <div className="public-footer__brand">
          <div className="editorial h3" style={{ marginBottom: 6 }}>
            읽는사이
          </div>
          <div className="small">공개 기록은 누구나 읽고, 참여는 초대받은 멤버가 이어갑니다.</div>
        </div>
        <nav className="public-footer__nav" aria-label="공개 하단 탐색">
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              클럽
            </div>
            <div className="small public-footer__links">
              <Link to="/" resetScroll>
                공개 홈
              </Link>
              <Link to="/about" resetScroll>
                클럽 소개
              </Link>
              <Link to="/records" resetScroll>
                공개 기록
              </Link>
            </div>
          </div>
          {showGuestMemberActions ? (
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                멤버
              </div>
              <div className="small public-footer__links">
                <PublicGuestOnlyActions>
                  <Link to="/login">기존 멤버 로그인</Link>
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
