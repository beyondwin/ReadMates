import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { parseAdminRouteReturnState } from "@/features/platform-admin/model/admin-route-state";
import type {
  PlatformAdminClubDetail,
  PlatformAdminClubVisibilityPreviewResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  adminCommandRecovery,
  type AdminCommandRecovery,
} from "@/features/platform-admin/model/platform-admin-command-recovery";
import {
  installPlatformAdminAuthorityLossHandler,
  isPlatformAdminAuthorityLossError,
  platformAdminCapabilitiesQuery,
  platformAdminClubDetailQuery,
  publishPlatformAdminClubState,
  publishUpdatedPlatformAdminClub,
  subscribePlatformAdminAuthorityLoss,
  useCheckPlatformAdminDomainProvisioningMutation,
  useConfirmPlatformAdminClubVisibilityMutation,
  useConfirmPlatformAdminDomainMutation,
  usePreviewPlatformAdminClubVisibilityMutation,
  usePreviewPlatformAdminDomainMutation,
  useUpdatePlatformAdminClubMutation,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminPageContext } from "@/features/platform-admin/ui/admin-page-context";
import { flattenSupportGrantLedgerPages } from "@/features/platform-admin/model/platform-admin-support-model";
import {
  ADMIN_COPY,
  clubLifecycleLabel,
  clubVisibilityLabel,
} from "@/features/platform-admin/model/admin-copy";
import { platformAdminSupportLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-support-queries";
import { platformAdminClubOperationsQuery } from "@/features/platform-admin/queries/platform-admin-club-operations-queries";
import { platformAdminAuditLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";
import {
  formatAdminAuditLedgerSentenceBody,
  formatAdminAuditOccurredAt,
  mergeAdminAuditLedgerPages,
} from "@/features/platform-admin/model/platform-admin-audit-model";
import { AdminClubOperationsPage } from "@/features/platform-admin/ui/admin-club-operations-page";
import { AdminClubDomainCommandPanel } from "@/features/platform-admin/ui/domain-provisioning-panel";
import {
  AdminSafeActionDock,
  type AdminSafeActionState,
} from "@/features/platform-admin/ui/admin-action-dock";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";
import { AdminReceiptTimeline } from "@/features/platform-admin/ui/admin-receipt-timeline";
import { AdminTargetLedgerInline } from "@/features/platform-admin/ui/admin-target-ledger-inline";
import { useAdminBreadcrumbExtra } from "./admin-breadcrumb-hook";

const CLUBS_ALLOWED = { fallback: "/admin/clubs", allowedPath: "/admin/clubs" };

export function AdminClubDetailRoute() {
  const { clubId = "" } = useParams<{ clubId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const returnState = parseAdminRouteReturnState(searchParams, CLUBS_ALLOWED);
  const detailQuery = useQuery(platformAdminClubDetailQuery(clubId));
  const capabilities = useQuery(platformAdminCapabilitiesQuery()).data ?? null;
  const canViewOperations =
    capabilities != null && canAdmin(capabilities, "VIEW_CLUB_OPERATIONS");
  const canViewSupport =
    capabilities != null && canAdmin(capabilities, "VIEW_SUPPORT");
  const canViewAudit =
    capabilities != null && canAdmin(capabilities, "VIEW_AUDIT");
  const supportGrantsQuery = useInfiniteQuery({
    ...platformAdminSupportLedgerInfiniteQuery({ clubId, status: "ACTIVE" }),
    enabled: canViewOperations && canViewSupport,
  });
  const operationsQuery = useQuery({
    ...platformAdminClubOperationsQuery(clubId),
    enabled: canViewOperations,
  });
  const auditQuery = useInfiniteQuery({
    ...platformAdminAuditLedgerInfiniteQuery({ clubId }),
    enabled: canViewAudit,
  });
  const club = detailQuery.data ?? null;
  const { setExtra } = useAdminBreadcrumbExtra();

  useEffect(() => {
    setExtra(club?.name ?? null);
    return () => setExtra(null);
  }, [club?.name, setExtra]);
  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
    return subscribePlatformAdminAuthorityLoss(() => undefined);
  }, [queryClient]);
  useEffect(() => {
    const queryKey = platformAdminSupportLedgerInfiniteQuery({
      clubId,
      status: "ACTIVE",
    }).queryKey;
    if (!canViewSupport) queryClient.removeQueries({ queryKey, exact: true });
    return () => queryClient.removeQueries({ queryKey, exact: true });
  }, [canViewSupport, clubId, queryClient]);

  if (detailQuery.isPending)
    return (
      <section className="admin-club-detail">
        <p className="muted">클럽 정보를 불러오는 중입니다.</p>
      </section>
    );
  if (detailQuery.isError || !club)
    return (
      <section className="admin-club-detail" aria-label="클럽 상세">
        <p role="alert">해당 클럽을 찾을 수 없습니다.</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void detailQuery.refetch()}
        >
          다시 시도
        </button>
        <ClubsReturnLink returnState={returnState} />
      </section>
    );

  const canManageClub =
    capabilities != null && canAdmin(capabilities, "MANAGE_CLUBS");
  const canManageDomains =
    capabilities != null && canAdmin(capabilities, "MANAGE_CLUB_DOMAINS");
  return (
    <section className="admin-club-detail" aria-label="클럽 상세">
      <AdminPageContext
        eyebrow={ADMIN_COPY.eyebrow.clubDetail}
        heading={club.name}
        description={`revision ${club.adminRevision} · ${clubLifecycleLabel(club.status)} · ${clubVisibilityLabel(club.publicVisibility)}`}
        action={<ClubsReturnLink returnState={returnState} />}
      />
      <ClubMetadataPanel
        key={`${club.adminRevision}-${canManageClub ? "manage" : "view"}`}
        club={club}
        canManage={canManageClub}
        onRefresh={() => void detailQuery.refetch()}
      />
      <VisibilityPanel
        key={`visibility-${club.adminRevision}-${club.publicVisibility}-${canManageClub ? "manage" : "view"}`}
        clubId={clubId}
        revision={club.adminRevision}
        current={club.publicVisibility}
        canManage={canManageClub}
        onRefresh={() => void detailQuery.refetch()}
      />
      <ClubDomainPanel
        key={`domains-${club.adminRevision}-${canManageDomains ? "manage" : "view"}-${club.domains.map((domain) => `${domain.id}:${domain.status}`).join("|")}`}
        clubId={clubId}
        revision={club.adminRevision}
        domains={club.domains}
        canManageDomains={canManageDomains}
        onRefresh={() => void detailQuery.refetch()}
      />
      {canViewOperations ? (
        <section
          className="admin-club-detail__panel"
          aria-labelledby="admin-club-operations-title"
        >
          {operationsQuery.isError ? (
            <PanelError
              label="운영 스냅샷"
              retry={() => void operationsQuery.refetch()}
            />
          ) : operationsQuery.data ? (
            <AdminClubOperationsPage
              snapshot={operationsQuery.data}
              supportGrantCount={
                canViewSupport && !supportGrantsQuery.isError && !supportGrantsQuery.hasNextPage
                  ? flattenSupportGrantLedgerPages(supportGrantsQuery.data?.pages ?? []).length
                  : undefined
              }
              supportGrantUnavailable={
                canViewSupport && supportGrantsQuery.isError
              }
              onRetrySupportGrants={() => void supportGrantsQuery.refetch()}
            />
          ) : (
            <p className="muted">운영 스냅샷을 불러오는 중입니다.</p>
          )}
        </section>
      ) : null}
      <section
        className="surface admin-club-detail__panel"
        aria-labelledby="admin-club-recent-ledger-title"
      >
        <div className="sec-h">
          <h2 id="admin-club-recent-ledger-title" className="h3 editorial">
            {ADMIN_COPY.targetLedger.clubHeading}
          </h2>
        </div>
        <AdminTargetLedgerInline
          entries={clubTargetLedgerEntries(auditQuery.data?.pages ?? [])}
          moreHref={`/admin/audit?target=${encodeURIComponent(clubId)}`}
        />
      </section>
    </section>
  );
}

