import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import {
  adoptSensitiveMeetingSuggestion,
  applyNewMeetingSuggestions,
  buildNewMeetingRequest,
  classifyNewMeetingServerFailure,
  emptyNewMeetingDraft,
  newMeetingSuggestionsFromDefaults,
  projectCreatedMeeting,
  validateNewMeetingDraft,
  type NewMeetingDraft,
  type NewMeetingField,
  type NewMeetingFieldErrors,
} from "../model/new-host-meeting-model";
import { requireHostClubContext } from "../model/host-authority-loss";
import {
  HostMutationPendingError,
  hostSessionScheduleDefaultsQuery,
  useCreateHostSessionMutation,
  useOpenHostSessionMutation,
} from "../queries/host-session-queries";
import { registerHostSensitiveState } from "../storage/host-sensitive-storage";
import { NewHostMeetingPage, type SavedNewMeeting } from "../ui/new-meeting/new-host-meeting-page";
import { hostApiErrorFromResponse, readHostResponseJson } from "@/shared/api/host-authority-event";

export type NewHostMeetingRouteProps = {
  onSessionRecordsChanged?: (event: { sessionId: string; clubSlug: string }) => void | Promise<void>;
};

const fieldElementIds: Record<NewMeetingField, string> = {
  title: "session-title",
  bookTitle: "book-title",
  author: "book-author",
  meetingDate: "session-date",
  meetingTime: "session-time",
  locationLabel: "session-location",
  meetingUrl: "meeting-url",
  meetingPasscode: "meeting-passcode",
};

function firstErrorField(errors: NewMeetingFieldErrors): NewMeetingField | null {
  return (Object.keys(fieldElementIds) as NewMeetingField[]).find((field) => Boolean(errors[field])) ?? null;
}

function hasScheduleHistory(defaults: ReturnType<typeof useQuery>["data"]): boolean {
  if (!defaults || typeof defaults !== "object") return false;
  const value = defaults as {
    automatic?: { suggestedDate?: unknown };
    previousOnlineMeeting?: unknown;
    hints?: unknown[];
  };
  return Boolean(value.automatic?.suggestedDate || value.previousOnlineMeeting || value.hints?.length);
}

