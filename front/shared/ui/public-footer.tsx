export function PublicFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 80, padding: "36px 0 48px" }}>
      <div className="container row-between" style={{ alignItems: "flex-start", gap: 40, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 420 }}>
          <div className="editorial h3" style={{ marginBottom: 6 }}>
            읽는사이
          </div>
          <div className="small">
            책을 읽고, 사람을 읽고, 세상을 읽는 시간. 한 달에 한 번, 수요일 저녁 8시.
          </div>
        </div>
        <div className="row" style={{ gap: 40, alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              클럽
            </div>
            <div className="small" style={{ lineHeight: 2 }}>
              <div>공개 소개</div>
              <div>지난 모임</div>
              <div>안내문</div>
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              멤버
            </div>
            <div className="small" style={{ lineHeight: 2 }}>
              <div>로그인</div>
              <div>초대 수락</div>
              <div>문의</div>
            </div>
          </div>
        </div>
      </div>
      <div className="container" style={{ marginTop: 40 }}>
        <div className="rule">
          <span className="mono">© 2026 · 읽는사이 · v1.4</span>
        </div>
      </div>
    </footer>
  );
}