function ClubsReturnLink({
  returnState,
}: {
  returnState: ReturnType<typeof parseAdminRouteReturnState>;
}) {
  return (
    <Link
      to={returnState.returnTo}
      state={{
        focusId: returnState.focusId,
        scrollTop: returnState.scrollTop,
      }}
      className="btn btn-ghost btn-sm"
    >
      ← 클럽 목록
    </Link>
  );
}

function ClubDomainPanel({
  clubId,
  revision,
  domains,
  canManageDomains,
  onRefresh,
}: {
  clubId: string;
  revision: number;
  domains: PlatformAdminClubDetail["domains"];
  canManageDomains: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const transitionOwner = useTransitionSafetyOwner(`admin-club-domains:${clubId}`);
  const previewMutation = usePreviewPlatformAdminDomainMutation(clubId);
  const confirmMutation = useConfirmPlatformAdminDomainMutation(clubId);
  const recheckMutation =
    useCheckPlatformAdminDomainProvisioningMutation(clubId);
  useEffect(() => {
    if (canManageDomains) return;
    previewMutation.reset();
    confirmMutation.reset();
    recheckMutation.reset();
  }, [canManageDomains, confirmMutation, previewMutation, recheckMutation]);
  const runCommand = async <T,>(operationId: string, command: () => Promise<T>) => {
    const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await command();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publishTransitionAction(handle, "cache", () => publishPlatformAdminClubState(queryClient, clubId));
      return result;
    } catch (error) {
      if (!(error instanceof TransitionOwnerObsoleteError)) await handle.settle("failed");
      throw error;
    }
  };

  return (
    <AdminClubDomainCommandPanel
      revision={revision}
      domains={domains}
      canManageDomains={canManageDomains}
      previewPending={previewMutation.isPending}
      confirmPending={confirmMutation.isPending}
      recheckPending={recheckMutation.isPending}
      onRefresh={onRefresh}
      onPreview={(request) => previewMutation.mutateAsync(request)}
      onConfirm={(request) => runCommand(`admin-club-domain:confirm:${request.idempotencyKey}`, () => confirmMutation.mutateAsync(request))}
      onRecheck={(domainId, request) =>
        runCommand(`admin-club-domain:recheck:${request.idempotencyKey}`, () => recheckMutation.mutateAsync({ domainId, request }))
      }
    />
  );
}

