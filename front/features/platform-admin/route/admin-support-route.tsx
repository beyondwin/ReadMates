import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useSearchParams } from "react-router";
import type {
  AdminSupportGrantCreateDraft,
  AdminSupportGrantLedgerItem,
  AdminSupportGrantPreview,
  AdminSupportGrantReceipt,
  AdminSupportGrantRevokeDraft,
  AdminSupportSearchResult,
  SupportGrantReasonCategory,
} from "@/features/platform-admin/model/platform-admin-support-model";
import {
  flattenSupportGrantLedgerPages,
  normalizeSupportGrantStatus,
  supportGrantCommandRecovery,
} from "@/features/platform-admin/model/platform-admin-support-model";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubsQuery,
  subscribePlatformAdminAuthorityLoss,
} from "@/features/platform-admin/queries/platform-admin-queries";
import {
  platformAdminSupportLedgerInfiniteQuery,
  platformAdminSupportKeys,
  publishAdminSupportLedger,
  useAdminSupportCreateConfirmMutation,
  useAdminSupportCreatePreviewMutation,
  useAdminSupportRevokeConfirmMutation,
  useAdminSupportRevokePreviewMutation,
  useAdminSupportSearchMutation,
} from "@/features/platform-admin/queries/platform-admin-support-queries";
import { AdminSupportWorkbench } from "@/features/platform-admin/ui/admin-support-workbench";
import { confirmAdminSupportGrant } from "@/features/platform-admin/api/platform-admin-support-api";
import { publishTransitionAction, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";
import { createAdminSupportReceiptCapsule } from "./admin-support-receipt-capsule";

const DEFAULT_REASON: SupportGrantReasonCategory = "MEMBER_ASSISTANCE";

function defaultExpiresAt(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminSupportRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const selectedClubId = searchParams.get("clubId");
  const status = normalizeSupportGrantStatus(searchParams.get("status")) ?? "";
  const filters = useMemo(() => ({
    ...(selectedClubId ? { clubId: selectedClubId } : {}),
    ...(status ? { status } : {}),
  }), [selectedClubId, status]);

  const capabilities = useQuery(platformAdminCapabilitiesQuery()).data ?? null;
  const clubsQuery = useQuery(platformAdminClubsQuery());
  const ledgerQuery = useInfiniteQuery(platformAdminSupportLedgerInfiniteQuery(filters));
  const searchMutation = useAdminSupportSearchMutation();
  const createPreviewMutation = useAdminSupportCreatePreviewMutation();
  const createConfirmMutation = useAdminSupportCreateConfirmMutation();
  const revokePreviewMutation = useAdminSupportRevokePreviewMutation();
  const revokeConfirmMutation = useAdminSupportRevokeConfirmMutation();
  const transitionOwner = useTransitionSafetyOwner("admin-support-command");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSupportSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<AdminSupportSearchResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createCategory, setCreateCategory] = useState<SupportGrantReasonCategory>(DEFAULT_REASON);
  const [createNote, setCreateNote] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [createPreview, setCreatePreview] = useState<AdminSupportGrantPreview | null>(null);
  const [createSnapshot, setCreateSnapshot] = useState<AdminSupportGrantCreateDraft | null>(null);
  const [createIntentKey, setCreateIntentKey] = useState<string | null>(null);
  const [createRecovery, setCreateRecovery] = useState<string | null>(null);
  const [createOutcomeUnknown, setCreateOutcomeUnknown] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminSupportGrantLedgerItem | null>(null);
  const [revokeCategory, setRevokeCategory] = useState<SupportGrantReasonCategory>(DEFAULT_REASON);
  const [revokeNote, setRevokeNote] = useState("");
  const [revokePreview, setRevokePreview] = useState<AdminSupportGrantPreview | null>(null);
  const [revokeSnapshot, setRevokeSnapshot] = useState<AdminSupportGrantRevokeDraft | null>(null);
  const [revokeIntentKey, setRevokeIntentKey] = useState<string | null>(null);
  const [revokeRecovery, setRevokeRecovery] = useState<string | null>(null);
  const [revokeOutcomeUnknown, setRevokeOutcomeUnknown] = useState(false);
  const [latestReceipt, setLatestReceipt] = useState<AdminSupportGrantReceipt | null>(null);

  const canManage = capabilities !== null && canAdmin(capabilities, "MANAGE_SUPPORT_ACCESS");
  const previousCanManage = useRef(canManage);
  const ledger = flattenSupportGrantLedgerPages(ledgerQuery.data?.pages ?? []);
  const commandOutcomeUnknown = createOutcomeUnknown || revokeOutcomeUnknown;
  const blocker = useBlocker(commandOutcomeUnknown);

  const clearCreateCommand = useCallback(() => {
    setCreatePreview(null);
    setCreateSnapshot(null);
    setCreateIntentKey(null);
    setCreateRecovery(null);
    setCreateOutcomeUnknown(false);
    createPreviewMutation.reset();
    createConfirmMutation.reset();
  }, [createConfirmMutation, createPreviewMutation]);

  const clearPrivateState = useCallback(() => {
    setQuery("");
    setResults([]);
    setSelectedResult(null);
    setHasSearched(false);
    setSearchError(null);
    setCreateNote("");
    setCreatePreview(null);
    setCreateSnapshot(null);
    setCreateIntentKey(null);
    setCreateRecovery(null);
    setCreateOutcomeUnknown(false);
    setRevokeTarget(null);
    setRevokeNote("");
    setRevokePreview(null);
    setRevokeSnapshot(null);
    setRevokeIntentKey(null);
    setRevokeRecovery(null);
    setRevokeOutcomeUnknown(false);
    setLatestReceipt(null);
    searchMutation.reset();
    createPreviewMutation.reset();
    createConfirmMutation.reset();
    revokePreviewMutation.reset();
    revokeConfirmMutation.reset();
  }, [createConfirmMutation, createPreviewMutation, revokeConfirmMutation, revokePreviewMutation, searchMutation]);

  useEffect(() => subscribePlatformAdminAuthorityLoss(clearPrivateState), [clearPrivateState]);
  useEffect(() => {
    if (previousCanManage.current && !canManage) clearPrivateState();
    previousCanManage.current = canManage;
  }, [canManage, clearPrivateState]);
  useEffect(() => {
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!commandOutcomeUnknown) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [commandOutcomeUnknown]);
  useEffect(() => () => {
    queryClient.removeQueries({ queryKey: platformAdminSupportKeys.all });
    for (const mutation of queryClient.getMutationCache().findAll({ mutationKey: platformAdminSupportKeys.all })) {
      queryClient.getMutationCache().remove(mutation);
    }
  }, [queryClient]);

  async function search() {
    const normalized = query.trim();
    if (!normalized) return;
    setSearchError(null);
    setSelectedResult(null);
    clearCreateCommand();
    setHasSearched(true);
    try {
      const found = await searchMutation.search(normalized, selectedClubId ?? undefined);
      setResults(found);
      searchMutation.reset();
    } catch {
      setSearchError("지원 대상을 검색하지 못했습니다. 입력은 유지됩니다.");
      searchMutation.reset();
    }
  }

  function updateCreateDraft(update: () => void) {
    update();
    clearCreateCommand();
    setLatestReceipt(null);
  }

  async function previewCreate() {
    if (!selectedResult || !selectedClubId || !canManage || !createCategory || !expiresAt) return;
    const draft: AdminSupportGrantCreateDraft = {
      clubId: selectedClubId,
      granteeSubjectId: selectedResult.subjectId,
      scope: "HOST_SUPPORT_READ",
      expiresAt: new Date(expiresAt).toISOString(),
      reasonCategory: createCategory,
      note: createNote.trim() || null,
    };
    setCreateRecovery(null);
    setLatestReceipt(null);
    try {
      const preview = await createPreviewMutation.preview(draft);
      setCreateSnapshot(draft);
      setCreatePreview(preview);
      setCreateIntentKey(crypto.randomUUID());
    } catch {
      setCreateRecovery("발급 내용을 검토하지 못했습니다. 입력을 확인하고 다시 시도해 주세요.");
    } finally {
      createPreviewMutation.reset();
    }
  }

  async function confirmCreate() {
    if (!canManage || !createPreview || !createSnapshot || !createIntentKey) return;
    setCreateRecovery(null);
    setCreateOutcomeUnknown(true);
    const operationId = `admin-support-create:${createIntentKey}`;
    const request = {
      ...createSnapshot,
      previewId: createPreview.previewId,
      idempotencyKey: createIntentKey,
      confirmed: true as const,
    };
    const capsule = createAdminSupportReceiptCapsule({
      operationId,
      request,
      replayLookup: confirmAdminSupportGrant,
    });
    const handle = transitionOwner.beginReceipt(capsule);
    try {
      const receipt = await createConfirmMutation.confirm(request);
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "cache", () => publishAdminSupportLedger(queryClient));
      await publishTransitionAction(handle, "ui", () => {
        setLatestReceipt(receipt);
        setQuery("");
        setResults([]);
        setSelectedResult(null);
        setCreateNote("");
        setCreateOutcomeUnknown(false);
        clearCreateCommand();
      });
    } catch (error) {
      if (await handle.settle("failed") !== "accepted") return;
      const recovery = supportGrantCommandRecovery(error);
      await publishTransitionAction(handle, "errorCopy", () => {
        setCreateRecovery(recovery.message);
        if (recovery.kind === "RESTART_PREVIEW") {
          setCreateOutcomeUnknown(false);
          clearCreateCommand();
        }
      });
    } finally {
      createConfirmMutation.reset();
    }
  }

  function startRevoke(target: AdminSupportGrantLedgerItem) {
    setRevokeTarget(target);
    setRevokeCategory(DEFAULT_REASON);
    setRevokeNote("");
    setRevokePreview(null);
    setRevokeSnapshot(null);
    setRevokeIntentKey(null);
    setRevokeRecovery(null);
    setRevokeOutcomeUnknown(false);
    setLatestReceipt(null);
  }

  function updateRevokeDraft(update: () => void) {
    update();
    setRevokePreview(null);
    setRevokeSnapshot(null);
    setRevokeIntentKey(null);
    setRevokeRecovery(null);
    setRevokeOutcomeUnknown(false);
    setLatestReceipt(null);
  }

  async function previewRevoke() {
    if (!revokeTarget || !canManage) return;
    const draft = { reasonCategory: revokeCategory, note: revokeNote.trim() || null };
    setRevokeRecovery(null);
    try {
      const preview = await revokePreviewMutation.preview(revokeTarget.grantId, draft);
      setRevokeSnapshot(draft);
      setRevokePreview(preview);
      setRevokeIntentKey(crypto.randomUUID());
    } catch {
      setRevokeRecovery("취소 내용을 검토하지 못했습니다. 입력을 확인하고 다시 시도해 주세요.");
    } finally {
      revokePreviewMutation.reset();
    }
  }

  async function confirmRevoke() {
    if (!canManage || !revokeTarget || !revokePreview || !revokeSnapshot || !revokeIntentKey) return;
    setRevokeRecovery(null);
    setRevokeOutcomeUnknown(true);
    const operationId = `admin-support-revoke:${revokeIntentKey}`;
    const handle = transitionOwner.begin(operationId, "L3", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const receipt = await revokeConfirmMutation.confirm(revokeTarget.grantId, {
        ...revokeSnapshot,
        previewId: revokePreview.previewId,
        idempotencyKey: revokeIntentKey,
        clubId: revokeTarget.clubId,
        scope: revokeTarget.scope,
        expiresAt: revokeTarget.expiresAt,
        confirmed: true,
      });
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "cache", () => publishAdminSupportLedger(queryClient));
      await publishTransitionAction(handle, "ui", () => {
        setLatestReceipt(receipt);
        setRevokeTarget(null);
        setRevokeNote("");
        setRevokePreview(null);
        setRevokeSnapshot(null);
        setRevokeIntentKey(null);
        setRevokeOutcomeUnknown(false);
      });
    } catch (error) {
      if (await handle.settle("failed") !== "accepted") return;
      const recovery = supportGrantCommandRecovery(error);
      await publishTransitionAction(handle, "errorCopy", () => {
        setRevokeRecovery(recovery.message);
        if (recovery.kind === "RESTART_PREVIEW") {
          setRevokeOutcomeUnknown(false);
          setRevokePreview(null);
          setRevokeSnapshot(null);
          setRevokeIntentKey(null);
        }
      });
    } finally {
      revokeConfirmMutation.reset();
    }
  }

  function updateSafeFilter(key: "clubId" | "status", value: string) {
    clearPrivateState();
    const next = new URLSearchParams();
    const nextClub = key === "clubId" ? value : selectedClubId ?? "";
    const nextStatus = key === "status" ? normalizeSupportGrantStatus(value) : status;
    if (nextClub) next.set("clubId", nextClub);
    if (nextStatus) next.set("status", nextStatus);
    setSearchParams(next, { replace: true });
  }

  return <AdminSupportWorkbench
    clubs={(clubsQuery.data?.items ?? []).map((club) => ({ clubId: club.clubId, name: club.name }))}
    selectedClubId={selectedClubId}
    status={status}
    canManage={canManage}
    latestReceipt={latestReceipt}
    search={{ query, results, selected: selectedResult, hasSearched, pending: searchMutation.isPending, error: searchError, onQueryChange: setQuery, onSubmit: () => void search(), onSelect: (result) => { setSelectedResult(result); setCreateNote(""); clearCreateCommand(); }, onClear: clearPrivateState }}
    create={{ reasonCategory: createCategory, note: createNote, expiresAt, preview: createPreview, receipt: null, recovery: createRecovery, previewPending: createPreviewMutation.isPending, confirmPending: createConfirmMutation.isPending, outcomeUnknown: createOutcomeUnknown, onReasonCategoryChange: (value) => updateCreateDraft(() => setCreateCategory(value)), onNoteChange: (value) => updateCreateDraft(() => setCreateNote(value)), onExpiresAtChange: (value) => updateCreateDraft(() => setExpiresAt(value)), onPreview: () => void previewCreate(), onConfirm: () => void confirmCreate(), onReset: clearCreateCommand }}
    ledger={{ items: ledger, pending: ledgerQuery.isPending, error: ledgerQuery.isError ? "지원 접근 권한 이력을 불러오지 못했습니다." : null, nextPageError: ledgerQuery.isFetchNextPageError, hasNextPage: ledgerQuery.hasNextPage, loadingMore: ledgerQuery.isFetchingNextPage, onRetry: () => void ledgerQuery.refetch(), onLoadMore: () => void ledgerQuery.fetchNextPage() }}
    revoke={{ target: revokeTarget, reasonCategory: revokeCategory, note: revokeNote, preview: revokePreview, receipt: null, recovery: revokeRecovery, previewPending: revokePreviewMutation.isPending, confirmPending: revokeConfirmMutation.isPending, outcomeUnknown: revokeOutcomeUnknown, onStart: startRevoke, onCancel: () => setRevokeTarget(null), onReasonCategoryChange: (value) => updateRevokeDraft(() => setRevokeCategory(value)), onNoteChange: (value) => updateRevokeDraft(() => setRevokeNote(value)), onPreview: () => void previewRevoke(), onConfirm: () => void confirmRevoke() }}
    onClubChange={(value) => updateSafeFilter("clubId", value)}
    onStatusChange={(value) => updateSafeFilter("status", value)}
  />;
}
