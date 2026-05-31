import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  platformAdminClubsQuery,
  platformAdminSupportGrantsQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminClubOperationsQuery } from "@/features/platform-admin/queries/platform-admin-club-operations-queries";
import { AdminClubOperationsPage } from "@/features/platform-admin/ui/admin-club-operations-page";
import { useAdminBreadcrumbExtra } from "./admin-breadcrumb-hook";

export function AdminClubDetailRoute() {
  const { clubId = "" } = useParams<{ clubId: string }>();
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  const supportGrantsQuery = useQuery(platformAdminSupportGrantsQuery(clubId));
  const operationsQuery = useQuery(platformAdminClubOperationsQuery(clubId));
  const club = clubs.items.find((entry) => entry.clubId === clubId) ?? null;
  const { setExtra } = useAdminBreadcrumbExtra();

  useEffect(() => {
    setExtra(club?.name ?? null);
    return () => setExtra(null);
  }, [club?.name, setExtra]);

  if (!club) {
    return (
      <section className="admin-club-detail" aria-label="클럽 상세">
        <p className="muted">해당 클럽을 찾을 수 없습니다.</p>
        <Link to="/admin/clubs" className="btn btn-ghost btn-sm">← 클럽 목록</Link>
      </section>
    );
  }

  return (
    <section className="admin-club-detail" aria-labelledby="admin-club-detail-title">
      <header className="admin-club-detail__header">
        <h1 id="admin-club-detail-title" className="h1 editorial">{club.name}</h1>
        <p className="muted">{club.slug} · {club.status} · {club.publicVisibility}</p>
        {club.tagline ? <p className="body">{club.tagline}</p> : null}
        <Link to="/admin/clubs" className="btn btn-ghost btn-sm">← 클럽 목록</Link>
      </header>
      <dl className="admin-club-detail__meta">
        <div><dt>도메인</dt><dd>{club.domainCount}{club.domainActionRequiredCount > 0 ? ` · 조치 ${club.domainActionRequiredCount}` : ""}</dd></div>
        <div><dt>호스트 온보딩</dt><dd>{club.firstHostOnboardingState}</dd></div>
      </dl>
      {club.about ? (
        <section className="admin-club-detail__about">
          <h2 className="h3">소개</h2>
          <p className="body">{club.about}</p>
        </section>
      ) : null}
      {operationsQuery.data ? (
        <AdminClubOperationsPage
          snapshot={operationsQuery.data}
          supportGrantCount={supportGrantsQuery.data?.length ?? 0}
        />
      ) : null}
    </section>
  );
}
