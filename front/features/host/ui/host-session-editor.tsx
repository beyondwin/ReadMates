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
  getDestructiveActionAvailability,
  questionDeadlineLabelForForm,
} from "@/features/host/model/host-session-editor-model";
import {
  compatibilityVisibilityForExposure,
} from "@/features/host/model/session-exposure-model";
import type {
  HostSessionDraftSource,
  HostSessionEditorLocation,
  HostSessionEditorSection,
} from "@/features/host/model/host-session-editor-navigation";
import { hostSessionEditHref } from "@/features/host/model/host-dashboard-model";
import {
  buildHostSessionEditorOverview,
  compactSessionLifecycleLabel,
} from "@/features/host/model/host-session-editor-view-model";
import {
  lifecycleConfirmCopy,
  reverseLifecycleAction,
  type SessionLifecycleConfirmKind,
} from "@/features/host/model/host-session-lifecycle-model";
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
import {
  scheduleTimeHint,
  type HostScheduleDefaultsLoadState,
  type HostSessionScheduleDefaults,
} from "@/features/host/model/host-schedule-defaults-model";
import type { BasicSessionField } from "@/features/host/model/host-session-editor-form-state";
import { SessionIdentity } from "@/shared/ui/session-identity";
import {
  readmatesReturnState as defaultReadmatesReturnState,
  type ReadmatesReturnState,
  type ReadmatesReturnTarget,
} from "@/shared/routing/readmates-route-state";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { HostSessionDeletionPreviewDialog } from "./host-session-deletion-preview";
import { AttendancePanel } from "./session-editor/attendance-panel";
import { BasicSessionPanel } from "./session-editor/basic-session-panel";
import {
  type AttendanceWriteState,
  type HostSessionEditorActions,
  type SaveState,
} from "./session-editor/session-editor-actions";
import {
  DefaultLinkComponent,
  type HostSessionEditorLinkComponent,
} from "./session-editor/session-editor-links";
import {
  feedbackDocumentUploadStatus,
  feedbackPreviewStateForSession,
} from "./session-editor/session-editor-feedback";
import { HostSessionNotificationActions } from "./session-editor/session-editor-notifications";
import type { AiGenerateCommitResult } from "./session-editor/session-record-completion-panel";
import type {
  DraftSaveState,
  SessionRecordDraftSnapshot,
} from "./session-editor/session-record-draft-panel";
import { SessionRecordWorkspace } from "./session-editor/session-record-workspace";
import {
  SessionHistoryPanel,
} from "./session-editor/session-history-panel";
import type { SessionHistoryPanelItem } from "./session-editor/session-history-model";
import { SessionEditorSectionNav } from "./session-editor/session-editor-section-nav";
import { SessionLifecycleConfirmDialog } from "./session-editor/session-lifecycle-confirm-dialog";
import { SessionOverviewSection } from "./session-editor/session-overview-section";
import {
  SessionRecordApplyDialog,
  type HostSessionRecordApplyReview,
} from "./session-editor/session-record-apply-dialog";

export type { HostSessionEditorLinkComponent } from "./session-editor/session-editor-links";
export type { HostSessionRecordApplyReview } from "./session-editor/session-record-apply-dialog";

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
  }) => Promise<void>;
  onRestoreCompleted?: () => void;
};

const emptyManagementMessage = "세션을 만든 뒤 참석과 피드백 문서를 관리할 수 있습니다.";

const defaultHostDashboardReturnTarget: ReadmatesReturnTarget = {
  href: "/app/host",
  label: "운영으로",
};

function scopedHostRedirectHref(href: string) {
  return scopedAppLinkTarget(globalThis.location.pathname, href);
}

