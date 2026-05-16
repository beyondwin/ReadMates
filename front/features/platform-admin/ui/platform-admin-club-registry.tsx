export type PlatformAdminClubRegistryItem = {
  clubId: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  status: "SETUP_REQUIRED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  publicVisibility: "PRIVATE" | "PUBLIC";
  domainCount: number;
  domainActionRequiredCount: number;
  firstHostOnboardingState: "MISSING" | "INVITED" | "ASSIGNED";
};

type Props = {
  clubs: { items: PlatformAdminClubRegistryItem[] };
  onSelectClub?: (club: PlatformAdminClubRegistryItem) => void;
  onNewClub?: () => void;
};

export function PlatformAdminClubRegistry({ clubs, onSelectClub, onNewClub }: Props) {
  return (
    <section className="platform-admin-clubs" aria-labelledby="platform-admin-clubs-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Club registry</p>
          <h2 id="platform-admin-clubs-title" className="h3 editorial">
            클럽 레지스트리
          </h2>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNewClub}>
          새 클럽
        </button>
      </div>

      {clubs.items.length > 0 ? (
        <div className="platform-admin-club-list">
          {clubs.items.map((club) => (
            <button
              type="button"
              className="surface platform-admin-club-row"
              key={club.clubId}
              onClick={() => onSelectClub?.(club)}
            >
              <span className="platform-admin-club-row__main">
                <strong>{club.name}</strong>
                <span className="tiny muted">{club.slug}</span>
              </span>
              <span className="platform-admin-domain-status">{club.publicVisibility}</span>
              <span className="tiny muted">{club.status}</span>
              <span className="tiny muted">host {club.firstHostOnboardingState}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted platform-admin-domain-empty">등록된 클럽이 없습니다.</p>
      )}
    </section>
  );
}
