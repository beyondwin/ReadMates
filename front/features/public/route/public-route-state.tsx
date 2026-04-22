export function PublicRouteError() {
  return (
    <main className="container">
      <section className="surface" style={{ margin: "48px 0", padding: 28 }}>
        <p className="eyebrow">불러오기 실패</p>
        <h1 className="h2 editorial" style={{ margin: "8px 0 0" }}>
          페이지를 불러오지 못했습니다.
        </h1>
        <p className="body" style={{ color: "var(--text-2)" }}>
          네트워크 연결 또는 계정 권한을 확인한 뒤 새로고침해 주세요. 계속 실패하면 이전 화면으로 돌아가 다시 시도해 주세요.
        </p>
      </section>
    </main>
  );
}
