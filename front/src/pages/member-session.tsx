import { guestSessionDetailReadView } from "@/features/archive/model/session-detail-read-view";
import { MemberSessionDetailRoute } from "@/features/archive/route/member-session-detail-route";
import MemberSessionDetailPage, {
  MemberSessionDetailUnavailablePage,
} from "@/features/archive/ui/member-session-detail-page";
import type { GuestSessionDetailContentProps } from "@/features/guest-browse/route/guest-scoped-app-route";

export default MemberSessionDetailRoute;

export function GuestSessionDetailContent({
  data,
  appBasePath,
  feedbackLockedAction,
}: GuestSessionDetailContentProps) {
  const session = guestSessionDetailReadView(data);
  const returnTarget = {
    href: `${appBasePath}/archive`,
    label: "아카이브로",
  };

  return session ? (
    <MemberSessionDetailPage
      session={session}
      returnTarget={returnTarget}
      feedbackLockedAction={feedbackLockedAction}
    />
  ) : (
    <MemberSessionDetailUnavailablePage returnTarget={returnTarget} />
  );
}