export function NewHostMeetingRoute({ onSessionRecordsChanged }: NewHostMeetingRouteProps) {
  const { clubSlug: routeClubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => requireHostClubContext(routeClubSlug), [routeClubSlug]);
  const clubSlug = context.clubSlug;
  const navigate = useNavigate();
  const defaultsQuery = useQuery(hostSessionScheduleDefaultsQuery(context));
  const createMutation = useCreateHostSessionMutation(context, { retainUntilResolved: true });
  const openMutation = useOpenHostSessionMutation(context);
  const createMeeting = createMutation.mutateAsync;
  const reconcilePendingCreate = createMutation.reconcilePendingCreate;
  const resolvePendingCreate = createMutation.resolvePendingCreate;
  const resetCreate = createMutation.reset;
  const openMeeting = openMutation.mutateAsync;
  const resetOpen = openMutation.reset;
  const [draft, setDraft] = useState<NewMeetingDraft>(() => emptyNewMeetingDraft());
  const draftRef = useRef(draft);
  const [dirty, setDirty] = useState<ReadonlySet<NewMeetingField>>(() => new Set());
  const dirtyRef = useRef(dirty);
  const [errors, setErrors] = useState<NewMeetingFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"editing" | "saving" | "pending" | "checking" | "saved" | "preparing" | "error">("editing");
  const [savedMeeting, setSavedMeeting] = useState<SavedNewMeeting | null>(null);
  const [prepareConfirmationOpen, setPrepareConfirmationOpen] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<NewMeetingField | "summary" | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(
      focusTarget === "summary" ? "new-meeting-form-error-summary" : fieldElementIds[focusTarget],
    )?.focus();
  }, [errors, focusTarget, formError]);

  const suggestionStatus = defaultsQuery.isPending || defaultsQuery.isFetching
    ? "loading" as const
    : defaultsQuery.isError
      ? "error" as const
      : hasScheduleHistory(defaultsQuery.data)
        ? "ready" as const
        : "no-history" as const;
  const suggestions = useMemo(
    () => newMeetingSuggestionsFromDefaults(defaultsQuery.data ?? null, suggestionStatus),
    [defaultsQuery.data, suggestionStatus],
  );

  useEffect(() => {
    if (!defaultsQuery.data) return;
    setDraft((current) => applyNewMeetingSuggestions(current, suggestions, dirtyRef.current));
  }, [defaultsQuery.data, suggestions]);

  const clearDraftState = useCallback(() => {
    setDraft(emptyNewMeetingDraft());
    setDirty(new Set());
    setErrors({});
    setFormError(null);
    setFocusTarget(null);
  }, []);

  const clearAllSensitiveState = useCallback(() => {
    clearDraftState();
    setSavedMeeting(null);
    setPrepareConfirmationOpen(false);
    setPrepareError(null);
    setFormError(null);
    setStatus("editing");
    resetCreate();
    resetOpen();
  }, [clearDraftState, resetCreate, resetOpen]);

  useEffect(() => {
    const unregisterDraft = registerHostSensitiveState({
      clubSlug,
      resourceKey: "meeting-form-draft:new",
      clear: clearAllSensitiveState,
    });
    const unregisterReconciliation = registerHostSensitiveState({
      clubSlug,
      resourceKey: "reconciliation:create",
      clear: () => {
        resetCreate();
        resetOpen();
        setSavedMeeting(null);
        setPrepareConfirmationOpen(false);
        setPrepareError(null);
      },
    });
    return () => {
      unregisterDraft();
      unregisterReconciliation();
    };
  }, [clubSlug, clearAllSensitiveState, resetCreate, resetOpen]);

  const handleFieldChange = useCallback((field: NewMeetingField, value: string) => {
    setDirty((current) => new Set(current).add(field));
    setDraft((current) => ({ ...current, [field]: value }));
    setFocusTarget(null);
    setFormError(null);
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const acceptCreateResponse = useCallback(async (response: Response) => {
    if (!response.ok) {
      const body = await response.clone().json().catch(() => null);
      const fieldFailure = classifyNewMeetingServerFailure(response.status, body);
      resolvePendingCreate();
      const apiError = await hostApiErrorFromResponse(response, {
        clubSlug,
        requestKind: "SESSION_CREATE",
      });
      if (fieldFailure?.field) {
        setErrors({ [fieldFailure.field]: fieldFailure.message });
        setFormError(null);
        setStatus("error");
        setFocusTarget(fieldFailure.field);
        return;
      }
      if (fieldFailure) {
        setErrors({});
        setFormError(fieldFailure.message);
        setStatus("error");
        setFocusTarget("summary");
        return;
      }
      throw apiError;
    }
    let projected: SavedNewMeeting;
    try {
      const created = await readHostResponseJson<{
        sessionId: string;
        sessionNumber?: number;
        state?: string;
        accessScope?: string;
        composer?: unknown;
      }>(response);
      if (created.composer) throw new Error("UNSAFE_CREATE_NOTIFICATION");
      projected = projectCreatedMeeting(created);
    } catch {
      throw new HostMutationPendingError();
    }
    resolvePendingCreate();
    clearDraftState();
    resetCreate();
    setSavedMeeting(projected);
    setStatus("saved");
    await onSessionRecordsChanged?.({ sessionId: projected.sessionId, clubSlug });
  }, [clubSlug, clearDraftState, onSessionRecordsChanged, resetCreate, resolvePendingCreate]);

  const submit = useCallback(async () => {
    if (status === "saving" || status === "pending" || status === "checking") return;
    const validation = validateNewMeetingDraft(draftRef.current);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setFormError(null);
      const field = firstErrorField(validation);
      if (field) setFocusTarget(field);
      return;
    }

    setStatus("saving");
    setErrors({});
    setFormError(null);
    try {
      const response = await createMeeting(buildNewMeetingRequest(draftRef.current));
      await acceptCreateResponse(response);
    } catch (error) {
      if (error instanceof HostMutationPendingError) {
        setStatus("pending");
        setErrors({});
        setFormError(null);
        return;
      }
      setStatus("error");
      setErrors({});
      setFormError("모임 초안을 저장하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.");
      setFocusTarget("summary");
    }
  }, [acceptCreateResponse, createMeeting, status]);

  const checkPendingCreate = useCallback(async () => {
    if (status !== "pending") return;
    setStatus("checking");
    setFormError(null);
    try {
      const response = await reconcilePendingCreate();
      await acceptCreateResponse(response);
    } catch (error) {
      setStatus("pending");
      setFormError(error instanceof HostMutationPendingError
        ? null
        : "저장 결과를 확인하지 못했습니다. 새 요청을 보내지 않고 다시 확인해 주세요.");
    }
  }, [acceptCreateResponse, reconcilePendingCreate, status]);

  const prepare = useCallback(async () => {
    if (!savedMeeting || status === "preparing") return;
    setStatus("preparing");
    setPrepareError(null);
    try {
      const response = await openMeeting(savedMeeting.sessionId);
      if (!response.ok) {
        const error = await hostApiErrorFromResponse(response, {
          clubSlug,
          requestKind: "SESSION_OPEN",
        });
        throw error;
      }
      const opened = await readHostResponseJson<{ state?: string; accessScope?: string }>(response);
      if (opened.state !== "OPEN" || opened.accessScope !== "GUEST_READABLE") {
        throw new Error("UNSAFE_PREPARE_RESULT");
      }
      setPrepareConfirmationOpen(false);
      await onSessionRecordsChanged?.({ sessionId: savedMeeting.sessionId, clubSlug });
      void navigate(`/clubs/${encodeURIComponent(clubSlug)}/app/host/sessions/${encodeURIComponent(savedMeeting.sessionId)}`);
    } catch {
      setStatus("saved");
      setPrepareError("준비를 시작하지 못했습니다. 초안은 그대로 유지됩니다.");
    }
  }, [clubSlug, navigate, onSessionRecordsChanged, openMeeting, savedMeeting, status]);

  const reason = suggestions.status === "ready" ? suggestions.message : null;
  const count = suggestions.meetingTime?.sourceMeetingCount
    ?? suggestions.meetingDate?.sourceMeetingCount
    ?? suggestions.locationLabel?.sourceMeetingCount
    ?? 0;

  return (
    <NewHostMeetingPage
      draft={draft}
      errors={errors}
      formError={formError}
      suggestionStatus={suggestions.status}
      suggestionMessage={suggestions.message}
      suggestionReason={reason}
      sourceMeetingCount={count}
      sensitiveSuggestionAvailable={Boolean(suggestions.meetingUrl)}
      status={status}
      savedMeeting={savedMeeting}
      prepareConfirmationOpen={prepareConfirmationOpen}
      prepareError={prepareError}
      onFieldChange={handleFieldChange}
      onSubmit={() => { void submit(); }}
      onCheckPendingCreate={() => { void checkPendingCreate(); }}
      onRetrySuggestions={() => { void defaultsQuery.refetch(); }}
      onAdoptSensitiveSuggestion={() => {
        setDraft((current) => adoptSensitiveMeetingSuggestion(current, suggestions));
        setDirty((current) => new Set(current).add("meetingUrl").add("meetingPasscode"));
      }}
      onPrepareRequested={() => setPrepareConfirmationOpen(true)}
      onPrepareCanceled={() => setPrepareConfirmationOpen(false)}
      onPrepareConfirmed={() => { void prepare(); }}
    />
  );
}