function ClubMetadataPanel({
  club,
  canManage,
  onRefresh,
}: {
  club: PlatformAdminClubDetail;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: club.name,
    tagline: club.tagline,
    about: club.about,
  });
  const mutation = useUpdatePlatformAdminClubMutation();
  const transitionOwner = useTransitionSafetyOwner(
    `admin-club-metadata:${club.clubId}`,
    editing,
    "저장하지 않은 클럽 공개 정보가 있습니다.",
  );
  const recovery = mutation.isError
    ? adminCommandRecovery(mutation.error)
    : null;
  useEffect(() => {
    if (canManage) return;
    mutation.reset();
  }, [canManage, mutation]);

  function cancelEdit() {
    setEditing(false);
    setDraft({ name: club.name, tagline: club.tagline, about: club.about });
    mutation.reset();
  }

  async function saveMetadata() {
    const operationId = `admin-club-metadata:${club.clubId}:${club.adminRevision}`;
    const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const updated = await mutation.mutateAsync({
        clubId: club.clubId,
        request: { expectedAdminRevision: club.adminRevision, ...draft },
      });
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "cache", () => publishUpdatedPlatformAdminClub(queryClient, updated));
      await publishTransitionAction(handle, "ui", () => setEditing(false));
    } catch {
      if (await handle.settle("failed") !== "accepted") return;
    }
  }

  return (
    <section
      className="surface admin-club-detail__panel"
      aria-labelledby="club-metadata-title"
    >
      <div className="admin-club-detail__panel-heading">
        <div>
          <p className="eyebrow">{ADMIN_COPY.eyebrow.identity}</p>
          <h2 id="club-metadata-title" className="h3 editorial">
            공개 정보
          </h2>
        </div>
        <span className="admin-club-detail__state">
          {mutation.isPending ? "저장 중" : "최신 revision 기준"}
        </span>
      </div>
      {canManage && editing ? (
        <>
          <div className="admin-club-detail__form">
            <label className="field-group">
              <span className="label">Slug</span>
              <input className="input" value={club.slug} readOnly />
            </label>
            <label className="field-group">
              <span className="label">클럽 이름</span>
              <input
                className="input"
                value={draft.name}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label className="field-group">
              <span className="label">Tagline</span>
              <input
                className="input"
                value={draft.tagline}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setDraft({ ...draft, tagline: event.target.value })
                }
              />
            </label>
            <label className="field-group admin-club-detail__wide">
              <span className="label">About</span>
              <textarea
                className="input"
                value={draft.about}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setDraft({ ...draft, about: event.target.value })
                }
              />
            </label>
          </div>
          {recovery ? (
            <div role="alert" className="danger">
              <p>{recovery.message}</p>
              {recovery.kind === "REFRESH_STATE" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={onRefresh}
                >
                  최신 상태 불러오기
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="admin-club-detail__actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={mutation.isPending}
              onClick={cancelEdit}
            >
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={mutation.isPending}
              onClick={() => void saveMetadata()}
            >
              공개 정보 저장
            </button>
          </div>
        </>
      ) : (
        <>
          <dl className="admin-club-detail__facts">
            <div>
              <dt>Slug</dt>
              <dd>{club.slug}</dd>
            </div>
            <div>
              <dt>클럽 이름</dt>
              <dd>{club.name}</dd>
            </div>
            <div>
              <dt>Tagline</dt>
              <dd>{club.tagline}</dd>
            </div>
            <div>
              <dt>About</dt>
              <dd>{club.about}</dd>
            </div>
          </dl>
          {canManage ? (
            <div className="admin-club-detail__actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditing(true)}
              >
                편집
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function VisibilityPanel({
  clubId,
  revision,
  current,
  canManage,
  onRefresh,
}: {
  clubId: string;
  revision: number;
  current: "PRIVATE" | "PUBLIC";
  canManage: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const transitionOwner = useTransitionSafetyOwner(`admin-club-visibility:${clubId}`);
  const target = current === "PRIVATE" ? "PUBLIC" : "PRIVATE";
  const previewMutation = usePreviewPlatformAdminClubVisibilityMutation(clubId);
  const confirmMutation = useConfirmPlatformAdminClubVisibilityMutation(clubId);
  const [preview, setPreview] =
    useState<PlatformAdminClubVisibilityPreviewResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [intentKey, setIntentKey] = useState<string | null>(null);
  const [receipt, setReceipt] =
    useState<PlatformAdminClubCommandReceipt | null>(null);
  const [recovery, setRecovery] = useState<AdminCommandRecovery | null>(null);
  const commandEpochRef = useRef(0);

  function purgeVisibilityState() {
    commandEpochRef.current += 1;
    previewMutation.reset();
    confirmMutation.reset();
    setPreview(null);
    setConfirmed(false);
    setIntentKey(null);
    setReceipt(null);
    setRecovery(null);
  }

  useEffect(() => {
    if (canManage) return;
    previewMutation.reset();
    confirmMutation.reset();
  }, [canManage, confirmMutation, previewMutation]);

  async function previewIntent() {
    const epoch = commandEpochRef.current;
    setRecovery(null);
    try {
      const result = await previewMutation.mutateAsync({
        expectedAdminRevision: revision,
        targetVisibility: target,
      });
      if (commandEpochRef.current !== epoch) return;
      setPreview(result);
      setConfirmed(false);
      setReceipt(null);
      setIntentKey(crypto.randomUUID());
    } catch (error) {
      if (commandEpochRef.current !== epoch) return;
      if (isPlatformAdminAuthorityLossError(error)) {
        purgeVisibilityState();
        return;
      }
      setRecovery(adminCommandRecovery(error));
    }
  }
  async function confirmIntent() {
    if (!preview || !intentKey) return;
    const epoch = commandEpochRef.current;
    const operationId = `admin-club-visibility:${clubId}:${intentKey}`;
    const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await confirmMutation.mutateAsync({
        previewId: preview.previewId,
        idempotencyKey: intentKey,
        expectedAdminRevision: revision,
        targetVisibility: target,
        confirmed: true,
      });
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "cache", () => publishPlatformAdminClubState(queryClient, clubId));
      if (commandEpochRef.current !== epoch) return;
      await publishTransitionAction(handle, "ui", () => {
        setReceipt(result);
        setRecovery(null);
      });
    } catch (error) {
      if (await handle.settle("failed") !== "accepted") return;
      if (commandEpochRef.current !== epoch) return;
      await publishTransitionAction(handle, "errorCopy", () => {
        if (isPlatformAdminAuthorityLossError(error)) {
          purgeVisibilityState();
          return;
        }
        const nextRecovery = adminCommandRecovery(error);
        setRecovery(nextRecovery);
        if (nextRecovery.kind === "RESTART_PREVIEW" || nextRecovery.kind === "RESTART_INTENT" || nextRecovery.kind === "REFRESH_STATE" || nextRecovery.kind === "CORRECT_DRAFT") {
          setPreview(null);
          setConfirmed(false);
          setIntentKey(null);
        }
        if (nextRecovery.kind === "REFRESH_STATE") onRefresh();
      });
    }
  }
  return (
    <section
      className="surface admin-club-detail__panel"
      aria-labelledby="visibility-title"
    >
      <div className="admin-club-detail__panel-heading">
        <div>
          <p className="eyebrow">{ADMIN_COPY.eyebrow.visibility}</p>
          <h2 id="visibility-title" className="h3 editorial">
            공개 상태
          </h2>
        </div>
        <span className="admin-club-detail__state">현재 {clubVisibilityLabel(current)}</span>
      </div>
      <p className="body">
        공개 전환은 영향을 미리 확인한 뒤 명시적으로 확정합니다.
      </p>
      {canManage && preview ? (
        <div className="admin-club-detail__review" aria-live="polite">
          <p>
            <strong>
              {clubVisibilityLabel(preview.currentVisibility)} → {clubVisibilityLabel(preview.targetVisibility)}
            </strong>
          </p>
          <ul>
            {preview.impactCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <p className="tiny muted">
            만료 {preview.expiresAt} · 확인 코드{" "}
            {preview.requestFingerprintPrefix}
          </p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={receipt !== null}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>영향을 확인했습니다</span>
          </label>
        </div>
      ) : null}
      {canManage ? (
        <AdminSafeActionDock
          level="L2"
          authority="allowed"
          state={clubCommandDockState({
            pending: previewMutation.isPending || confirmMutation.isPending,
            receipt: receipt !== null,
            recovery,
          })}
          reason={
            recovery ? (
              <div role="alert" className="danger">
                <p>{recovery.message}</p>
                {recovery.kind === "REFRESH_STATE" ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={onRefresh}
                  >
                    최신 상태 불러오기
                  </button>
                ) : null}
              </div>
            ) : undefined
          }
          secondary={
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void previewIntent()}
              disabled={previewMutation.isPending}
            >
              {target === "PUBLIC" ? "공개 전환 미리보기" : "비공개 전환 미리보기"}
            </button>
          }
          primary={
            preview ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={
                  !confirmed || confirmMutation.isPending || receipt !== null
                }
                onClick={() => void confirmIntent()}
              >
                {target === "PUBLIC" ? "공개 전환 확정" : "비공개 전환 확정"}
              </button>
            ) : undefined
          }
        />
      ) : null}
      {canManage && receipt ? (
        <AdminReceiptTimeline
          level="L2"
          receiptId={`receipt ${receipt.receiptId}`}
          entries={[
            {
              key: "accepted",
              label: `${ADMIN_COPY.receipt} — 명령 접수`,
              state:
                receipt.convergenceState === "FAILED"
                  ? "failed"
                  : receipt.convergenceState === "PENDING"
                    ? "pending"
                    : "succeeded",
              detail: `${receipt.resultCode}${
                receipt.convergenceState ? ` · ${receipt.convergenceState}` : ""
              }`,
            },
          ]}
        />
      ) : null}
    </section>
  );
}

function clubTargetLedgerEntries(
  pages: Parameters<typeof mergeAdminAuditLedgerPages>[0],
) {
  const items = mergeAdminAuditLedgerPages(pages)?.items ?? [];
  return items.slice(0, 3).map((item) => ({
    at: formatAdminAuditOccurredAt(item.occurredAt),
    sentence: formatAdminAuditLedgerSentenceBody(item),
  }));
}

function clubCommandDockState({
  pending,
  receipt,
  recovery,
}: {
  pending: boolean;
  receipt: boolean;
  recovery: AdminCommandRecovery | null;
}): AdminSafeActionState {
  if (receipt) return "complete";
  if (pending) return "pending";
  if (recovery?.kind === "REFRESH_STATE") return "conflict";
  if (recovery?.kind === "RESTART_PREVIEW" || recovery?.kind === "RESTART_INTENT") {
    return "stale";
  }
  if (recovery?.kind === "RETRY_SAME_INTENT" || recovery?.kind === "CORRECT_DRAFT") {
    return "unknown-outcome";
  }
  return "ready";
}

function PanelError({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div role="alert" className="surface admin-club-detail__panel">
      <p>{label}을 불러오지 못했습니다.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
        다시 시도
      </button>
    </div>
  );
}
