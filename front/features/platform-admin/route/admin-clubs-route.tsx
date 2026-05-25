import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";

export function AdminClubsRoute() {
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  return (
    <section className="admin-clubs" aria-labelledby="admin-clubs-title">
      <header className="admin-clubs__header">
        <h1 id="admin-clubs-title" className="h1 editorial">클럽</h1>
        <p className="body">플랫폼이 보유한 모든 클럽 목록입니다. 행을 클릭해서 운영 상세로 들어갑니다.</p>
        <Link to="?onboarding=1" className="btn btn-primary btn-sm">새 클럽</Link>
      </header>
      {clubs.items.length === 0 ? (
        <p className="muted">클럽이 없습니다.</p>
      ) : (
        <table className="admin-clubs__table">
          <thead>
            <tr>
              <th scope="col">Slug</th>
              <th scope="col">이름</th>
              <th scope="col">상태</th>
              <th scope="col">공개</th>
              <th scope="col">도메인</th>
              <th scope="col">호스트</th>
            </tr>
          </thead>
          <tbody>
            {clubs.items.map((club) => (
              <tr key={club.clubId}>
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
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
