import type { HostSessionRecordEditor } from "@/features/host/api/host-session-record-contracts";

export type HostMeetingRecordFacts = {
  hasDraft: boolean;
  draftLiveBaseStale: boolean;
  validationIssueCount: number;
  hasAppliedRecord: boolean;
  publicationReady: boolean;
};

export type HostMeetingRecordReadiness =
  | { status: "not-required" }
  | { status: "pending" }
  | { status: "ready"; facts: HostMeetingRecordFacts; observedAt: string }
  | { status: "stale"; facts: HostMeetingRecordFacts; observedAt: string; retryable: true }
  | { status: "unavailable"; observedAt: string | null; retryable: true };

export type HostSessionRecordEditorReadinessSource = Pick<
  HostSessionRecordEditor,
  "draft" | "draftLiveBaseStale" | "liveRevision" | "validationSummary"
>;

export function mapHostMeetingRecordFacts(
  editor: HostSessionRecordEditorReadinessSource,
): HostMeetingRecordFacts {
  const validationIssueCount = editor.validationSummary.issues.length;
  const hasAppliedRecord = editor.liveRevision > 0;
  return {
    hasDraft: editor.draft != null,
    draftLiveBaseStale: editor.draftLiveBaseStale,
    validationIssueCount,
    hasAppliedRecord,
    publicationReady: hasAppliedRecord
      && !editor.draftLiveBaseStale
      && editor.validationSummary.valid
      && validationIssueCount === 0,
  };
}

export function observedHostMeetingRecordFacts(
  readiness: HostMeetingRecordReadiness,
): HostMeetingRecordFacts | null {
  if (readiness.status === "ready" || readiness.status === "stale") {
    return readiness.facts;
  }
  return null;
}
