import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminOperationsView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { AdminOperationsInspector } from "./admin-operations-inspector";
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
  history: readonly HistoryEvent[];
  lifecycleControls: ReactNode;
  detailLoading?: boolean;
  detailUnavailable?: boolean;
  permissionDenied?: boolean;
  onSelectCase: (caseId: string) => void;
};

export function AdminOperationMobileDetail({
  view,
  history,
  lifecycleControls,
  detailLoading = false,
  detailUnavailable = false,
  permissionDenied = false,
  onSelectCase,
}: Props) {
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const restoreSelectionRef = useRef(false);
  const listScrollPositionRef = useRef({ left: 0, top: 0 });
  const showDetail = detailCaseId !== null && view.selectedCase?.id === detailCaseId;

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
          className="btn btn-secondary admin-operation-mobile-detail__back admin-operation-control--touch"
          onClick={() => {
            restoreSelectionRef.current = true;
            setDetailCaseId(null);
          }}
        >
          목록으로
        </button>
        <AdminOperationsInspector
          selectedCase={view.selectedCase}
          history={history}
          lifecycleControls={lifecycleControls}
          detailLoading={detailLoading}
          detailUnavailable={detailUnavailable}
          permissionDenied={permissionDenied}
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
          onSelectCase(caseId);
          setDetailCaseId(caseId);
        }}
      />
    </div>
  );
}
