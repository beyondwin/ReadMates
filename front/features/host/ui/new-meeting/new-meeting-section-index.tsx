const sections = [
  { href: "#new-meeting-book", label: "책과 제목" },
  { href: "#new-meeting-schedule", label: "일시와 장소" },
  { href: "#new-meeting-audience", label: "멤버에게 보이기" },
  { href: "#new-meeting-review", label: "저장 전 확인" },
] as const;

export function NewMeetingSectionIndex() {
  return (
    <nav aria-label="새 모임 작성 목차" className="rm-new-meeting-page__section-index">
      <h2 className="h4 editorial">작성 목차</h2>
      <ol className="rm-host-session-workspace__progress-list">
        {sections.map((section) => (
          <li key={section.href}>
            <a className="rm-host-session-workspace__progress-button" href={section.href}>
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
