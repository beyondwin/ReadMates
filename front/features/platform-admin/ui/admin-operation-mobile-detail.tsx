import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminOperationsView } from "@/features/platform-admin/model/platform-admin-operations-model";
import type { AdminSafeActionState } from "./admin-action-dock";
import { AdminOperationsInspector, type AdminCaseTraversal } from "./admin-operations-inspector";
import { AdminOperationsQueue } from "./admin-operations-queue";

type HistoryEvent = {
  fromState: string | null;
  toState: string;
  action: string | null;
  reasonCode: string;
  occurredAt: string;
  caseVersion: number;
};

type Props = {
  view: AdminOperationsView;
  auditHref: string;
  history: readonly HistoryEvent[];
  lifecycleControls: ReactNode;
  queueControls?: ReactNode;
  detailLoading?: boolean;
  detailUnavailable?: boolean;
  permissionDenied?: boolean;
  hasNextPage?: boolean;
  loadingMore?: boolean;
  mode?: "list" | "detail";
  actionState?: AdminSafeActionState;
  actionReason?: ReactNode;
  traversal?: AdminCaseTraversal;
  onSelectCase: (caseId: string, options?: { mode?: "list" | "detail" }) => void;
  onBack?: () => void;
  onLoadMore?: () => void;
};

export function AdminOperationMobileDetail({
  view,
  auditHref,
  history,
  lifecycleControls,
  queueControls,
  detailLoading = false,
  detailUnavailable = false,
  permissionDenied = false,
  hasNextPage = false,
  loadingMore = false,
  mode,
  actionState,
  actionReason,
  traversal,
  onSelectCase,
  onBack,
  onLoadMore,
}: Props) {
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const restoreSelectionRef = useRef(false);
  const previousShowDetailRef = useRef(false);
  const listScrollPositionRef = useRef({ left: 0, top: 0 });
  const controlled = mode !== undefined;
  const showDetail = controlled
    ? mode === "detail" && view.selectedCase != null
    : detailCaseId !== null && view.selectedCase?.id === detailCaseId;

  useEffect(() => {
    if (previousShowDetailRef.current && !showDetail) restoreSelectionRef.current = true;
    previousShowDetailRef.current = showDetail;
  }, [showDetail]);

  useEffect(() => {
    if (showDetail) backButtonRef.current?.focus({ preventScroll: true });
  }, [showDetail]);

  useEffect(() => {
    if (showDetail || !restoreSelectionRef.current) return;
    restoreSelectionRef.current = false;
    const selectedRow = listContainerRef.current
      ?.querySelector<HTMLElement>('[data-scroll-marker="selected"]');
    selectedRow?.focus({ preventScroll: true });
    selectedRow?.scrollIntoView?.({ block: "nearest" });
    window.scrollTo({
      behavior: "auto",
      left: listScrollPositionRef.current.left,
      top: listScrollPositionRef.current.top,
    });
  }, [showDetail]);

  if (showDetail && view.selectedCase) {
    return (
      <div className="admin-operation-mobile-detail">
        <button
          ref={backButtonRef}
          type="button"
          className="admin-operation-mobile-detail__back admin-operation-control--touch"
          aria-label="목록으로"
          onClick={() => {
            restoreSelectionRef.current = true;
            if (onBack) onBack();
            else setDetailCaseId(null);
          }}
        >
          <span aria-hidden="true">오늘 할 일</span>
        </button>
        <AdminOperationsInspector
          selectedCase={view.selectedCase}
          auditHref={auditHref}
          history={history}
          lifecycleControls={lifecycleControls}
          detailLoading={detailLoading}
          detailUnavailable={detailUnavailable}
          permissionDenied={permissionDenied}
          actionState={actionState}
          actionReason={actionReason}
          traversal={traversal}
        />
      </div>
    );
  }

  return (
    <div ref={listContainerRef} className="admin-operation-mobile-detail">
      <AdminOperationsQueue
        items={view.items}
        selectedCaseId={view.selectedCaseId}
        onSelectCase={(caseId) => {
          listScrollPositionRef.current = { left: window.scrollX, top: window.scrollY };
          onSelectCase(caseId, { mode: "detail" });
          if (!controlled) setDetailCaseId(caseId);
        }}
        hasNextPage={hasNextPage}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        secondaryControls={queueControls}
      />
    </div>
  );
}
