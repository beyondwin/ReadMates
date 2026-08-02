import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { guestSessionDetailReadView } from "@/features/archive/model/session-detail-read-view";
import { MemberSessionDetailRoute } from "@/features/archive/route/member-session-detail-route";
import MemberSessionDetailPage, {
  MemberSessionDetailUnavailablePage,
} from "@/features/archive/ui/member-session-detail-page";
import type { GuestSessionDetailContentProps } from "@/features/guest-browse/route/guest-scoped-app-route";
import { guestArchiveDetailQuery } from "@/features/guest-browse/queries/guest-browse-queries";

export default function MemberSessionRoutePage() {
  const { clubSlug = "", sessionId = "" } = useParams();
  const publicDetailQuery = useQuery({
    ...guestArchiveDetailQuery(clubSlug, sessionId),
    enabled: Boolean(clubSlug && sessionId),
    retry: false,
  });
  const publicDetail = publicDetailQuery.data
    ? guestSessionDetailReadView(publicDetailQuery.data)
    : null;

  return <MemberSessionDetailRoute publicLongReviews={publicDetail?.publicLongReviews ?? []} />;
}

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
