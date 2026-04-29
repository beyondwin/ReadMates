import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { usableJoinedClubs } from "@/features/club-selection/model/club-entry";

type ClubSelectionLinkComponent = ComponentType<{
  to: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}>;

export function ClubSelectionPage({ auth, linkComponent: Link }: { auth: AuthMeResponse; linkComponent: ClubSelectionLinkComponent }) {
  const clubs = usableJoinedClubs(auth.joinedClubs);

  return (
    <main className="auth-pending-content">
      <section className="auth-pending-section">
        <div className="container">
          <div className="surface auth-card auth-card--pending">
            <p className="eyebrow">읽는사이</p>
            <h1 className="h1 editorial auth-card__title">클럽을 선택하세요</h1>
            <p className="body auth-card__lede">
              같은 로그인 세션으로 참여 중인 클럽을 전환할 수 있습니다.
            </p>
            {clubs.length === 0 ? (
              <div className="surface-quiet" style={{ padding: "18px 20px" }}>
                <p className="body" style={{ margin: 0, fontWeight: 700 }}>
                  열 수 있는 클럽이 없습니다.
                </p>
                <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                  초대 링크를 받았다면 해당 클럽 초대 화면에서 다시 수락해 주세요.
                </p>
              </div>
            ) : (
              <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
                {clubs.map((club) => (
                  <Link
                    key={club.membershipId}
                    to={`/clubs/${encodeURIComponent(club.clubSlug)}/app`}
                    className="surface-quiet"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "16px 18px",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span>
                      <span className="h3 editorial" style={{ display: "block", margin: 0 }}>
                        {club.clubName}
                      </span>
                      <span className="tiny muted" style={{ display: "block", marginTop: 4 }}>
                        {club.primaryHost ?? club.clubSlug}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <span className="badge">{club.role}</span>
                      <span className="badge">{club.status}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
