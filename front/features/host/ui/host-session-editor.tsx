import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  AttendanceStatus,
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
  ManualNotificationDispatchListItem,
  SessionImportPreviewResponse,
  SessionImportRequest,
} from "@/features/host/model/host-view-types";
import {
  buildHostSessionRequest,
  buildPublicationRequest,
  getDestructiveActionAvailability,
  questionDeadlineLabelForForm,
} from "@/features/host/model/host-session-editor-model";
import type {
  HostSessionDraftSource,
  HostSessionEditorLocation,
  HostSessionEditorSection,
} from "@/features/host/model/host-session-editor-navigation";
import { buildHostSessionEditorOverview } from "@/features/host/model/host-session-editor-view-model";
import {
  buildSessionImportCommitResult,
  buildSessionImportRequest,
  sessionImportFailureMessage,
  type SessionImportCommitResult,
} from "@/features/host/model/session-import-model";
import {
  hostSessionEditorReducer,
  initialHostSessionEditorState,
} from "@/features/host/model/host-session-editor-form-state";
import type { BasicSessionField } from "@/features/host/model/host-session-editor-form-state";
import { SessionIdentity } from "@/shared/ui/session-identity";
import { readmatesReturnState as defaultReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { HostSessionDeletionPreviewDialog } from "./host-session-deletion-preview";
import { AttendancePanel } from "./session-editor/attendance-panel";
import { BasicSessionPanel } from "./session-editor/basic-session-panel";
import {
  type AttendanceWriteState,
  type HostSessionEditorActions,
  type PublicationFeedback,
  type SaveState,
} from "./session-editor/session-editor-actions";
import {
  feedbackDocumentUploadStatus,
  feedbackPreviewStateForSession,
} from "./session-editor/session-editor-feedback";
import {
  DefaultLinkComponent,
  type HostSessionEditorLinkComponent,
} from "./session-editor/session-editor-links";
import { HostSessionNotificationActions } from "./session-editor/session-editor-notifications";
import { PublicationPanel } from "./session-editor/publication-panel";
import {
  type AiGenerateCommitResult,
  SessionRecordCompletionPanel,
  type SessionRecordCompletionMode,
} from "./session-editor/session-record-completion-panel";
import {
  SessionRecordDraftPanel,
  type DraftSaveState,
  type SessionRecordDraftSnapshot,
} from "./session-editor/session-record-draft-panel";
import {
  SessionHistoryPanel,
  type SessionHistoryPanelItem,
} from "./session-editor/session-history-panel";
import { SessionEditorSectionNav } from "./session-editor/session-editor-section-nav";
import { SessionOverviewSection } from "./session-editor/session-overview-section";

export type { HostSessionEditorLinkComponent } from "./session-editor/session-editor-links";

export type HostSessionRecordApplyReview = {
  eventType: "FEEDBACK_DOCUMENT_PUBLISHED" | "SESSION_RECORD_UPDATED";
  changedSections: string[];
  liveRevision: number;
  nextLiveRevision: number;
  draftRevision: number;
};

type HostSessionRecordWorkflow = {
  editor: {
    liveRevision: number;
    liveSessionUpdatedAt: string;
    liveSnapshot: SessionRecordDraftSnapshot;
    draft: {
      source: "MANUAL" | "JSON_IMPORT" | "AI_GENERATED" | "RESTORED";
      updatedAt: string;
    } | null;
    draftLiveBaseStale: boolean;
    validationSummary: { valid: boolean; issues: string[] };
  };
  history: SessionHistoryPanelItem[];
  historyNextCursor: string | null;
  historyLoadingMore: boolean;
  snapshot: SessionRecordDraftSnapshot;
  saveState: DraftSaveState;
  expectedDraftRevision: number | null;
  restoring: boolean;
  rebasePending: boolean;
  rebaseError: string | null;
  onSnapshotChange: (snapshot: SessionRecordDraftSnapshot) => void;
  onReloadDraft: () => void | Promise<void>;
  onRebaseDraft: () => void | Promise<void>;
  onDraftCommitted: (result: {
    draftRevision: number;
    baseLiveRevision: number | null;
    liveApplied: boolean;
  }) => void | Promise<void>;
  onLoadMoreHistory: (cursor: string) => void | Promise<void>;
  onCopyInput: () => void | Promise<void>;
  confirmation: {
    open: boolean;
    preview: HostSessionRecordApplyReview | null;
    submitting: boolean;
    message: { kind: "alert" | "status"; text: string } | null;
    onReview: () => void | Promise<void>;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
  };
  onRestore: (request: {
    revisionId: string;
    expectedDraftRevision: number | null;
  }) => void | Promise<void>;
};

function dialogFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  ));
}

