import type { PlatformAdminWorkQueueItem } from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  items: PlatformAdminWorkQueueItem[];
  selectedClubId: string | null;
  onSelectClub?: (clubId: string) => void;
};

export function PlatformAdminWorkQueue({ items, selectedClubId, onSelectClub }: Props) {
  return (
    <section className="platform-admin-work-queue" aria-labelledby="platform-admin-work-queue-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Operations queue</p>
          <h2 id="platform-admin-work-queue-title" className="h3 editorial">
            운영 작업 큐
          </h2>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="platform-admin-club-list">
          {items.map((item) => (
            <button
              type="button"
              key={item.clubId}
              className="surface platform-admin-club-row platform-admin-work-queue__row"
              data-severity={item.severity}
              aria-pressed={item.clubId === selectedClubId}
              onClick={() => onSelectClub?.(item.clubId)}
            >
              <span className="platform-admin-club-row__main">
                <strong>{item.name}</strong>
                <span className="tiny muted">{item.slug}</span>
                <span className="tiny muted platform-admin-work-queue__reason">{`· ${item.reason}`}</span>
              </span>
              <span className="platform-admin-domain-status">{item.primaryActionLabel}</span>
              <span className="platform-admin-work-queue__badges">
                {item.badges.map((badge) => (
                  <span className="platform-admin-domain-status" key={badge}>
                    {badge}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted platform-admin-domain-empty">표시할 클럽이 없습니다.</p>
      )}
    </section>
  );
}
