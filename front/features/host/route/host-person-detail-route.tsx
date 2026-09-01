import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { HostPersonDetail } from "@/features/host/api/host-person-contracts";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import { hostPersonDetailQuery } from "@/features/host/queries/host-person-queries";
import { HostPersonDetail as HostPersonDetailView } from "@/features/host/ui/person/host-person-detail";

type PersonLinkProps = { to: string; className?: string; children: ReactNode };
const DefaultLink: ComponentType<PersonLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

const PAGE_LIMIT = 20;

function attendanceTuple(item: HostPersonDetail["attendanceHistory"]["items"][number]) {
  return `${item.sessionNumber}\u0000${item.scheduledAt}\u0000${item.attendanceStatus}`;
}

function appendAttendance(
  current: HostPersonDetail["attendanceHistory"]["items"],
  next: HostPersonDetail["attendanceHistory"]["items"],
) {
  const seen = new Set(current.map(attendanceTuple));
  return [...current, ...next.filter((item) => {
    const key = attendanceTuple(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

export function HostPersonDetailRoute({
  LinkComponent = DefaultLink,
}: {
  LinkComponent?: ComponentType<PersonLinkProps>;
}) {
  const { clubSlug, membershipId: routeMembershipId } = useParams<{
    clubSlug: string;
    membershipId: string;
  }>();
  const membershipId = routeMembershipId ?? "";
  const context = useMemo(() => requireHostClubContext(clubSlug), [clubSlug]);
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    ...hostPersonDetailQuery(membershipId, undefined, context),
    enabled: Boolean(membershipId),
    retry: false,
  });
  const [continuation, setContinuation] = useState<{
    base: HostPersonDetail;
    items: HostPersonDetail["attendanceHistory"]["items"];
    nextCursor: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const peopleHref = clubSlug
    ? `/clubs/${encodeURIComponent(clubSlug)}/app/host/people`
    : "/app/host/people";
  const detail = detailQuery.data;

  if (!membershipId) {
    return <PersonFailure message="사람 정보를 찾을 수 없습니다." peopleHref={peopleHref} LinkComponent={LinkComponent} />;
  }
  if (detailQuery.isPending) {
    return <main className="rm-host-person"><p role="status">사람 정보를 불러오는 중입니다.</p></main>;
  }
  if (detailQuery.isError || !detail) {
    return (
      <PersonFailure
        message="사람 정보를 불러오지 못했습니다."
        peopleHref={peopleHref}
        onRetry={() => { void detailQuery.refetch(); }}
        LinkComponent={LinkComponent}
      />
    );
  }
  if (detail.membershipId !== membershipId) {
    return <PersonFailure message="사람 정보를 안전하게 확인하지 못했습니다." peopleHref={peopleHref} LinkComponent={LinkComponent} />;
  }

  const visible = continuation?.base === detail
    ? continuation
    : { base: detail, items: detail.attendanceHistory.items, nextCursor: detail.attendanceHistory.nextCursor };

  const loadMore = async () => {
    const cursor = visible.nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await queryClient.fetchQuery(hostPersonDetailQuery(
        membershipId,
        { attendanceCursor: cursor, limit: PAGE_LIMIT },
        context,
      ));
      if (page.membershipId !== membershipId) throw new Error("PERSON_IDENTITY_MISMATCH");
      setContinuation((current) => {
        const currentItems = current?.base === detail ? current.items : detail.attendanceHistory.items;
        return {
          base: detail,
          items: appendAttendance(currentItems, page.attendanceHistory.items),
          nextCursor: page.attendanceHistory.nextCursor,
        };
      });
    } catch {
      setLoadMoreError("참석 기록을 더 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <HostPersonDetailView
      person={detail}
      attendanceItems={visible.items}
      nextCursor={visible.nextCursor}
      loadingMore={loadingMore}
      loadMoreError={loadMoreError}
      onLoadMore={() => { void loadMore(); }}
      peopleHref={peopleHref}
      LinkComponent={LinkComponent}
    />
  );
}

function PersonFailure({
  message,
  peopleHref,
  onRetry,
  LinkComponent,
}: {
  message: string;
  peopleHref: string;
  onRetry?: () => void;
  LinkComponent: ComponentType<PersonLinkProps>;
}) {
  return (
    <main className="rm-host-person">
      <section role="alert" className="rm-host-person__management">
        <h1>사람 정보</h1>
        <p>{message}</p>
        {onRetry ? <button type="button" className="btn btn-ghost" onClick={onRetry}>다시 시도</button> : null}
        <LinkComponent to={peopleHref} className="btn btn-quiet">사람 목록으로</LinkComponent>
      </section>
    </main>
  );
}
