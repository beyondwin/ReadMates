export function MemberSummary({
  viewerCount,
  activeCount,
  suspendedCount,
}: {
  viewerCount: number;
  activeCount: number;
  suspendedCount: number;
}) {
  return (
    <section className="rm-document-panel" aria-label="멤버 운영 요약" style={{ padding: "18px 22px" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        멤버 상태 원장
      </div>
      <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
        활동 <span className="mono">{activeCount}</span>명 · 둘러보기{" "}
        <span className="mono">{viewerCount}</span>명 · 쉬는 중 <span className="mono">{suspendedCount}</span>명
      </p>
    </section>
  );
}
