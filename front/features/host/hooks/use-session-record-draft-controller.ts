import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HostSessionRecordDraft,
  HostSessionRecordEditor,
  SaveHostSessionRecordDraftRequest,
  SessionRecordSnapshot,
} from "@/features/host/api/host-session-record-contracts";

export type DraftSaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "stale";

function isDraftStaleError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "SESSION_RECORD_DRAFT_STALE",
  );
}

export function useSessionRecordDraftController({
  editor,
  onSave,
  onReload,
}: {
  editor: HostSessionRecordEditor;
  onSave: (variables: {
    sessionId: string;
    request: SaveHostSessionRecordDraftRequest;
  }) => Promise<HostSessionRecordDraft>;
  onReload: () => Promise<HostSessionRecordEditor | undefined>;
}) {
  const [snapshot, setSnapshot] = useState<SessionRecordSnapshot>(
    () => editor.draft?.snapshot ?? editor.liveSnapshot,
  );
  const [saveState, setSaveState] = useState<DraftSaveState>(
    () => editor.draft ? "saved" : "idle",
  );
  const [expectedDraftRevision, setExpectedDraftRevision] = useState<number | null>(
    editor.draft?.draftRevision ?? null,
  );
  const expectedDraftRevisionRef = useRef(expectedDraftRevision);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef<{
    snapshot: SessionRecordSnapshot;
    version: number;
  } | null>(null);
  const editVersionRef = useRef(0);
  const controllerEpochRef = useRef(0);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setDraftRevision = useCallback((revision: number | null) => {
    expectedDraftRevisionRef.current = revision;
    setExpectedDraftRevision(revision);
  }, []);

  const persistSnapshot = useCallback(async (
    nextSnapshot: SessionRecordSnapshot,
    version: number,
  ) => {
    if (saveInFlightRef.current) {
      queuedSaveRef.current = { snapshot: nextSnapshot, version };
      return;
    }
    saveInFlightRef.current = true;
    const epoch = controllerEpochRef.current;
    setSaveState("saving");
    try {
      let pending = { snapshot: nextSnapshot, version };
      while (mountedRef.current && epoch === controllerEpochRef.current) {
        const draft = await onSave({
          sessionId: editor.sessionId,
          request: {
            expectedDraftRevision: expectedDraftRevisionRef.current,
            snapshot: pending.snapshot,
          },
        });
        if (!mountedRef.current || epoch !== controllerEpochRef.current) {
          return;
        }
        setDraftRevision(draft.draftRevision);
        const queued = queuedSaveRef.current;
        queuedSaveRef.current = null;
        if (queued) {
          pending = queued;
          setSaveState("saving");
          continue;
        }
        setSaveState(pending.version === editVersionRef.current ? "saved" : "dirty");
        break;
      }
    } catch (error) {
      queuedSaveRef.current = null;
      if (mountedRef.current && epoch === controllerEpochRef.current) {
        setSaveState(isDraftStaleError(error) ? "stale" : "error");
      }
    } finally {
      saveInFlightRef.current = false;
      const queuedAfterAdoption = queuedSaveRef.current;
      if (
        queuedAfterAdoption &&
        mountedRef.current &&
        epoch !== controllerEpochRef.current
      ) {
        queuedSaveRef.current = null;
        queueMicrotask(() => {
          void persistSnapshot(queuedAfterAdoption.snapshot, queuedAfterAdoption.version);
        });
      }
    }
  }, [editor.sessionId, onSave, setDraftRevision]);

  const updateSnapshot = useCallback((nextSnapshot: SessionRecordSnapshot) => {
    const version = editVersionRef.current + 1;
    editVersionRef.current = version;
    setSnapshot(nextSnapshot);
    setSaveState("dirty");
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persistSnapshot(nextSnapshot, version);
    }, 600);
  }, [clearTimer, persistSnapshot]);

  const adoptEditor = useCallback((nextEditor: HostSessionRecordEditor) => {
    controllerEpochRef.current += 1;
    queuedSaveRef.current = null;
    editVersionRef.current = 0;
    const nextSnapshot = nextEditor.draft?.snapshot ?? nextEditor.liveSnapshot;
    setDraftRevision(nextEditor.draft?.draftRevision ?? null);
    setSnapshot(nextSnapshot);
    setSaveState(nextEditor.draft ? "saved" : "idle");
  }, [setDraftRevision]);

  const reloadDraft = useCallback(async () => {
    clearTimer();
    const latest = await onReload();
    if (latest) {
      adoptEditor(latest);
    }
  }, [adoptEditor, clearTimer, onReload]);

  const adoptDraftRevision = useCallback((revision: number) => {
    clearTimer();
    controllerEpochRef.current += 1;
    queuedSaveRef.current = null;
    editVersionRef.current = 0;
    setDraftRevision(revision);
    setSaveState("saved");
  }, [clearTimer, setDraftRevision]);

  const copyInput = useCallback(async () => {
    await navigator.clipboard?.writeText(JSON.stringify(snapshot, null, 2));
  }, [snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const shouldBlockNavigation =
    saveState === "dirty" || saveState === "saving" || saveState === "error" || saveState === "stale";
  useEffect(() => {
    if (!shouldBlockNavigation) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent | Event) => {
      event.preventDefault();
      if ("returnValue" in event) {
        event.returnValue = true;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldBlockNavigation]);

  return {
    snapshot,
    saveState,
    expectedDraftRevision,
    shouldBlockNavigation,
    updateSnapshot,
    reloadDraft,
    copyInput,
    adoptEditor,
    adoptDraftRevision,
  };
}
