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
import { DocumentStatePanel } from "./session-editor/document-state-panel";
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
import {
  handleMobileEditorSectionKeyDown,
  mobileEditorSections,
  type MobileEditorSection,
} from "./session-editor/mobile-editor-tabs";
import { PublicationPanel } from "./session-editor/publication-panel";
import {
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
import {
  HostActionConfirmationDialog,
  type HostActionPreview,
  type NotificationDecision,
} from "./session-editor/host-action-confirmation-dialog";

export type { HostSessionEditorLinkComponent } from "./session-editor/session-editor-links";

type HostSessionRecordWorkflow = {
  editor: {
    liveSnapshot: SessionRecordDraftSnapshot;
    draftLiveBaseStale: boolean;
    validationSummary: { valid: boolean; issues: string[] };
  };
  history: SessionHistoryPanelItem[];
  snapshot: SessionRecordDraftSnapshot;
  saveState: DraftSaveState;
  expectedDraftRevision: number | null;
  restoring: boolean;
  onSnapshotChange: (snapshot: SessionRecordDraftSnapshot) => void;
  onReloadDraft: () => void | Promise<void>;
  onCopyInput: () => void | Promise<void>;
  confirmation: {
    open: boolean;
    preview: HostActionPreview | null;
    decision: NotificationDecision | null;
    submitting: boolean;
    message: { kind: "alert" | "status"; text: string } | null;
    onReview: () => void | Promise<void>;
    onDecisionChange: (decision: NotificationDecision) => void;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
  };
  onRestore: (request: {
    revisionId: string;
    expectedDraftRevision: number | null;
  }) => void | Promise<void>;
};

const emptyManagementMessage = "세션을 만든 뒤 참석과 피드백 문서를 관리할 수 있습니다.";

const operationOrder = [
  "기본 정보 → 일정 확정",
  "모임 종료 후 출석 확정",
  "기록 요약 작성 → 공개 범위",
  "회차 피드백 문서 등록",
];

const defaultHostDashboardReturnTarget: ReadmatesReturnTarget = {
  href: "/app/host",
  label: "운영으로",
};

function scopedHostRedirectHref(href: string) {
  return scopedAppLinkTarget(globalThis.location.pathname, href);
}

type ImportMode = SessionRecordCompletionMode;

function readInitialImportMode(): ImportMode {
  if (typeof window === "undefined") {
    return "aigen";
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("records") === "json" ? "json" : "aigen";
  } catch {
    return "aigen";
  }
}

function writeImportModeToUrl(mode: ImportMode) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (mode === "json") {
      params.set("records", "json");
      params.delete("aigen");
    } else {
      params.set("aigen", "1");
      params.delete("records");
    }
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash ?? ""}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  } catch {
    // Best-effort — URL persistence is non-critical to functionality.
  }
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
  const [activeMobileSection, setActiveMobileSection] = useState<MobileEditorSection>("basic");
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
  const [importMode, setImportMode] = useState<ImportMode>(() => readInitialImportMode());

  const sessionIdForAigen = session?.sessionId;
  const canShowImportModeToggle = Boolean(sessionIdForAigen) && Boolean(clubSlug);
  // If we landed on ?aigen=1 but can't actually show the AI tab (no session yet
  // or missing clubSlug), fall back to JSON mode so the panel area renders.
  const effectiveImportMode: ImportMode = canShowImportModeToggle ? importMode : "json";

  const handleImportModeChange = useCallback((next: ImportMode) => {
    setImportMode(next);
    writeImportModeToUrl(next);
  }, []);

  // If the toggle was hidden (e.g. session not yet created) and the URL still
  // has ?aigen=1, scrub it so reload after creation doesn't surprise the host.
  useEffect(() => {
    if (!canShowImportModeToggle) {
      writeImportModeToUrl("json");
    }
  }, [canShowImportModeToggle]);

  const handleAigenCommitted = useCallback(() => {
    if (sessionIdForAigen) {
      void recordWorkflow?.onReloadDraft();
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
  const isNewSession = session === null || session === undefined;
  const editorTitle = isNewSession ? "세션 문서 만들기" : "세션 문서 편집";
  const primarySaveLabel = isNewSession ? "세션 문서 저장" : "변경 사항 저장";
  const saveButtonLabel = saveState === "saving" ? (isNewSession ? "세션 문서를 저장하는 중" : "변경사항을 저장하는 중") : primarySaveLabel;
  const saveGuidance = isNewSession
    ? "책, 일정, 장소, 링크를 저장하면 예정 세션 문서가 생성됩니다. 기록 공개 범위와 피드백 문서는 생성 후 각 섹션에서 따로 저장합니다."
    : "세션 기본 정보는 변경 사항 저장 버튼으로 저장하고, 기록 공개 범위와 피드백 문서는 각 섹션에서 따로 저장합니다.";
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
        const request = buildSessionImportRequest(sourceJson, recordVisibility);
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
    [session, recordVisibility, actions],
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
        await recordWorkflow.onReloadDraft();
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
          <div className="row-between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
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
              <div className="small" style={{ marginTop: "8px" }}>
                {session
                  ? `${session.title}의 책, 일정, 링크, 출석, 기록 공개 범위, 피드백 문서를 한 문서에서 관리합니다.`
                  : "새 세션의 책, 일정, 장소, 링크를 먼저 등록합니다."}
              </div>
              <div
                className="tiny"
                id="host-session-save-state"
                role={saveState === "idle" ? undefined : saveState === "error" ? "alert" : "status"}
                style={{ marginTop: "8px", color: saveState === "error" ? "var(--danger)" : "var(--text-3)" }}
              >
                {saveState === "saving"
                  ? "기본 정보를 저장하고 있습니다."
                  : saveState === "saved"
                    ? isNewSession
                      ? "저장되었습니다. 세션 문서 편집 화면으로 이동합니다."
                      : "저장되었습니다. 이전 화면으로 이동합니다."
                    : saveState === "error"
                      ? "저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도하세요."
                      : "기본 정보 저장, 기록 공개 범위 저장, 세션 기록 패키지 저장은 각각 별도로 처리됩니다."}
              </div>
            </div>
            <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                type="submit"
                form="host-session-editor"
                disabled={saveState === "saving"}
                aria-describedby="host-session-save-state"
              >
                {saveButtonLabel}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="mobile-only rm-host-session-editor__segments">
        <div
          className="m-hscroll"
          role="tablist"
          aria-label="호스트 편집 섹션"
          data-testid="host-editor-mobile-segments"
          onKeyDown={(event) =>
            handleMobileEditorSectionKeyDown(event, activeMobileSection, setActiveMobileSection)
          }
          style={{ padding: 0, gap: 6 }}
        >
          {mobileEditorSections.map((section) => {
            const selected = activeMobileSection === section.key;

            return (
              <button
                key={section.key}
                id={section.tabId}
                type="button"
                role="tab"
                className={`m-chip${selected ? " is-on" : ""}`}
                aria-selected={selected}
                aria-controls={section.panelIds.join(" ")}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveMobileSection(section.key)}
                style={{
                  minHeight: 32,
                  height: 32,
                  padding: "0 14px",
                  fontSize: 13,
                  borderColor: selected ? "var(--text)" : "var(--line)",
                  background: selected ? "var(--text)" : "transparent",
                  color: selected ? "var(--bg)" : "var(--text-2)",
                }}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      <section className="rm-host-session-editor__content">
        <div className="container">
          <div className="rm-host-session-editor__layout">
            <form
              id="host-session-editor"
              onSubmit={handleSubmit}
              className="stack"
              style={{ "--stack": "28px" } as CSSProperties}
            >
              <BasicSessionPanel
                activeMobileSection={activeMobileSection}
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

              {!recordWorkflow ? (
                <PublicationPanel
                  activeMobileSection={activeMobileSection}
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
              ) : null}

              <AttendancePanel
                activeMobileSection={activeMobileSection}
                session={session}
                attendanceStatuses={attendanceStatuses}
                emptyMessage={emptyManagementMessage}
                onUpdateAttendance={updateAttendance}
              />

              {recordWorkflow ? (
                <SessionRecordDraftPanel
                  activeMobileSection={activeMobileSection}
                  liveSnapshot={recordWorkflow.editor.liveSnapshot}
                  snapshot={recordWorkflow.snapshot}
                  saveState={recordWorkflow.saveState}
                  validationIssues={recordWorkflow.editor.validationSummary.issues}
                  draftLiveBaseStale={recordWorkflow.editor.draftLiveBaseStale}
                  onSnapshotChange={recordWorkflow.onSnapshotChange}
                  onReloadDraft={recordWorkflow.onReloadDraft}
                  onCopyInput={recordWorkflow.onCopyInput}
                  onReviewDraft={() => void recordWorkflow.confirmation.onReview()}
                />
              ) : null}

              <SessionRecordCompletionPanel
                activeMobileSection={activeMobileSection}
                sessionId={session?.sessionId}
                clubSlug={clubSlug}
                mode={effectiveImportMode}
                canUseAigen={canShowImportModeToggle}
                feedbackDocument={feedbackDocumentForPanel}
                previewState={feedbackPreviewState}
                LinkComponent={LinkComponent}
                recordVisibility={recordVisibility}
                preview={sessionImportPreview}
                commitResult={sessionImportCommitResult}
                status={sessionImportStatus}
                error={sessionImportError}
                onModeChange={handleImportModeChange}
                onAigenCommitted={handleAigenCommitted}
                onFileSelected={previewSessionImport}
                onCommit={commitSessionImport}
              />

              <SessionHistoryPanel
                activeMobileSection={activeMobileSection}
                items={recordWorkflow?.history ?? []}
                expectedDraftRevision={recordWorkflow?.expectedDraftRevision ?? null}
                restoring={recordWorkflow?.restoring ?? false}
                onRestore={recordWorkflow?.onRestore ?? (() => undefined)}
              />

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

            <aside className="stack rm-host-session-editor__aside" style={{ "--stack": "20px" } as CSSProperties}>
              <DocumentStatePanel
                session={displaySession}
                saveState={saveState}
                recordVisibility={recordVisibility}
                hasPublicationRecord={hasPublicationRecord}
                feedbackDocumentUploaded={feedbackDocument.uploaded}
              />

              {displaySession ? (
                <HostSessionNotificationActions
                  sessionId={displaySession.sessionId}
                  state={displaySession.state}
                  visibility={displaySession.visibility}
                  feedbackDocumentUploaded={displaySession.feedbackDocument.uploaded}
                  dispatches={notificationDispatches}
                  LinkComponent={LinkComponent}
                />
              ) : null}

              <div className="surface" style={{ padding: "22px" }}>
                <div className="eyebrow" style={{ marginBottom: "10px" }}>
                  저장 안내
                </div>
                <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
                  {saveGuidance}
                </p>
              </div>

              <div className="surface-quiet" style={{ padding: "22px" }}>
                <div className="eyebrow" style={{ marginBottom: "10px" }}>
                  운영 순서
                </div>
                <ol className="small" style={{ margin: 0, paddingLeft: "16px" }}>
                  {operationOrder.map((item) => (
                    <li key={item} style={{ marginBottom: "6px" }}>
                      {item}
                    </li>
                  ))}
                </ol>
              </div>

              {session ? (
                <div className="surface" style={{ padding: "22px" }}>
                  <div className="eyebrow" style={{ marginBottom: "10px" }}>
                    위험 작업
                  </div>
                  <button
                    ref={deleteTriggerRef}
                    className="btn btn-ghost btn-sm u-w-full"
                    type="button"
                    disabled={!destructiveActionAvailability.canDelete}
                    onClick={openDeleteModal}
                    style={{ justifyContent: "flex-start", color: "var(--danger)" }}
                  >
                    세션 삭제
                  </button>
                  <div className="tiny" style={{ marginTop: "8px" }}>
                    {destructiveActionAvailability.guidance}
                  </div>
                </div>
              ) : null}
            </aside>
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
        <HostActionConfirmationDialog
          open={recordWorkflow.confirmation.open}
          preview={recordWorkflow.confirmation.preview}
          decision={recordWorkflow.confirmation.decision}
          submitting={recordWorkflow.confirmation.submitting}
          onDecisionChange={recordWorkflow.confirmation.onDecisionChange}
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
