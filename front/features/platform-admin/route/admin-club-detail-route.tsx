import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import type {
  PlatformAdminClubCommandReceipt,
  PlatformAdminClubDetail,
  PlatformAdminClubVisibilityPreviewResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  adminCommandRecovery,
  type AdminCommandRecovery,
} from "@/features/platform-admin/model/platform-admin-command-recovery";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubDetailQuery,
  useCheckPlatformAdminDomainProvisioningMutation,
  useConfirmPlatformAdminClubVisibilityMutation,
  useConfirmPlatformAdminDomainMutation,
  usePreviewPlatformAdminClubVisibilityMutation,
  usePreviewPlatformAdminDomainMutation,
  useUpdatePlatformAdminClubMutation,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { flattenSupportGrantLedgerPages } from "@/features/platform-admin/model/platform-admin-support-model";
import { platformAdminSupportLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-support-queries";
import { platformAdminClubOperationsQuery } from "@/features/platform-admin/queries/platform-admin-club-operations-queries";
import { AdminClubOperationsPage } from "@/features/platform-admin/ui/admin-club-operations-page";
import { AdminClubDomainCommandPanel } from "@/features/platform-admin/ui/domain-provisioning-panel";
import { useAdminBreadcrumbExtra } from "./admin-breadcrumb-hook";

export function AdminClubDetailRoute() {
  const { clubId = "" } = useParams<{ clubId: string }>();
  const queryClient = useQueryClient();
  const detailQuery = useQuery(platformAdminClubDetailQuery(clubId));
  const capabilities = useQuery(platformAdminCapabilitiesQuery()).data ?? null;
  const canViewOperations =
    capabilities != null && canAdmin(capabilities, "VIEW_CLUB_OPERATIONS");
  const canViewSupport =
    capabilities != null && canAdmin(capabilities, "VIEW_SUPPORT");
  const supportGrantsQuery = useInfiniteQuery({
    ...platformAdminSupportLedgerInfiniteQuery({ clubId, status: "ACTIVE" }),
    enabled: canViewOperations && canViewSupport,
  });
  const operationsQuery = useQuery({
    ...platformAdminClubOperationsQuery(clubId),
    enabled: canViewOperations,
  });
  const club = detailQuery.data ?? null;
  const { setExtra } = useAdminBreadcrumbExtra();

  useEffect(() => {
    setExtra(club?.name ?? null);
    return () => setExtra(null);
  }, [club?.name, setExtra]);
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
        <Link to="/admin/clubs" className="btn btn-ghost btn-sm">
          ← 클럽 목록
        </Link>
      </section>
    );

  const canManageClub =
    capabilities != null && canAdmin(capabilities, "MANAGE_CLUBS");
  const canManageDomains =
    capabilities != null && canAdmin(capabilities, "MANAGE_CLUB_DOMAINS");
  return (
    <section
      className="admin-club-detail"
      aria-labelledby="admin-club-detail-title"
    >
      <header className="admin-club-detail__header">
        <div>
          <p className="eyebrow">Club control</p>
          <h1 id="admin-club-detail-title" className="h1 editorial">
            {club.name}
          </h1>
          <p className="muted">
            revision {club.adminRevision} · {club.status} ·{" "}
            {club.publicVisibility}
          </p>
        </div>
        <Link to="/admin/clubs" className="btn btn-ghost btn-sm">
          ← 클럽 목록
        </Link>
      </header>
      <ClubMetadataPanel
        key={club.adminRevision}
        club={club}
        canManage={canManageClub}
        onRefresh={() => void detailQuery.refetch()}
      />
      <VisibilityPanel
        key={`visibility-${club.adminRevision}-${club.publicVisibility}`}
        clubId={clubId}
        revision={club.adminRevision}
        current={club.publicVisibility}
        canManage={canManageClub}
        onRefresh={() => void detailQuery.refetch()}
      />
      <ClubDomainPanel
        key={`domains-${club.adminRevision}-${club.domains.map((domain) => `${domain.id}:${domain.status}`).join("|")}`}
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
    </section>
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
  const previewMutation = usePreviewPlatformAdminDomainMutation(clubId);
  const confirmMutation = useConfirmPlatformAdminDomainMutation(clubId);
  const recheckMutation =
    useCheckPlatformAdminDomainProvisioningMutation(clubId);

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
      onConfirm={(request) => confirmMutation.mutateAsync(request)}
      onRecheck={(domainId, request) =>
        recheckMutation.mutateAsync({ domainId, request })
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
  const [draft, setDraft] = useState({
    name: club.name,
    tagline: club.tagline,
    about: club.about,
  });
  const mutation = useUpdatePlatformAdminClubMutation();
  const recovery = mutation.isError
    ? adminCommandRecovery(mutation.error)
    : null;
  return (
    <section
      className="surface admin-club-detail__panel"
      aria-labelledby="club-metadata-title"
    >
      <div className="admin-club-detail__panel-heading">
        <div>
          <p className="eyebrow">Identity</p>
          <h2 id="club-metadata-title" className="h3 editorial">
            공개 정보
          </h2>
        </div>
        <span className="admin-club-detail__state">
          {mutation.isPending ? "저장 중" : "최신 revision 기준"}
        </span>
      </div>
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
            readOnly={!canManage}
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
            readOnly={!canManage}
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
            readOnly={!canManage}
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
      {canManage ? (
        <div className="admin-club-detail__actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                clubId: club.clubId,
                request: {
                  expectedAdminRevision: club.adminRevision,
                  ...draft,
                },
              })
            }
          >
            공개 정보 저장
          </button>
        </div>
      ) : null}
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
  async function previewIntent() {
    setRecovery(null);
    try {
      const result = await previewMutation.mutateAsync({
        expectedAdminRevision: revision,
        targetVisibility: target,
      });
      setPreview(result);
      setConfirmed(false);
      setReceipt(null);
      setIntentKey(crypto.randomUUID());
    } catch (error) {
      setRecovery(adminCommandRecovery(error));
    }
  }
  async function confirmIntent() {
    if (!preview || !intentKey) return;
    try {
      const result = await confirmMutation.mutateAsync({
        previewId: preview.previewId,
        idempotencyKey: intentKey,
        expectedAdminRevision: revision,
        targetVisibility: target,
        confirmed: true,
      });
      setReceipt(result);
      setRecovery(null);
    } catch (error) {
      const nextRecovery = adminCommandRecovery(error);
      setRecovery(nextRecovery);
      if (
        nextRecovery.kind === "RESTART_PREVIEW" ||
        nextRecovery.kind === "RESTART_INTENT" ||
        nextRecovery.kind === "REFRESH_STATE" ||
        nextRecovery.kind === "CORRECT_DRAFT"
      ) {
        setPreview(null);
        setConfirmed(false);
        setIntentKey(null);
      }
      if (nextRecovery.kind === "REFRESH_STATE") onRefresh();
    }
  }
  return (
    <section
      className="surface admin-club-detail__panel"
      aria-labelledby="visibility-title"
    >
      <div className="admin-club-detail__panel-heading">
        <div>
          <p className="eyebrow">Visibility</p>
          <h2 id="visibility-title" className="h3 editorial">
            공개 상태
          </h2>
        </div>
        <span className="admin-club-detail__state">현재 {current}</span>
      </div>
      <p className="body">
        공개 전환은 영향을 미리 확인한 뒤 명시적으로 확정합니다.
      </p>
      {canManage ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void previewIntent()}
          disabled={previewMutation.isPending}
        >
          {target === "PUBLIC" ? "공개 전환 미리보기" : "비공개 전환 미리보기"}
        </button>
      ) : null}
      {preview ? (
        <div className="admin-club-detail__review" aria-live="polite">
          <p>
            <strong>
              {preview.currentVisibility} → {preview.targetVisibility}
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
        </div>
      ) : null}
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
      {receipt ? <ReceiptStatus receipt={receipt} /> : null}
    </section>
  );
}

function ReceiptStatus({
  receipt,
}: {
  receipt: PlatformAdminClubCommandReceipt;
}) {
  return (
    <div className="admin-club-detail__receipt" aria-live="polite">
      <strong>명령 접수 완료</strong>
      <span>receipt {receipt.receiptId}</span>
      <span>
        {receipt.resultCode}
        {receipt.convergenceState ? ` · ${receipt.convergenceState}` : ""}
      </span>
    </div>
  );
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
