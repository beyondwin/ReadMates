export function MemberSummary({
  viewerCount,
  activeCount,
  currentSessionParticipantCount,
  activeOutsideCurrentSessionCount,
  suspendedCount,
}: {
  viewerCount: number;
  activeCount: number;
  currentSessionParticipantCount: number;
  activeOutsideCurrentSessionCount: number;
  suspendedCount: number;
}) {
  return (
    <section
      className="rm-document-panel"
      aria-label="멤버 운영 요약"
      style={{ padding: "18px 22px" }}
    >
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        멤버 상태 원장
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
          gap: 12,
        }}
      >
        <MemberCount label="둘러보기" value={viewerCount} helper="둘러보기 멤버" tone={viewerCount > 0 ? "accent" : "default"} />
        <MemberCount label="활성" value={activeCount} helper="정식 멤버" tone="ok" />
        <MemberCount label="이번 세션" value={currentSessionParticipantCount} helper="참여 중" tone="ok" />
        <MemberCount
          label="미포함"
          value={activeOutsideCurrentSessionCount}
          helper="활성 중 미참여"
          tone={activeOutsideCurrentSessionCount > 0 ? "warn" : "default"}
        />
        <MemberCount label="정지" value={suspendedCount} helper="쓰기 제한" tone={suspendedCount > 0 ? "warn" : "default"} />
      </div>
    </section>
  );
}

function MemberCount({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: "ok" | "warn" | "accent" | "default";
}) {
  const className =
    tone === "ok"
      ? "badge badge-ok badge-dot"
      : tone === "warn"
        ? "badge badge-warn badge-dot"
        : tone === "accent"
          ? "badge badge-accent badge-dot"
          : "badge";

  return (
    <div className="surface-quiet" style={{ padding: "12px 14px" }}>
      <div className="row-between" style={{ gap: 8 }}>
        <span className="body" style={{ fontSize: "13px", fontWeight: 600 }}>
          {label}
        </span>
        <span className={className}>{value}</span>
      </div>
      <div className="tiny" style={{ marginTop: 4 }}>
        {helper}
      </div>
    </div>
  );
}