function scopedHostSessionEditHref(sessionId: string, clubSlug?: string) {
  const href = hostSessionEditHref(sessionId);
  return clubSlug
    ? scopedAppLinkTarget(`/clubs/${encodeURIComponent(clubSlug)}/app`, href)
    : scopedHostRedirectHref(href);
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
  scheduleDefaults,
  scheduleDefaultsLoadState,
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
  scheduleDefaults?: HostSessionScheduleDefaults | null;
  scheduleDefaultsLoadState?: HostScheduleDefaultsLoadState;
}) {
  const resolvedScheduleDefaults = scheduleDefaultsLoadState?.defaults ?? scheduleDefaults ?? null;
  if (session && !recordWorkflow) {
    throw new Error("recordWorkflow is required for persisted sessions");
  }

  // ---------------------------------------------------------------------------
  // Form state (reducer)
  // ---------------------------------------------------------------------------
  const [formState, dispatch] = useReducer(
    hostSessionEditorReducer,
    { session, scheduleDefaults: resolvedScheduleDefaults },
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
    endTime,
    locationLabel,
    meetingUrl,
    meetingPasscode,
    questionDeadlineOffsetDays,
    sessionState,
    displaySessionSnapshot,
    attendanceStatuses,
    feedbackDocument,
  } = formState;

  // ---------------------------------------------------------------------------
  // Transient UI state (separate useState — not form data)
  // ---------------------------------------------------------------------------
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lifecycleSaveState, setLifecycleSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [lifecycleConfirm, setLifecycleConfirm] = useState<SessionLifecycleConfirmKind | null>(null);
  const [lifecycleError, setLifecycleError] = useState<{
    message: string;
    openSessionHref: string | null;
  } | null>(null);
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
  const activeSection = navigation.location.section;
  const activeSource = navigation.location.source;

  if (!visitedSections.has(activeSection)) {
    setVisitedSections((current) => new Set(current).add(activeSection));
  }
  if (activeSection === "records" && !visitedSources.has(activeSource)) {
    setVisitedSources((current) => new Set(current).add(activeSource));
  }

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

  const handleAigenCommitted = useCallback(async (result: AiGenerateCommitResult) => {
    if (sessionIdForAigen) {
      if (recordWorkflow && result?.draftRevision !== null && result?.draftRevision !== undefined) {
        await recordWorkflow.onDraftCommitted({
          draftRevision: result.draftRevision,
          baseLiveRevision: result.baseLiveRevision,
          liveApplied: result.liveApplied,
        });
      } else {
        await recordWorkflow?.onReloadDraft();
      }
      await onSessionRecordsChanged?.(sessionIdForAigen);
    }
  }, [onSessionRecordsChanged, recordWorkflow, sessionIdForAigen]);

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteRestoreFocusRef = useRef<HTMLElement | null>(null);
  const lifecycleRestoreFocusRef = useRef<HTMLElement | null>(null);
  const committedAttendanceStatusesRef = useRef<Record<string, AttendanceStatus>>(
    Object.fromEntries(
      (session?.attendees ?? []).map((a) => [a.membershipId, a.attendanceStatus]),
    ),
  );
  const attendanceWriteStatesRef = useRef<Record<string, AttendanceWriteState>>({});

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const deadline = questionDeadlineLabelForForm(session, date, questionDeadlineOffsetDays);
  const isNewSession = session === null || session === undefined;
  const timeHint = isNewSession ? scheduleTimeHint(resolvedScheduleDefaults ?? { hints: [] }) : null;
  const sessionImportVisibility = recordWorkflow?.snapshot.visibility ?? "HOST_ONLY";
  const sessionImportExpectedDraftRevision = recordWorkflow?.expectedDraftRevision ?? null;
  const sessionImportContextStale = Boolean(
    sessionImportRequest
    && (
      sessionImportRequest.recordVisibility !== sessionImportVisibility
      || sessionImportRequest.expectedDraftRevision !== sessionImportExpectedDraftRevision
    ),
  );
  const previewSessionImportAction = actions.previewSessionImport;
  const feedbackDocumentForWorkspace = feedbackDocumentUploadStatus(feedbackDocument);
  const feedbackPreviewState = feedbackPreviewStateForSession(
    session,
    returnTarget,
    readmatesReturnState,
  );
  const editorTitle = isNewSession ? "세션 문서 만들기" : null;
  const basicSaveLabel = saveState === "saving"
    ? "기본 정보를 저장하는 중"
    : isNewSession
      ? "세션 문서 저장"
      : "기본 정보 저장";
  const showReturnLink =
    returnTarget.href !== hostDashboardReturnTarget.href || returnTarget.label !== hostDashboardReturnTarget.label;
  const displaySession = useMemo(
    () => displaySessionSnapshot ?? (session ? { ...session, state: sessionState } : session),
    [displaySessionSnapshot, session, sessionState],
  );
  const destructiveActionAvailability = useMemo(
    () => getDestructiveActionAvailability(displaySession),
    [displaySession],
  );
  const reverseAction = displaySession ? reverseLifecycleAction(displaySession.state) : null;
  const overview = useMemo(
    () => buildHostSessionEditorOverview({
      isNewSession,
      liveRevision: recordWorkflow?.editor.liveRevision ?? 0,
      liveSnapshot: recordWorkflow?.editor.liveSnapshot ?? null,
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
    [isNewSession, recordWorkflow],
  );

  // ---------------------------------------------------------------------------
  // Stable dispatch helpers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isNewSession || !resolvedScheduleDefaults) {
      return;
    }
    dispatch({ type: "APPLY_SCHEDULE_DEFAULTS", defaults: resolvedScheduleDefaults });
  }, [isNewSession, resolvedScheduleDefaults]);

  const onAdoptPreviousOnlineMeeting = useCallback((next: { meetingUrl: string; meetingPasscode: string }) => {
    dispatch({
      type: "ADOPT_PREVIOUS_ONLINE_MEETING",
      meetingUrl: next.meetingUrl,
      meetingPasscode: next.meetingPasscode,
    });
  }, []);

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

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------
  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  }, []);

  const deletionErrorMessage = (status?: number) => {
    if (status === 404) {
      return "모임을 찾을 수 없습니다.";
    }
    if (status === 409) {
      return "이미 닫히거나 공개된 모임은 삭제할 수 없습니다.";
    }
    return "모임을 지우지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  };

  const closeDeleteModal = useCallback(() => {
    if (deleteSubmitting) {
      return;
    }

    setDeleteModalOpen(false);
  }, [deleteSubmitting]);

  const openDeleteModal = useCallback(async (event?: { currentTarget: EventTarget | null }) => {
    if (!session || !destructiveActionAvailability.canDelete) {
      return;
    }

    const trigger = event?.currentTarget;
    deleteRestoreFocusRef.current = trigger instanceof HTMLElement ? trigger : deleteTriggerRef.current;
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

      const deletedDraft = (displaySession?.state ?? session.state) === "DRAFT";
      globalThis.location.href = scopedHostRedirectHref(deletedDraft ? "/app/host" : "/app/host/sessions/new");
    } catch {
      setDeleteError(deletionErrorMessage());
    } finally {
      setDeleteSubmitting(false);
    }
  }, [actions, deletePreview, deleteSubmitting, displaySession?.state, session]);

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
        ...(isNewSession ? { endTime } : {}),
        questionDeadlineOffsetDays,
      }, session ?? undefined);
      try {
        const response = await actions.saveSession(session?.sessionId ?? null, payload);

        if (response.ok) {
          setSaveState("saved");
          if (isNewSession) {
            const created = (await response.json()) as { sessionId: string };
            globalThis.location.href = scopedHostSessionEditHref(created.sessionId, clubSlug);
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
      endTime,
      questionDeadlineOffsetDays,
      session,
      isNewSession,
      actions,
      clubSlug,
      flash,
    ],
  );

  const requestLifecycleConfirm = useCallback((kind: SessionLifecycleConfirmKind) => {
    if (lifecycleSaveState === "saving") {
      return;
    }

    lifecycleRestoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setLifecycleError(null);
    setLifecycleConfirm(kind);
  }, [lifecycleSaveState]);

  const closeLifecycleConfirm = useCallback(() => {
    if (lifecycleSaveState === "saving") {
      return;
    }

    setLifecycleConfirm(null);
    setLifecycleError(null);
    setLifecycleSaveState("idle");
  }, [lifecycleSaveState]);

  const confirmLifecycle = useCallback(async () => {
    if (!session || !lifecycleConfirm || lifecycleSaveState === "saving") {
      return;
    }

    const actionByKind = {
      open: actions.openSession,
      close: actions.closeSession,
      publish: actions.publishSession,
      reopen: actions.reopenSession,
      unpublish: actions.unpublishSession,
      "return-to-draft": actions.returnSessionToDraft,
    } as const;
    const copy = lifecycleConfirmCopy(lifecycleConfirm);

    setLifecycleSaveState("saving");
    setLifecycleError(null);

    try {
      const result = await actionByKind[lifecycleConfirm](session.sessionId);

      if (!result.ok) {
        setLifecycleSaveState("error");
        setLifecycleError({
          message: result.message,
          openSessionHref: result.openSessionId
            ? scopedHostSessionEditHref(result.openSessionId, clubSlug)
            : null,
        });
        return;
      }

      dispatch({ type: "SESSION_LIFECYCLE_UPDATED", snapshot: result.session });
      setLifecycleSaveState("idle");
      setLifecycleConfirm(null);
      setLifecycleError(null);
      flash(copy.successFlash);
    } catch {
      setLifecycleSaveState("error");
      setLifecycleError({
        message: "요청을 처리하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요",
        openSessionHref: null,
      });
    }
  }, [actions, clubSlug, flash, lifecycleConfirm, lifecycleSaveState, session]);

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
        const preview = await previewSessionImportAction(session.sessionId, request);
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
    [session, sessionImportVisibility, previewSessionImportAction, recordWorkflow],
  );

  useEffect(() => {
    if (!session || !sessionImportRequest) {
      return;
    }

    if (
      sessionImportRequest.recordVisibility === sessionImportVisibility
      && sessionImportRequest.expectedDraftRevision === sessionImportExpectedDraftRevision
    ) {
      return;
    }

    let cancelled = false;
    const refreshedRequest: SessionImportRequest = {
      ...sessionImportRequest,
      recordVisibility: sessionImportVisibility,
      expectedDraftRevision: sessionImportExpectedDraftRevision,
    };

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setSessionImportPreview(null);
      setSessionImportError(null);
      setSessionImportStatus("previewing");
    });

    void previewSessionImportAction(session.sessionId, refreshedRequest)
      .then((preview) => {
        if (cancelled) {
          return;
        }
        setSessionImportRequest(refreshedRequest);
        setSessionImportPreview(preview);
        setSessionImportStatus(preview.valid ? "ready" : "error");
        setSessionImportError(
          preview.valid ? null : sessionImportFailureMessage("preview"),
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSessionImportRequest(refreshedRequest);
        setSessionImportPreview(null);
        setSessionImportStatus("error");
        setSessionImportError(sessionImportFailureMessage("preview"));
      });

    return () => {
      cancelled = true;
    };
  }, [
    previewSessionImportAction,
    session,
    sessionImportExpectedDraftRevision,
    sessionImportRequest,
    sessionImportVisibility,
  ]);

  const commitSessionImport = useCallback(async () => {
    if (
      !session
      || !sessionImportRequest
      || !sessionImportPreview?.valid
      || sessionImportStatus !== "ready"
      || sessionImportRequest.recordVisibility !== sessionImportVisibility
      || sessionImportRequest.expectedDraftRevision !== sessionImportExpectedDraftRevision
    ) {
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
      await onSessionRecordsChanged?.(session.sessionId);
      setSessionImportStatus("idle");
      setSessionImportPreview(null);
      setSessionImportRequest(null);
      setSessionImportCommitResult(commitResult);
      flash("가져온 정리본을 작성 중에 넣었습니다");
      if (recordWorkflow) {
        await recordWorkflow.confirmation.onReview();
      }
    } catch {
      setSessionImportStatus("error");
      setSessionImportError(sessionImportFailureMessage("commit-network"));
    }
  }, [
    session,
    sessionImportRequest,
    sessionImportPreview,
    sessionImportStatus,
    sessionImportVisibility,
    sessionImportExpectedDraftRevision,
    actions,
    flash,
    recordWorkflow,
    onSessionRecordsChanged,
  ]);

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
            {editorTitle ? (
              <>
                <div className="eyebrow">세션 운영 문서</div>
                <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
                  {editorTitle}
                </h1>
              </>
            ) : null}
            <div
              className="desktop-only rm-host-session-editor__desktop-metadata"
              role="group"
              aria-label="데스크톱 세션 상태"
            >
              {displaySession ? (
                <SessionIdentity
                  sessionNumber={displaySession.sessionNumber}
                  state={displaySession.state}
                  date={displaySession.date}
                  published={displaySession.state === "PUBLISHED"}
                />
              ) : (
                <div className="rm-session-identity">
                  <span className="rm-session-identity__chip">새 예정 세션</span>
                </div>
              )}
              <div className="row rm-host-session-editor__record-status">
                <span className="badge">{overview.applied.visibilityLabel}</span>
                <span className="badge">{overview.draft.statusLabel}</span>
              </div>
            </div>

            <div
              className="mobile-only rm-host-session-editor__mobile-metadata"
              role="group"
              aria-label="모바일 세션 상태"
            >
              {displaySession?.sessionNumber ? (
                <span className="rm-session-identity__chip">
                  {`No.${String(displaySession.sessionNumber).padStart(2, "0")}`}
                </span>
              ) : null}
              <span className="rm-session-identity__chip">
                {compactSessionLifecycleLabel(displaySession?.state ?? null)}
              </span>
              <span className="rm-session-identity__chip">{overview.applied.visibilityLabel}</span>
              <span className="rm-session-identity__chip">{overview.draft.statusLabel}</span>
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
                  onOpenSession={session ? () => requestLifecycleConfirm("open") : undefined}
                  onCloseSession={session ? () => requestLifecycleConfirm("close") : undefined}
                  onPublishSession={session ? () => requestLifecycleConfirm("publish") : undefined}
                  onReverseSession={reverseAction ? () => requestLifecycleConfirm(reverseAction.kind) : undefined}
                  reverseLabel={reverseAction?.label}
                  onDeleteDraft={
                    displaySession?.state === "DRAFT" && destructiveActionAvailability.canDelete
                      ? openDeleteModal
                      : undefined
                  }
                  lifecyclePending={lifecycleSaveState === "saving"}
                  accessScope={session?.accessScope
                    ?? (session?.visibility === "HOST_ONLY" ? "HOST_ONLY" : "GUEST_READABLE")}
                  sessionId={session?.sessionId}
                  recordVisibility={sessionImportVisibility}
                  importPreview={sessionImportContextStale ? null : sessionImportPreview}
                  importStatus={sessionImportContextStale ? "previewing" : sessionImportStatus}
                  importError={sessionImportContextStale ? null : sessionImportError}
                  onFileSelected={previewSessionImport}
                  onImportCommit={commitSessionImport}
                  onSetGuestReadable={session && recordWorkflow
                    ? async () => {
                      await actions.saveSessionAccessScope(session.sessionId, {
                        accessScope: "GUEST_READABLE",
                      });
                      recordWorkflow.onSnapshotChange({
                        ...recordWorkflow.snapshot,
                        visibility: compatibilityVisibilityForExposure(
                          "GUEST_READABLE",
                          session.siteVisibility ?? "HIDDEN",
                        ),
                      });
                    }
                    : undefined}
                  onConfirmApply={recordWorkflow ? () => void recordWorkflow.confirmation.onConfirm() : undefined}
                  onDismissApply={recordWorkflow?.confirmation.onCancel}
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

            {visitedSections.has("basic") || activeSection === "basic" ? (
              <form
                id="host-session-editor"
                onSubmit={handleSubmit}
                hidden={activeSection !== "basic"}
                className="stack"
                style={{ "--stack": "24px" } as CSSProperties}
              >
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
                    timeHint={timeHint}
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
                    previousOnlineMeeting={isNewSession
                      ? resolvedScheduleDefaults?.previousOnlineMeeting ?? null
                      : null}
                    scheduleDefaultsStatus={isNewSession
                      ? scheduleDefaultsLoadState?.status ?? "ready"
                      : "ready"}
                    scheduleDefaultsWarning={isNewSession
                      ? scheduleDefaultsLoadState?.warning ?? null
                      : null}
                    onRetryScheduleDefaults={isNewSession
                      ? scheduleDefaultsLoadState?.retry
                      : undefined}
                    onAdoptPreviousOnlineMeeting={isNewSession
                      ? onAdoptPreviousOnlineMeeting
                      : undefined}
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
                    {session && displaySession?.state !== "DRAFT" ? (
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
              </form>
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
                  <SessionRecordWorkspace
                      state={session.state}
                      accessScope={session.accessScope}
                      siteVisibility={session.siteVisibility}
                      source={activeSource}
                      onSourceChange={changeSource}
                      liveRevision={recordWorkflow!.editor.liveRevision}
                      liveSnapshot={recordWorkflow!.editor.liveSnapshot}
                      draft={{
                        snapshot: recordWorkflow!.snapshot,
                        source: recordWorkflow!.editor.draft?.source ?? null,
                        updatedAt: recordWorkflow!.editor.draft?.updatedAt ?? null,
                        saveState: recordWorkflow!.saveState,
                        validationIssues: recordWorkflow!.editor.validationSummary.issues,
                        liveBaseStale: recordWorkflow!.editor.draftLiveBaseStale,
                        rebasePending: recordWorkflow!.rebasePending,
                        rebaseError: recordWorkflow!.rebaseError,
                      }}
                      reviewPending={recordWorkflow!.confirmation.submitting}
                      feedbackDocument={{
                        ...feedbackDocumentForWorkspace,
                        previewState: feedbackPreviewState,
                        LinkComponent,
                      }}
                      creation={{
                        sessionId: session.sessionId,
                        clubSlug,
                        expectedDraftRevision: recordWorkflow!.expectedDraftRevision,
                        importPreview: sessionImportContextStale ? null : sessionImportPreview,
                        importCommitResult: sessionImportCommitResult,
                        importStatus: sessionImportContextStale ? "previewing" : sessionImportStatus,
                        importError: sessionImportContextStale ? null : sessionImportError,
                      }}
                      actions={{
                        onSnapshotChange: recordWorkflow!.onSnapshotChange,
                        onReloadDraft: recordWorkflow!.onReloadDraft,
                        onRebaseDraft: recordWorkflow!.onRebaseDraft,
                        onCopyInput: recordWorkflow!.onCopyInput,
                        onReviewDraft: recordWorkflow!.confirmation.onReview,
                        onAigenCommitted: handleAigenCommitted,
                        onImportFileSelected: previewSessionImport,
                        onImportCommit: commitSessionImport,
                      }}
                    />
                ) : (
                  <div className="surface-quiet small" style={{ padding: 18 }}>
                    기본 정보를 저장한 뒤 기록을 작성할 수 있습니다.
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
                onRestore={recordWorkflow?.onRestore ?? (async () => undefined)}
                onRestoreCompleted={recordWorkflow?.onRestoreCompleted ?? (() => undefined)}
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

      {lifecycleConfirm ? (
        <SessionLifecycleConfirmDialog
          copy={lifecycleConfirmCopy(lifecycleConfirm)}
          errorMessage={lifecycleError?.message ?? null}
          openSessionHref={lifecycleError?.openSessionHref ?? null}
          submitting={lifecycleSaveState === "saving"}
          restoreFocusRef={lifecycleRestoreFocusRef}
          onClose={closeLifecycleConfirm}
          onConfirm={() => void confirmLifecycle()}
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