function SessionRecordApplyDialog({
  open,
  preview,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  preview: HostSessionRecordApplyReview | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !preview || !dialogRef.current) {
      return;
    }
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogFocusableElements(dialogRef.current)[0]?.focus();
    return () => {
      trigger?.focus();
    };
  }, [open, preview]);

  if (!open || !preview) {
    return null;
  }

  return createPortal(
    <div
      className="rm-host-action-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-record-apply-title"
        aria-describedby="session-record-apply-description"
        className="rm-host-action-dialog-sheet stack"
        data-testid="host-action-dialog-sheet"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !submitting) {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key !== "Tab") {
            return;
          }
          const elements = dialogFocusableElements(event.currentTarget);
          if (elements.length === 0) {
            return;
          }
          const first = elements[0];
          const last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        style={{
          "--stack": "16px",
          width: "min(480px, calc(100vw - 24px))",
          maxWidth: "100%",
          maxHeight: "calc(100dvh - 24px)",
          overflowY: "auto",
        } as CSSProperties}
      >
        <div>
          <div className="eyebrow">최종 반영</div>
          <h2 id="session-record-apply-title" className="h3" style={{ margin: "6px 0 0" }}>
            기록 반영 확인
          </h2>
        </div>
        <p id="session-record-apply-description" className="small" style={{ margin: 0 }}>
          공유 초안을 live 기록에 반영합니다. 이 단계에서는 알림을 만들거나 보내지 않습니다.
        </p>
        <section className="surface-quiet stack" style={{ "--stack": "10px", padding: 14 } as CSSProperties}>
          <div className="field-label">변경 항목</div>
          {preview.changedSections.length > 0 ? (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {preview.changedSections.map((section) => <li key={section}>{section}</li>)}
            </ul>
          ) : (
            <p className="small" style={{ margin: 0 }}>정규화된 초안 내용을 반영합니다.</p>
          )}
          <div className="tiny">
            live revision {preview.liveRevision} → {preview.nextLiveRevision}
            {" · "}draft revision {preview.draftRevision}
          </div>
          <div className="tiny">
            revision {preview.liveRevision}은 변경 이력에서 복원할 수 있습니다.
          </div>
        </section>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            className="btn btn-quiet"
            type="button"
            disabled={submitting}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={submitting}
            onClick={onConfirm}
          >
            {submitting ? "반영 중" : "기록 반영"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const emptyManagementMessage = "세션을 만든 뒤 참석과 피드백 문서를 관리할 수 있습니다.";

const defaultHostDashboardReturnTarget: ReadmatesReturnTarget = {
  href: "/app/host",
  label: "운영으로",
};

function scopedHostRedirectHref(href: string) {
  return scopedAppLinkTarget(globalThis.location.pathname, href);
}

type ImportMode = SessionRecordCompletionMode;

function importModeForSource(source: HostSessionDraftSource): ImportMode {
  return source === "ai" ? "aigen" : "json";
}

export default function HostSessionEditor({
  session,
  notificationDispatches = [],
  returnTarget = defaultHostDashboardReturnTarget,
  actions,
  clubSlug,
  LinkComponent = DefaultLinkComponent,
  hostDashboardReturnTarget = defaultHostDashboardReturnTarget,
  readmatesReturnState = defaultReadmatesReturnState,
  onSessionRecordsChanged,
  recordWorkflow,
  navigation,
}: {
  session?: HostSessionDetailResponse | null;
  notificationDispatches?: ManualNotificationDispatchListItem[];
  returnTarget?: ReadmatesReturnTarget;
  actions: HostSessionEditorActions;
  clubSlug?: string;
  LinkComponent?: HostSessionEditorLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
  onSessionRecordsChanged?: (sessionId: string) => void | Promise<void>;
  recordWorkflow?: HostSessionRecordWorkflow;
  navigation: {
    location: HostSessionEditorLocation;
    onChange: (next: HostSessionEditorLocation) => void;
  };
}) {
  // ---------------------------------------------------------------------------
  // Form state (reducer)
  // ---------------------------------------------------------------------------
  const [formState, dispatch] = useReducer(
    hostSessionEditorReducer,
    session,
    initialHostSessionEditorState,
  );

  const {
    title,
    bookTitle,
    bookAuthor,
    bookLink,
    bookImageUrl,
    date,
    time,
    locationLabel,
    meetingUrl,
    meetingPasscode,
    recordVisibility,
    summary,
    hasPublicationRecord,
    sessionState,
    displaySessionSnapshot,
    attendanceStatuses,
    feedbackDocument,
  } = formState;

  // ---------------------------------------------------------------------------
  // Transient UI state (separate useState — not form data)
  // ---------------------------------------------------------------------------
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [recordSaveInFlight, setRecordSaveInFlight] = useState(false);
  const [lifecycleSaveState, setLifecycleSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [publicationFeedback, setPublicationFeedback] = useState<PublicationFeedback | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePreview, setDeletePreview] = useState<HostSessionDeletionPreviewResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [sessionImportRequest, setSessionImportRequest] = useState<SessionImportRequest | null>(null);
  const [sessionImportPreview, setSessionImportPreview] = useState<SessionImportPreviewResponse | null>(null);
  const [sessionImportCommitResult, setSessionImportCommitResult] = useState<SessionImportCommitResult | null>(null);
  const [sessionImportStatus, setSessionImportStatus] = useState<"idle" | "previewing" | "ready" | "committing" | "error">("idle");
  const [sessionImportError, setSessionImportError] = useState<string | null>(null);
  const [visitedSections, setVisitedSections] = useState<Set<HostSessionEditorSection>>(
    () => new Set([navigation.location.section]),
  );
  const [visitedSources, setVisitedSources] = useState<Set<HostSessionDraftSource>>(
    () => new Set(navigation.location.section === "records" ? [navigation.location.source] : []),
  );

  const sessionIdForAigen = session?.sessionId;
  const canShowImportModeToggle = Boolean(sessionIdForAigen) && Boolean(clubSlug);
  const activeSection = navigation.location.section;
  const activeSource = navigation.location.source;

  const changeLocation = useCallback((next: HostSessionEditorLocation) => {
    setVisitedSections((current) => current.has(next.section)
      ? current
      : new Set(current).add(next.section));
    if (next.section === "records") {
      setVisitedSources((current) => current.has(next.source)
        ? current
        : new Set(current).add(next.source));
    }
    navigation.onChange(next);
  }, [navigation]);

  const changeSection = useCallback((section: HostSessionEditorSection) => {
    changeLocation({
      section,
      source: section === "records" ? activeSource : "manual",
    });
  }, [activeSource, changeLocation]);

  const changeSource = useCallback((source: HostSessionDraftSource) => {
    changeLocation({ section: "records", source });
  }, [changeLocation]);

  const handleAigenCommitted = useCallback((result: AiGenerateCommitResult) => {
    if (sessionIdForAigen) {
      if (recordWorkflow && result?.draftRevision !== null && result?.draftRevision !== undefined) {
        void recordWorkflow.onDraftCommitted({
          draftRevision: result.draftRevision,
          baseLiveRevision: result.baseLiveRevision,
          liveApplied: result.liveApplied,
        });
      } else {
        void recordWorkflow?.onReloadDraft();
      }
      void onSessionRecordsChanged?.(sessionIdForAigen);
    }
  }, [onSessionRecordsChanged, recordWorkflow, sessionIdForAigen]);

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteRestoreFocusRef = useRef<HTMLElement | null>(null);
  const committedAttendanceStatusesRef = useRef<Record<string, AttendanceStatus>>(
    Object.fromEntries(
      (session?.attendees ?? []).map((a) => [a.membershipId, a.attendanceStatus]),
    ),
  );
  const attendanceWriteStatesRef = useRef<Record<string, AttendanceWriteState>>({});

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const deadline = questionDeadlineLabelForForm(session, date);
  const sessionImportVisibility = recordWorkflow?.snapshot.visibility ?? recordVisibility;
  const isNewSession = session === null || session === undefined;
  const editorTitle = isNewSession ? "세션 문서 만들기" : "세션 문서 편집";
  const basicSaveLabel = saveState === "saving"
    ? "기본 정보를 저장하는 중"
    : isNewSession
      ? "세션 문서 저장"
      : "기본 정보 저장";
  const showReturnLink =
    returnTarget.href !== hostDashboardReturnTarget.href || returnTarget.label !== hostDashboardReturnTarget.label;
  const feedbackPreviewState = feedbackPreviewStateForSession(session, returnTarget, readmatesReturnState);
  const displaySession = useMemo(
    () => displaySessionSnapshot ?? (session ? { ...session, state: sessionState } : session),
    [displaySessionSnapshot, session, sessionState],
  );
  const destructiveActionAvailability = useMemo(
    () => getDestructiveActionAvailability(displaySession),
    [displaySession],
  );
  const publicationLifecycleHelp =
    sessionState === "OPEN"
      ? "진행 중인 세션은 먼저 마감한 뒤 기록 공개를 완료할 수 있습니다."
      : sessionState === "CLOSED"
        ? "요약과 공개 대상을 확인한 뒤 기록 공개를 완료하세요."
        : sessionState === "PUBLISHED"
          ? "공개된 기록입니다. 공개 대상은 저장 버튼으로 변경할 수 있습니다."
          : "세션을 만든 뒤 기록 요약과 공개 범위를 저장할 수 있습니다.";
  const overview = useMemo(
    () => buildHostSessionEditorOverview({
      isNewSession,
      liveRevision: recordWorkflow?.editor.liveRevision ?? (hasPublicationRecord ? 1 : 0),
      liveSnapshot: recordWorkflow?.editor.liveSnapshot
        ?? (hasPublicationRecord ? { visibility: recordVisibility, publicationSummary: summary } : null),
      lastAppliedAt: recordWorkflow?.editor.liveSessionUpdatedAt ?? null,
      draft: recordWorkflow?.editor.draft
        ? {
            source: recordWorkflow.editor.draft.source,
            updatedAt: recordWorkflow.editor.draft.updatedAt,
          }
        : null,
      draftSaveState: recordWorkflow?.saveState ?? "idle",
      draftLiveBaseStale: recordWorkflow?.editor.draftLiveBaseStale ?? false,
      validationIssues: recordWorkflow?.editor.validationSummary.issues ?? [],
    }),
    [
      hasPublicationRecord,
      isNewSession,
      recordVisibility,
      recordWorkflow,
      summary,
    ],
  );

  // ---------------------------------------------------------------------------
  // Stable dispatch helpers
  // ---------------------------------------------------------------------------
  const setField = useCallback((key: BasicSessionField, value: string) => {
    dispatch({ type: "SET_FIELD", key, value });
  }, []);

  // Stable per-field setters for panel props
  const onTitleChange = useCallback((value: string) => setField("title", value), [setField]);
  const onBookTitleChange = useCallback((value: string) => setField("bookTitle", value), [setField]);
  const onBookAuthorChange = useCallback((value: string) => setField("bookAuthor", value), [setField]);
  const onBookLinkChange = useCallback((value: string) => setField("bookLink", value), [setField]);
  const onBookImageUrlChange = useCallback((value: string) => setField("bookImageUrl", value), [setField]);
  const onDateChange = useCallback((value: string) => setField("date", value), [setField]);
  const onTimeChange = useCallback((value: string) => setField("time", value), [setField]);
  const onLocationLabelChange = useCallback((value: string) => setField("locationLabel", value), [setField]);
  const onMeetingUrlChange = useCallback((value: string) => setField("meetingUrl", value), [setField]);
  const onMeetingPasscodeChange = useCallback((value: string) => setField("meetingPasscode", value), [setField]);

  const onRecordVisibilityChange = useCallback((visibility: typeof recordVisibility) => {
    dispatch({ type: "SET_RECORD_VISIBILITY", visibility });
    setSessionImportRequest(null);
    setSessionImportPreview(null);
    setSessionImportCommitResult(null);
    setSessionImportError(null);
    setSessionImportStatus("idle");
  }, []);
  const onSummaryChange = useCallback(
    (value: string) => setField("summary", value),
    [setField],
  );

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------
  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  }, []);

  const deletionErrorMessage = (status?: number) => {
    if (status === 404) {
      return "세션을 찾을 수 없습니다.";
    }
    if (status === 409) {
      return "이미 닫히거나 공개된 세션은 삭제할 수 없습니다.";
    }
    return "세션 삭제에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  };

  const closeDeleteModal = useCallback(() => {
    if (deleteSubmitting) {
      return;
    }

    setDeleteModalOpen(false);
  }, [deleteSubmitting]);

  const openDeleteModal = useCallback(async () => {
    if (!session || !destructiveActionAvailability.canDelete) {
      return;
    }

    deleteRestoreFocusRef.current = deleteTriggerRef.current;
    setDeleteModalOpen(true);
    setDeletePreview(null);
    setDeleteError(null);
    setDeletePreviewLoading(true);

    try {
      const response = await actions.loadDeletionPreview(session.sessionId);

      if (!response.ok) {
        setDeleteError(deletionErrorMessage(response.status));
        return;
      }

      setDeletePreview((await response.json()) as HostSessionDeletionPreviewResponse);
    } catch {
      setDeleteError(deletionErrorMessage());
    } finally {
      setDeletePreviewLoading(false);
    }
  }, [session, destructiveActionAvailability.canDelete, actions]);

  const confirmDeleteSession = useCallback(async () => {
    if (!session || !deletePreview || deleteSubmitting) {
      return;
    }

    setDeleteError(null);
    setDeleteSubmitting(true);

    try {
      const response = await actions.deleteSession(session.sessionId);

      if (!response.ok) {
        setDeleteError(deletionErrorMessage(response.status));
        return;
      }

      globalThis.location.href = scopedHostRedirectHref("/app/host/sessions/new");
    } catch {
      setDeleteError(deletionErrorMessage());
    } finally {
      setDeleteSubmitting(false);
    }
  }, [session, deletePreview, deleteSubmitting, actions]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saveState === "saving") {
        return;
      }

      setSaveState("saving");
      const payload = buildHostSessionRequest({
        title,
        bookTitle,
        bookAuthor,
        bookLink,
        bookImageUrl,
        locationLabel,
        meetingUrl,
        meetingPasscode,
        date,
        startTime: time,
      }, session ?? undefined);
      try {
        const response = await actions.saveSession(session?.sessionId ?? null, payload);

        if (response.ok) {
          setSaveState("saved");
          if (isNewSession) {
            const created = (await response.json()) as { sessionId: string };
            globalThis.location.href = scopedHostRedirectHref(`/app/host/sessions/${encodeURIComponent(created.sessionId)}/edit`);
            return;
          }

          return;
        }

        setSaveState("error");
        flash("저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도하세요");
      } catch {
        setSaveState("error");
        flash("저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도하세요");
      }
    },
    [
      saveState,
      title,
      bookTitle,
      bookAuthor,
      bookLink,
      bookImageUrl,
      locationLabel,
      meetingUrl,
      meetingPasscode,
      date,
      time,
      session,
      isNewSession,
      actions,
      flash,
    ],
  );

  const savePublication = useCallback(async () => {
    if (!session || recordSaveInFlight) {
      return;
    }

    const publicationRequest = buildPublicationRequest(summary, recordVisibility);

    if (!publicationRequest) {
      setPublicationFeedback({
        tone: "error",
        message: "기록 요약을 입력한 뒤 저장해주세요.",
      });
      return;
    }

    setRecordSaveInFlight(true);
    setPublicationFeedback(null);

    try {
      const response = await actions.savePublication(session.sessionId, publicationRequest);

      if (!response.ok) {
        setPublicationFeedback({
          tone: "error",
          message:
            response.status === 400
              ? "기록 요약을 입력한 뒤 저장해주세요."
              : "기록 공개 범위 저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.",
        });
        return;
      }

      dispatch({
        type: "PUBLICATION_SAVED",
        publicSummary: publicationRequest.publicSummary,
        visibility: publicationRequest.visibility,
      });
      setPublicationFeedback({
        tone: "success",
        message: "기록 공개 범위를 저장했습니다.",
      });
    } catch {
      setPublicationFeedback({
        tone: "error",
        message: "기록 공개 범위 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      setRecordSaveInFlight(false);
    }
  }, [session, recordSaveInFlight, summary, recordVisibility, actions]);

  const closeSession = useCallback(async () => {
    if (!session || lifecycleSaveState === "saving") {
      return;
    }

    setLifecycleSaveState("saving");
    try {
      const response = await actions.closeSession(session.sessionId);

      if (!response.ok) {
        setLifecycleSaveState("error");
        flash("세션 마감에 실패했습니다. 상태를 확인한 뒤 다시 시도해 주세요");
        return;
      }

      const nextSession = await response.json();
      dispatch({ type: "SESSION_LIFECYCLE_UPDATED", snapshot: nextSession });
      setLifecycleSaveState("idle");
      flash("세션을 마감했습니다.");
    } catch {
      setLifecycleSaveState("error");
      flash("세션 마감에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요");
    }
  }, [session, lifecycleSaveState, actions, flash]);

  const publishRecord = useCallback(async () => {
    if (!session || recordSaveInFlight || lifecycleSaveState === "saving") {
      return;
    }

    if (recordVisibility === "HOST_ONLY") {
      setPublicationFeedback({
        tone: "error",
        message: "기록 공개 전 멤버 공개 또는 외부 공개를 선택해 주세요.",
      });
      return;
    }

    const publicationRequest = buildPublicationRequest(summary, recordVisibility);

    if (!publicationRequest) {
      setPublicationFeedback({
        tone: "error",
        message: "기록 요약을 입력한 뒤 공개해 주세요.",
      });
      return;
    }

    setRecordSaveInFlight(true);
    setLifecycleSaveState("saving");
    setPublicationFeedback(null);

    try {
      const saveResponse = await actions.savePublication(session.sessionId, publicationRequest);

      if (!saveResponse.ok) {
        setPublicationFeedback({
          tone: "error",
          message: "기록 공개 범위 저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.",
        });
        return;
      }

      const publishResponse = await actions.publishSession(session.sessionId);

      if (!publishResponse.ok) {
        setPublicationFeedback({
          tone: "error",
          message: "기록 공개에 실패했습니다. 세션이 마감되었는지 확인해 주세요.",
        });
        return;
      }

      const nextSession = await publishResponse.json();
      dispatch({
        type: "PUBLICATION_SAVED",
        publicSummary: publicationRequest.publicSummary,
        visibility: publicationRequest.visibility,
      });
      dispatch({ type: "SESSION_LIFECYCLE_UPDATED", snapshot: nextSession });
      setPublicationFeedback({
        tone: "success",
        message: publicationRequest.visibility === "PUBLIC" ? "외부 공개가 완료되었습니다." : "멤버 기록 공개가 완료되었습니다.",
      });
    } catch {
      setPublicationFeedback({
        tone: "error",
        message: "기록 공개에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      setRecordSaveInFlight(false);
      setLifecycleSaveState("idle");
    }
  }, [session, recordSaveInFlight, lifecycleSaveState, recordVisibility, summary, actions]);

  const publishSessionFromOverview = useCallback(async () => {
    if (!recordWorkflow) {
      await publishRecord();
      return;
    }
    if (!session || lifecycleSaveState === "saving") {
      return;
    }

    setLifecycleSaveState("saving");
    try {
      const response = await actions.publishSession(session.sessionId);
      if (!response.ok) {
        setLifecycleSaveState("error");
        flash("세션 공개에 실패했습니다. 적용된 기록과 세션 상태를 확인해 주세요");
        return;
      }
      dispatch({ type: "SESSION_LIFECYCLE_UPDATED", snapshot: await response.json() });
      setLifecycleSaveState("idle");
      flash("세션을 공개했습니다.");
    } catch {
      setLifecycleSaveState("error");
      flash("세션 공개에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요");
    }
  }, [actions, flash, lifecycleSaveState, publishRecord, recordWorkflow, session]);

  const updateAttendance = useCallback(
    async (membershipId: string, attendanceStatus: AttendanceStatus) => {
      if (!session) {
        return;
      }

      dispatch({ type: "UPDATE_ATTENDANCE", membershipId, status: attendanceStatus });

      const writeState = attendanceWriteStatesRef.current[membershipId] ?? {
        inFlight: false,
        inFlightStatus: null,
        queuedStatus: null,
      };
      attendanceWriteStatesRef.current[membershipId] = writeState;

      if (writeState.inFlight) {
        writeState.queuedStatus = writeState.inFlightStatus === attendanceStatus ? null : attendanceStatus;
        return;
      }

      const sendAttendanceWrite = async (status: AttendanceStatus) => {
        const currentWriteState = attendanceWriteStatesRef.current[membershipId] ?? {
          inFlight: false,
          inFlightStatus: null,
          queuedStatus: null,
        };
        attendanceWriteStatesRef.current[membershipId] = currentWriteState;
        currentWriteState.inFlight = true;
        currentWriteState.inFlightStatus = status;

        let writeSucceeded = false;

        const rollbackToCommittedStatus = () => {
          const committedStatus = committedAttendanceStatusesRef.current[membershipId] ?? "UNKNOWN";

          if (currentWriteState.queuedStatus === null) {
            dispatch({ type: "UPDATE_ATTENDANCE", membershipId, status: committedStatus });
          }
        };

        try {
          const response = await actions.updateAttendance(session.sessionId, [{ membershipId, attendanceStatus: status }]);

          writeSucceeded = response.ok;

          if (response.ok) {
            committedAttendanceStatusesRef.current[membershipId] = status;

            if (currentWriteState.queuedStatus === null || currentWriteState.queuedStatus === status) {
              currentWriteState.queuedStatus = null;
            }
          } else if (currentWriteState.queuedStatus === null) {
            rollbackToCommittedStatus();
            flash("출석 저장에 실패했습니다. 다시 선택해 주세요");
          }
        } catch {
          if (currentWriteState.queuedStatus === null) {
            rollbackToCommittedStatus();
            flash("출석 저장에 실패했습니다. 다시 선택해 주세요");
          }
        } finally {
          const nextStatus = currentWriteState.queuedStatus;
          currentWriteState.inFlight = false;
          currentWriteState.inFlightStatus = null;
          currentWriteState.queuedStatus = null;

          if (nextStatus !== null) {
            void sendAttendanceWrite(nextStatus);
          } else if (!writeSucceeded) {
            delete attendanceWriteStatesRef.current[membershipId];
          }
        }
      };

      void sendAttendanceWrite(attendanceStatus);
    },
    [session, actions, flash],
  );

  const previewSessionImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      if (!session) {
        input.value = "";
        return;
      }

      setSessionImportStatus("previewing");
      setSessionImportError(null);
      setSessionImportPreview(null);
      setSessionImportRequest(null);
      setSessionImportCommitResult(null);

      try {
        const sourceJson = await readTextFile(file);
        const request = buildSessionImportRequest(
          sourceJson,
          sessionImportVisibility,
          recordWorkflow?.expectedDraftRevision ?? null,
        );
        const preview = await actions.previewSessionImport(session.sessionId, request);
        setSessionImportRequest(request);
        setSessionImportPreview(preview);
        setSessionImportStatus(preview.valid ? "ready" : "error");
        if (!preview.valid) {
          setSessionImportError(sessionImportFailureMessage("preview"));
        }
      } catch (error) {
        setSessionImportError(error instanceof Error ? error.message : "가져온 JSON을 확인할 수 없습니다.");
        setSessionImportStatus("error");
      } finally {
        input.value = "";
      }
    },
    [session, sessionImportVisibility, actions, recordWorkflow],
  );

  const commitSessionImport = useCallback(async () => {
    if (!session || !sessionImportRequest || !sessionImportPreview?.valid || sessionImportStatus === "committing") {
      return;
    }

    setSessionImportStatus("committing");
    setSessionImportError(null);
    setSessionImportCommitResult(null);

    try {
      const committed = await actions.commitSessionImport(session.sessionId, sessionImportRequest);
      const commitResult = buildSessionImportCommitResult(
        committed,
        sessionImportPreview,
        sessionImportRequest.recordVisibility,
      );
      if (recordWorkflow) {
        await recordWorkflow.onDraftCommitted(committed);
      }
      setSessionImportStatus("idle");
      setSessionImportPreview(null);
      setSessionImportRequest(null);
      setSessionImportCommitResult(commitResult);
      flash("가져온 세션 기록을 초안으로 저장했습니다");
    } catch {
      setSessionImportStatus("error");
      setSessionImportError(sessionImportFailureMessage("commit-network"));
    }
  }, [session, sessionImportRequest, sessionImportPreview, sessionImportStatus, actions, flash, recordWorkflow]);

  const feedbackDocumentForPanel = feedbackDocumentUploadStatus(feedbackDocument);

  return (
    <main className="rm-host-session-editor">
      <section className="page-header-compact">
        <div className="container">
          <div>
            {showReturnLink ? (
              <LinkComponent to={returnTarget.href} state={returnTarget.state} className="btn btn-quiet btn-sm" style={{ marginBottom: 14 }}>
                {returnTarget.label}
              </LinkComponent>
            ) : null}
            <div className="eyebrow">세션 운영 문서</div>
            <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
              {editorTitle}
            </h1>
            <div style={{ marginTop: "10px" }}>
              {displaySession ? (
                <SessionIdentity
                  sessionNumber={displaySession.sessionNumber}
                  state={displaySession.state}
                  date={displaySession.date}
                  published={displaySession.state === "PUBLISHED"}
                  feedbackDocumentAvailable={displaySession.feedbackDocument.uploaded}
                />
              ) : (
                <div className="rm-session-identity">
                  <span className="rm-session-identity__chip">새 예정 세션</span>
                  <span className="rm-session-identity__chip">호스트 전용</span>
                </div>
              )}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <span className="badge">{overview.applied.visibilityLabel}</span>
              <span className="badge">{overview.draft.statusLabel}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rm-host-session-editor__content">
        <div className="container">
          <SessionEditorSectionNav
            activeSection={activeSection}
            onSectionChange={changeSection}
          />

          <div className="stack" style={{ "--stack": "24px" } as CSSProperties}>
            {visitedSections.has("overview") ? (
              <div hidden={activeSection !== "overview"}>
                <SessionOverviewSection
                  overview={overview}
                  sessionState={sessionState}
                  onNextAction={changeLocation}
                  onCloseSession={session ? closeSession : undefined}
                  onPublishSession={session ? publishSessionFromOverview : undefined}
                  lifecyclePending={lifecycleSaveState === "saving"}
                />
                {displaySession ? (
                  <div style={{ marginTop: 20 }}>
                    <HostSessionNotificationActions
                      sessionId={displaySession.sessionId}
                      state={displaySession.state}
                      visibility={displaySession.visibility}
                      feedbackDocumentUploaded={displaySession.feedbackDocument.uploaded}
                      dispatches={notificationDispatches}
                      LinkComponent={LinkComponent}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <form
              id="host-session-editor"
              onSubmit={handleSubmit}
              className="stack"
              style={{ "--stack": "24px" } as CSSProperties}
            >
              {visitedSections.has("basic") || activeSection === "basic" ? (
                <>
                  <BasicSessionPanel
                    activeSection={activeSection}
                    title={title}
                    bookTitle={bookTitle}
                    bookAuthor={bookAuthor}
                    bookLink={bookLink}
                    bookImageUrl={bookImageUrl}
                    date={date}
                    time={time}
                    deadline={deadline}
                    locationLabel={locationLabel}
                    meetingUrl={meetingUrl}
                    meetingPasscode={meetingPasscode}
                    onTitleChange={onTitleChange}
                    onBookTitleChange={onBookTitleChange}
                    onBookAuthorChange={onBookAuthorChange}
                    onBookLinkChange={onBookLinkChange}
                    onBookImageUrlChange={onBookImageUrlChange}
                    onDateChange={onDateChange}
                    onTimeChange={onTimeChange}
                    onLocationLabelChange={onLocationLabelChange}
                    onMeetingUrlChange={onMeetingUrlChange}
                    onMeetingPasscodeChange={onMeetingPasscodeChange}
                  />
                  <div hidden={activeSection !== "basic"} className="stack" style={{ "--stack": "16px" } as CSSProperties}>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={saveState === "saving"}
                        aria-describedby="host-session-basic-save-state"
                      >
                        {basicSaveLabel}
                      </button>
                    </div>
                    <div
                      className="small"
                      id="host-session-basic-save-state"
                      role={saveState === "idle" ? undefined : saveState === "error" ? "alert" : "status"}
                      style={{ color: saveState === "error" ? "var(--danger)" : "var(--text-3)", textAlign: "right" }}
                    >
                      {saveState === "saving"
                        ? "기본 정보를 저장하고 있습니다."
                        : saveState === "saved"
                          ? isNewSession
                            ? "저장되었습니다. 세션 문서 편집 화면으로 이동합니다."
                            : "저장되었습니다."
                          : saveState === "error"
                            ? "저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도하세요."
                            : "책, 일정, 장소와 접속 정보만 저장합니다."}
                    </div>
                    {session ? (
                      <section className="surface" aria-labelledby="host-session-danger-title" style={{ padding: "22px" }}>
                        <div className="eyebrow" id="host-session-danger-title" style={{ marginBottom: "10px" }}>
                          위험 작업
                        </div>
                        <button
                          ref={deleteTriggerRef}
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={!destructiveActionAvailability.canDelete}
                          onClick={openDeleteModal}
                          style={{ color: "var(--danger)" }}
                        >
                          세션 삭제
                        </button>
                        <div className="tiny" style={{ marginTop: "8px" }}>
                          {destructiveActionAvailability.guidance}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </>
              ) : null}

              {visitedSections.has("attendance") || activeSection === "attendance" ? (
                <AttendancePanel
                  activeSection={activeSection}
                  session={session}
                  attendanceStatuses={attendanceStatuses}
                  emptyMessage={emptyManagementMessage}
                  onUpdateAttendance={updateAttendance}
                />
              ) : null}

              {visitedSections.has("records") || activeSection === "records" ? (
                <div hidden={activeSection !== "records"} className="stack" style={{ "--stack": "18px" } as CSSProperties}>
                  {session ? (
                    <>
                      <div className="row" role="tablist" aria-label="기록 작성 방식" style={{ gap: 8, flexWrap: "wrap" }}>
                        {([
                          ["manual", "직접 작성"],
                          ["ai", "AI 초안"],
                          ["json", "외부 JSON"],
                        ] as const).map(([source, label]) => (
                          <button
                            key={source}
                            type="button"
                            role="tab"
                            aria-selected={activeSource === source}
                            className={`btn btn-sm${activeSource === source ? " btn-primary" : " btn-quiet"}`}
                            disabled={source === "ai" && !canShowImportModeToggle}
                            onClick={() => changeSource(source)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {visitedSources.has("manual") || activeSource === "manual" ? (
                        <div hidden={activeSource !== "manual"}>
                          {!recordWorkflow ? (
                            <PublicationPanel
                              activeSection={activeSection}
                              session={session}
                              sessionState={sessionState}
                              recordVisibility={recordVisibility}
                              recordSaveInFlight={recordSaveInFlight}
                              lifecycleSaveState={lifecycleSaveState}
                              summary={summary}
                              publicationFeedback={publicationFeedback}
                              publicationLifecycleHelp={publicationLifecycleHelp}
                              onRecordVisibilityChange={onRecordVisibilityChange}
                              onSummaryChange={onSummaryChange}
                              onPublicationFeedbackChange={setPublicationFeedback}
                              onSavePublication={savePublication}
                              onCloseSession={closeSession}
                              onPublishRecord={publishRecord}
                            />
                          ) : (
                            <SessionRecordDraftPanel
                              activeSection={activeSection}
                              liveSnapshot={recordWorkflow.editor.liveSnapshot}
                              snapshot={recordWorkflow.snapshot}
                              saveState={recordWorkflow.saveState}
                              validationIssues={recordWorkflow.editor.validationSummary.issues}
                              draftLiveBaseStale={recordWorkflow.editor.draftLiveBaseStale}
                              onSnapshotChange={recordWorkflow.onSnapshotChange}
                              onReloadDraft={recordWorkflow.onReloadDraft}
                              onCopyInput={recordWorkflow.onCopyInput}
                              onRebaseDraft={recordWorkflow.onRebaseDraft}
                              rebasePending={recordWorkflow.rebasePending}
                              rebaseError={recordWorkflow.rebaseError}
                              onReviewDraft={() => void recordWorkflow.confirmation.onReview()}
                            />
                          )}
                        </div>
                      ) : null}

                      {(["ai", "json"] as const).map((source) =>
                        visitedSources.has(source) || activeSource === source ? (
                          <div key={source} hidden={activeSource !== source}>
                            <SessionRecordCompletionPanel
                              activeSection={activeSection}
                              panelId={`host-editor-panel-records-${source}`}
                              sessionId={session.sessionId}
                              clubSlug={clubSlug}
                              mode={importModeForSource(source)}
                              canUseAigen={canShowImportModeToggle}
                              feedbackDocument={feedbackDocumentForPanel}
                              previewState={feedbackPreviewState}
                              LinkComponent={LinkComponent}
                              recordVisibility={sessionImportVisibility}
                              preview={sessionImportPreview}
                              commitResult={sessionImportCommitResult}
                              status={sessionImportStatus}
                              error={sessionImportError}
                              expectedDraftRevision={recordWorkflow?.expectedDraftRevision ?? null}
                              onModeChange={(mode) => changeSource(mode === "aigen" ? "ai" : "json")}
                              onAigenCommitted={handleAigenCommitted}
                              onFileSelected={previewSessionImport}
                              onCommit={commitSessionImport}
                            />
                          </div>
                        ) : null
                      )}
                    </>
                  ) : (
                    <div className="surface-quiet small" style={{ padding: 18 }}>
                      기본 정보를 저장한 뒤 기록 작업대를 사용할 수 있습니다.
                    </div>
                  )}
                </div>
              ) : null}

              {visitedSections.has("history") || activeSection === "history" ? (
                <SessionHistoryPanel
                  activeSection={activeSection}
                  items={recordWorkflow?.history ?? []}
                  nextCursor={recordWorkflow?.historyNextCursor ?? null}
                  loadingMore={recordWorkflow?.historyLoadingMore ?? false}
                  onLoadMore={recordWorkflow?.onLoadMoreHistory}
                  expectedDraftRevision={recordWorkflow?.expectedDraftRevision ?? null}
                  restoring={recordWorkflow?.restoring ?? false}
                  onRestore={recordWorkflow?.onRestore ?? (() => undefined)}
                />
              ) : null}

              {recordWorkflow?.confirmation.message ? (
                <div
                  className="surface-quiet small"
                  role={recordWorkflow.confirmation.message.kind}
                  style={{ padding: 14 }}
                >
                  {recordWorkflow.confirmation.message.text}
                </div>
              ) : null}
            </form>
          </div>
        </div>
      </section>

      {deleteModalOpen ? (
        <HostSessionDeletionPreviewDialog
          preview={deletePreview}
          previewLoading={deletePreviewLoading}
          error={deleteError}
          submitting={deleteSubmitting}
          restoreFocusRef={deleteRestoreFocusRef}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteSession}
        />
      ) : null}

      {recordWorkflow ? (
        <SessionRecordApplyDialog
          open={recordWorkflow.confirmation.open}
          preview={recordWorkflow.confirmation.preview}
          submitting={recordWorkflow.confirmation.submitting}
          onCancel={recordWorkflow.confirmation.onCancel}
          onConfirm={() => void recordWorkflow.confirmation.onConfirm()}
        />
      ) : null}

      {toast ? (
        <div role="status" className="m-toast is-on">
          ✓ {toast}
        </div>
      ) : null}
    </main>
  );
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsText(file);
  });
}
