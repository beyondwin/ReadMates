import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  CLUB_TRIAGE_LABEL,
  clubTriageReasons,
  clubTriageSeverity,
  filterClubsBySeverity,
  rankClubsByTriage,
  type ClubTriageFilter,
} from "@/features/platform-admin/model/platform-admin-club-triage-model";

const FILTER_OPTIONS: ReadonlyArray<{ value: ClubTriageFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "critical", label: "긴급" },
  { value: "attention", label: "주의" },
];

export function AdminClubsRoute() {
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  const [filter, setFilter] = useState<ClubTriageFilter>("all");
  const ordered = rankClubsByTriage(filterClubsBySeverity(clubs.items, filter));
  return (
    <section className="admin-clubs" aria-labelledby="admin-clubs-title">
      <header className="admin-clubs__header">
        <h1 id="admin-clubs-title" className="h1 editorial">클럽</h1>
        <p className="body">플랫폼이 보유한 모든 클럽 목록입니다. 조치가 필요한 클럽이 위에 옵니다.</p>
        <Link to="?onboarding=1" className="btn btn-primary btn-sm">새 클럽</Link>
      </header>
      <div className="admin-clubs__filters" role="group" aria-label="상태 신호 필터">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`btn btn-sm ${filter === option.value ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {clubs.items.length === 0 ? (
        <p className="muted">클럽이 없습니다.</p>
      ) : ordered.length === 0 ? (
        <p className="muted">선택한 필터에 해당하는 클럽이 없습니다.</p>
      ) : (
        <table className="admin-clubs__table">
          <thead>
            <tr>
              <th scope="col">상태 신호</th>
              <th scope="col">Slug</th>
              <th scope="col">이름</th>
              <th scope="col">상태</th>
              <th scope="col">공개</th>
              <th scope="col">도메인</th>
              <th scope="col">호스트</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((club) => {
              const severity = clubTriageSeverity(club);
              const reasons = clubTriageReasons(club);
              return (
                <tr key={club.clubId} className={`admin-clubs__row admin-clubs__row--${severity}`}>
                  <td>
                    <span className={`admin-clubs__triage admin-clubs__triage--${severity}`}>
                      {CLUB_TRIAGE_LABEL[severity]}
                    </span>
                    {reasons.length > 0 ? (
                      <span className="admin-clubs__triage-reasons">{reasons.join(" · ")}</span>
                    ) : null}
                  </td>
                  <td>{club.slug}</td>
                  <td>
                    <Link to={`/admin/clubs/${club.clubId}`}>{club.name}</Link>
                  </td>
                  <td>{club.status}</td>
                  <td>{club.publicVisibility}</td>
                  <td>
                    {club.domainCount}
                    {club.domainActionRequiredCount > 0 ? ` · ${club.domainActionRequiredCount} 조치 필요` : ""}
                  </td>
                  <td>{club.firstHostOnboardingState}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
