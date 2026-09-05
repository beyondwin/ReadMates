import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { HostPersonDetail } from "@/features/host/api/host-person-contracts";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import { hostPersonDetailQuery, hostPersonKeys } from "@/features/host/queries/host-person-queries";
import { invalidateHostMembers } from "@/features/host/queries/host-members-queries";
import { HostPersonDetail as HostPersonDetailView } from "@/features/host/ui/person/host-person-detail";
import { HostPersonExcludeDialog, HostPersonRenameDialog } from "@/features/host/ui/person/host-person-detail-dialogs";
import {
  isTransitionOwnerObsoleteError,
  TransitionOwnerObsoleteError,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";
import { createHostMembersActions } from "./host-members-data";

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

function excludeAvailability(person: HostPersonDetail) {
  if (person.role === "HOST") {
    return { disabled: true, reason: "공동 호스트는 이 화면에서 모임 제외할 수 없습니다." };
  }
  if (person.status !== "ACTIVE") {
    return { disabled: true, reason: "활동 중이 아닌 멤버는 모임에서 제외할 수 없습니다." };
  }
  return { disabled: false, reason: null };
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
  const memberOwner = useTransitionSafetyOwner("host-person-detail");
  const actions = useMemo(
    () => createHostMembersActions(queryClient, context),
    [context, queryClient],
  );
  const executeAccepted = async <T,>(operationId: string, request: () => Promise<T>) => {
    const handle = memberOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      return result;
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) throw error;
      if (await handle.settle("failed") !== "accepted") throw new TransitionOwnerObsoleteError();
      throw error;
    }
  };
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
  const [dialog, setDialog] = useState<"rename" | "exclude" | null>(null);
  const [excludeError, setExcludeError] = useState<string | null>(null);
  const [excludeSubmitting, setExcludeSubmitting] = useState(false);
  const peopleHref = clubSlug
    ? `/clubs/${encodeURIComponent(clubSlug)}/app/host/people`
    : "/app/host/people";
  const detail = detailQuery.data;

  if (!membershipId) {
    return <PersonFailure message="사람 정보를 찾을 수 없습니다." peopleHref={peopleHref} LinkComponent={LinkComponent} />;
  }
  if (detailQuery.isPending) {
    return <main className="rm-person-detail rm-host-person"><p role="status">사람 정보를 불러오는 중입니다.</p></main>;
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
  const exclude = excludeAvailability(detail);

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

  const publishPersonChange = async () => {
    await queryClient.invalidateQueries({ queryKey: hostPersonKeys.person(membershipId, context) });
    await invalidateHostMembers(queryClient, context);
  };

  const submitRename = async (displayName: string) => {
    await executeAccepted(
      `host-member:profile:${membershipId}`,
      () => actions.submitProfile(membershipId, displayName),
    );
    await publishPersonChange();
  };

  const confirmExclude = async () => {
    if (exclude.disabled || excludeSubmitting) return;
    setExcludeSubmitting(true);
    setExcludeError(null);
    try {
      await executeAccepted(
        `host-member:lifecycle:${membershipId}:/current-session/remove`,
        () => actions.submitLifecycle(membershipId, "/current-session/remove"),
      );
      await publishPersonChange();
      setDialog(null);
    } catch (error) {
      if (isTransitionOwnerObsoleteError(error)) return;
      setExcludeError("모임 제외에 실패했습니다. 멤버 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setExcludeSubmitting(false);
    }
  };

  return (
    <>
      <HostPersonDetailView
        person={detail}
        attendanceItems={visible.items}
        nextCursor={visible.nextCursor}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
        onLoadMore={() => { void loadMore(); }}
        peopleHref={peopleHref}
        onRename={() => setDialog("rename")}
        onExclude={() => {
          setExcludeError(null);
          setDialog("exclude");
        }}
        excludeDisabled={exclude.disabled}
        excludeUnavailableReason={exclude.reason}
        LinkComponent={LinkComponent}
      />
      {dialog === "rename" ? (
        <HostPersonRenameDialog
          displayName={detail.displayName}
          submitting={false}
          onClose={() => setDialog(null)}
          onSubmit={submitRename}
        />
      ) : null}
      {dialog === "exclude" ? (
        <HostPersonExcludeDialog
          displayName={detail.displayName}
          submitting={excludeSubmitting}
          error={excludeError}
          onClose={() => setDialog(null)}
          onConfirm={() => { void confirmExclude(); }}
        />
      ) : null}
    </>
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
    <main className="rm-person-detail rm-host-person">
      <section role="alert" className="rm-person-detail__section">
        <span aria-hidden="true">!</span>
        <div>
          <h1>사람 정보</h1>
          <p>{message}</p>
          {onRetry ? <button type="button" className="btn btn-ghost" onClick={onRetry}>다시 시도</button> : null}
          <div className="rm-person-detail__links">
            <LinkComponent to={peopleHref} className="rm-person-detail__back">사람</LinkComponent>
          </div>
        </div>
      </section>
    </main>
  );
}
