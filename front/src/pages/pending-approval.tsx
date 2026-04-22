import { Link } from "@/src/app/router-link";

export default function PendingApprovalPage() {
  return (
    <main className="app-content">
      <section className="page-header-compact">
        <div className="container">
          <p className="eyebrow">둘러보기 멤버</p>
          <h1 className="h1 editorial">전체 세션은 읽을 수 있고, 참여는 정식 멤버에게 열립니다.</h1>
          <p className="body" style={{ color: "var(--text-2)" }}>
            초대 없이 Google로 로그인한 계정은 둘러보기 멤버로 시작합니다. 호스트가 정식 멤버로 전환하면 RSVP,
            체크인, 질문, 서평 작성이 열립니다.
          </p>
          <div className="row" style={{ marginTop: 24, gap: 10, flexWrap: "wrap" }}>
            <Link to="/app/archive" className="btn btn-primary">
              전체 세션 둘러보기
            </Link>
            <Link to="/app/session/current" className="btn btn-ghost">
              이번 세션 보기
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
