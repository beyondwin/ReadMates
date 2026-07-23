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
  const [saveState, setSaveState] = useState<DraftSaveState>("idle");
  const [expectedDraftRevision, setExpectedDraftRevision] = useState<number | null>(
    editor.draft?.draftRevision ?? null,
  );
  const expectedDraftRevisionRef = useRef(expectedDraftRevision);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const persistSnapshot = useCallback(async (nextSnapshot: SessionRecordSnapshot) => {
    setSaveState("saving");
    try {
      const draft = await onSave({
        sessionId: editor.sessionId,
        request: {
          expectedDraftRevision: expectedDraftRevisionRef.current,
          snapshot: nextSnapshot,
        },
      });
      setDraftRevision(draft.draftRevision);
      setSaveState("saved");
    } catch (error) {
      setSaveState(isDraftStaleError(error) ? "stale" : "error");
    }
  }, [editor.sessionId, onSave, setDraftRevision]);

  const updateSnapshot = useCallback((nextSnapshot: SessionRecordSnapshot) => {
    setSnapshot(nextSnapshot);
    setSaveState("dirty");
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persistSnapshot(nextSnapshot);
    }, 600);
  }, [clearTimer, persistSnapshot]);

  const adoptEditor = useCallback((nextEditor: HostSessionRecordEditor) => {
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

  const copyInput = useCallback(async () => {
    await navigator.clipboard?.writeText(JSON.stringify(snapshot, null, 2));
  }, [snapshot]);

  useEffect(() => clearTimer, [clearTimer]);

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
  };
}
