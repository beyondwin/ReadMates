import type { ClubShellLinkComponent } from "@/shared/model/app-club-shell";
import "./host-shell.css";

export type HostPrimaryDestinationId = "operating-room" | "meetings" | "people" | "records";

export type HostPrimaryDestination = {
  id: HostPrimaryDestinationId;
  href: string;
  current: boolean;
  navigation?: "push" | "replace";
  disabledReason?: string | null;
};

export type HostPrimaryNavigationProps = {
  destinations: readonly HostPrimaryDestination[];
  mode: "desktop" | "mobile";
  LinkComponent?: ClubShellLinkComponent;
};

const labels: Record<HostPrimaryDestinationId, { desktop: string; mobile: string }> = {
  "operating-room": { desktop: "운영실", mobile: "운영실" },
  meetings: { desktop: "일정과 모임", mobile: "모임" },
  people: { desktop: "사람", mobile: "사람" },
  records: { desktop: "기록", mobile: "기록" },
};

const DefaultLink: ClubShellLinkComponent = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export function HostPrimaryNavigation({
  destinations,
  mode,
  LinkComponent = DefaultLink,
}: HostPrimaryNavigationProps) {
  const navigationLabel = mode === "desktop" ? "호스트 주 메뉴" : "호스트 주 메뉴 모바일";

  return (
    <nav
      className={`rm-host-primary-navigation rm-host-primary-navigation--${mode}`}
      aria-label={navigationLabel}
    >
      <ul>
        {destinations.map((destination) => {
          const label = labels[destination.id][mode];
          const reasonId = `host-primary-${mode}-${destination.id}-reason`;

          return (
            <li key={destination.id}>
              {destination.disabledReason ? (
                <>
                  <span
                    className="rm-host-primary-navigation__item is-disabled"
                    aria-disabled="true"
                    aria-describedby={reasonId}
                  >
                    {label}
                  </span>
                  <span id={reasonId} className="rm-sr-only">{destination.disabledReason}</span>
                </>
              ) : (
                <LinkComponent
                  to={destination.href}
                  replace={destination.navigation === "replace"}
                  className="rm-host-primary-navigation__item"
                  aria-current={destination.current ? "page" : undefined}
                >
                  {label}
                </LinkComponent>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
