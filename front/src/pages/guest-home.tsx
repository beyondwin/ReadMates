import type { GuestHomeContentProps } from "@/features/guest-browse/route/guest-scoped-app-route";
import {
  guestMemberHomeReadView,
  type GuestMemberHomeReadSource,
} from "@/features/member-home/model/member-home-read-view";
import MemberHome from "@/features/member-home/ui/member-home";
import type { MemberHomeLinkComponent } from "@/features/member-home/ui/member-home-link";

export function GuestHomeContent({
  data,
  appBasePath,
  LinkComponent,
  onRetry,
}: GuestHomeContentProps) {
  const GuestMemberHomeLink: MemberHomeLinkComponent = ({ to, ...props }) => (
    <LinkComponent {...props} to={`${appBasePath}${to.replace(/^\/app/, "")}`} />
  );
  const current: GuestMemberHomeReadSource["current"] = {
    currentSession: data.current.currentSession
      ? { ...data.current.currentSession, bookLink: null }
      : null,
  };

  return (
    <MemberHome
      view={guestMemberHomeReadView({ ...data, current })}
      widgetErrors={data.widgetErrors}
      LinkComponent={GuestMemberHomeLink}
      onRetry={onRetry}
    />
  );
}
