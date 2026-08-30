export type MutationProducerClassification = {
  path: string;
  exportName?: string;
  classification: "register" | "modify" | "verified-no-change" | "out-of-domain";
  ownerPaths: string[];
  recoveryClass: "L1" | "L2" | "L3" | "none";
  evidenceTokens: string[];
};

const entry = (
  path: string,
  classification: MutationProducerClassification["classification"],
  recoveryClass: MutationProducerClassification["recoveryClass"],
  ownerPaths: string[],
  evidenceTokens: string[],
  exportName?: string,
): MutationProducerClassification => ({ path, classification, recoveryClass, ownerPaths, evidenceTokens, ...(exportName ? { exportName } : {}) });
const register = (path: string, level: "L1" | "L2" | "L3", evidence: string[]) => entry(path, "register", level, [path], evidence);
const modify = (path: string, owners: string[], level: "L1" | "L2" | "L3", evidence: string[]) => entry(path, "modify", level, owners, evidence);
const leaf = (path: string, owners: string[], evidence: string[]) => entry(path, "verified-no-change", "none", owners, evidence);
const unreachable = (path: string, exportName: string) => entry(path, "out-of-domain", "none", [], ["exported-write", "mounted-import-count:0"], exportName);

export const SPACE_TRANSITION_PRODUCER_INVENTORY = [
  register("features/archive/route/account-settings-route.tsx", "L2", ["leaveMembership", "authoritative-auth"]),
  register("features/archive/route/profile-update-controller.ts", "L1", ["useUpdateMyProfileMutation", "dirty-profile"]),
  register("features/current-session/route/current-session-route.tsx", "L1", ["mutateAsync", "current-session-refetch"]),
  register("features/notifications/route/member-notification-settings-route.tsx", "L1", ["saveNotificationPreferences", "dirty-preferences"]),
  register("features/notifications/route/member-notifications-route.tsx", "L1", ["memberNotificationsActions", "notifications-refetch"]),
  leaf("features/auth/route/login-route.tsx", [], ["pre-auth", "outside-authenticated-space-transition"]),
  leaf("features/host/queries/host-state-purge.ts", ["src/app/host-authority-loss-controller.tsx"], ["authority-loss-cleanup", "not-user-command"]),
  leaf("shared/auth/club-access-api.ts", ["src/app/layouts/app-route-layout.tsx"], ["transport-primitive", "response-ignored"]),
  leaf("src/app/layouts/app-route-layout.tsx", ["src/app/layouts/app-route-layout.tsx"], ["ambient-touch-owner", "request-count:1"]),
  register("features/host/route/host-operations-route.tsx", "L1", ["ai-defaults", "accepted-publication"]),
  register("features/host/route/host-dashboard-route.tsx", "L1", ["attendanceMutation", "restoreMutation"]),
  register("features/host/route/host-meeting-ledger-route.tsx", "L2", ["createSession", "saveAccessScope"]),
  register("features/host/route/host-meeting-workspace-actions.ts", "L2", ["host-workflow-adapter", "mutation-receipt"]),
  register("features/host/route/host-meeting-workspace-route.tsx", "L3", ["manual-notification", "record-recovery"]),
  register("features/host/route/host-members-route.tsx", "L1", ["createHostMembersActions", "createHostInvitationsActions"]),
  register("features/host/route/host-invitations-route.tsx", "L1", ["createHostInvitationsActions", "still-unknown"]),
  register("features/host/route/host-notification-composer-controller.tsx", "L3", ["previewMutation", "confirmMutation"]),
  register("features/host/route/host-notifications-route.tsx", "L3", ["notification-workflow", "same-receipt"]),
  register("features/host/route/host-session-editor-route.tsx", "L3", ["dirty-draft", "record-workflow"]),
  register("features/host/route/ai-generate-controller.tsx", "L3", ["dirty-ai-draft", "registered-ai-commands"]),
  register("features/host/route/host-session-ledger-route.tsx", "L2", ["restoreMutation", "receipt-recovery"]),
  register("features/host/route/new-host-meeting-route.tsx", "L2", ["dirty-draft", "createMeeting"]),
  modify("features/notifications/route/member-notifications-data.ts", ["features/notifications/route/member-notifications-route.tsx"], "L1", ["observation-only", "explicit-publisher"]),
  modify("features/host/route/host-members-data.ts", ["features/host/route/host-members-route.tsx"], "L1", ["observation-only", "explicit-publisher"]),
  modify("features/host/route/host-invitations-data.ts", ["features/host/route/host-invitations-route.tsx", "features/host/route/host-members-route.tsx"], "L1", ["listInvitations:no-cache", "refreshInvitations:accepted-only"]),
  modify("features/host/route/host-session-editor-actions.ts", ["features/host/route/host-session-editor-route.tsx"], "L3", ["observation-only", "explicit-publisher"]),
  modify("features/archive/queries/profile-queries.ts", ["features/archive/route/profile-update-controller.ts"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/current-session/queries/current-session-queries.ts", ["features/current-session/route/current-session-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/aigen/queries/aigen-job-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-invitation-queries.ts", ["features/host/route/host-invitations-route.tsx", "features/host/route/host-members-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-members-queries.ts", ["features/host/route/host-members-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-notification-queries.ts", ["features/host/route/host-notifications-route.tsx", "features/host/route/host-notification-composer-controller.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-queries.ts", ["features/host/route/host-dashboard-route.tsx", "features/host/route/host-meeting-ledger-route.tsx", "features/host/route/host-meeting-workspace-actions.ts", "features/host/route/host-session-ledger-route.tsx", "features/host/route/new-host-meeting-route.tsx"], "L2", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-record-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-recovery-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx", "features/host/route/host-dashboard-route.tsx"], "L2", ["useMutation", "explicit-publisher"]),
  register("features/platform-admin/route/admin-shell-layout.tsx", "L2", ["onboarding", "dirty-preview"]),
  register("features/platform-admin/route/admin-today-route.tsx", "L1", ["allowedActions", "case-history"]),
  register("features/platform-admin/route/admin-club-detail-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-support-route.tsx", "L3", ["dirty-review", "receipt"]),
  register("features/platform-admin/route/admin-notifications-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-ai-ops-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-public-takedown-route.tsx", "L3", ["same-identity-replay", "authority-loss-zero-replay"]),
  modify("features/platform-admin/queries/platform-admin-ai-ops-queries.ts", ["features/platform-admin/route/admin-ai-ops-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-notifications-queries.ts", ["features/platform-admin/route/admin-notifications-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-operations-queries.ts", ["features/platform-admin/route/admin-today-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-queries.ts", ["features/platform-admin/route/admin-shell-layout.tsx", "features/platform-admin/route/admin-club-detail-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-support-queries.ts", ["features/platform-admin/route/admin-support-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-takedown-queries.ts", ["features/platform-admin/route/admin-public-takedown-route.tsx"], "L3", ["one-confirm-request", "explicit-publisher"]),
  leaf("features/host/aigen/ui/AiGenerateTab.tsx", ["features/host/route/ai-generate-controller.tsx"], ["presentation-slot"]),
  leaf("features/host/aigen/ui/PreviewView.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/host/aigen/ui/RegenerateModal.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/host/club/ui/ClubAiDefaultsSection.tsx", ["features/host/route/host-operations-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/host-operations-page.tsx", ["features/host/route/host-operations-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/host-members.tsx", ["features/host/route/host-members-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/host-invitations.tsx", ["features/host/route/host-invitations-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/host-session-editor.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/meeting-ledger/upcoming-book-list.tsx", ["features/host/route/host-meeting-ledger-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/session-editor/session-record-workspace.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/session-editor/session-record-completion-panel.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/platform-admin/ui/domain-provisioning-panel.tsx", ["features/platform-admin/route/admin-club-detail-route.tsx"], ["callback-only"]),
  leaf("shared/auth/club-access-query.ts", ["src/app/layouts/app-route-layout.tsx"], ["best-effort", "response-ignored", "request-count:1"]),
  unreachable("features/host/actions/invitations.ts", "createInvitation"),
  unreachable("features/host/actions/invitations.ts", "revokeInvitation"),
  unreachable("features/current-session/actions/save-checkin.ts", "saveCheckin"),
  unreachable("features/current-session/actions/save-question.ts", "saveQuestion"),
  unreachable("features/current-session/actions/save-question.ts", "saveQuestions"),
  unreachable("features/current-session/actions/save-review.ts", "saveLongReview"),
  unreachable("features/current-session/actions/save-review.ts", "saveOneLineReview"),
  unreachable("features/current-session/actions/update-rsvp.ts", "updateRsvp"),
] as const satisfies readonly MutationProducerClassification[];

export type ProducerInventoryAudit = {
  unclassifiedPaths: string[];
  unreachableExportsWithMountedImports: string[];
  modifyEntriesWithoutMountedOwner: string[];
  verifiedLeavesWithForbiddenPublication: string[];
};

const WRITE_VERB = "(?:save|update|delete|create|revoke|leave|mark|submit|confirm|commit|retry|restore|open|close|publish|unpublish|reopen|process|send|cancel|regenerate|touch)";
const MUTATION_PATTERN = new RegExp(`\\buseMutation\\b|\\.mutate(?:Async)?\\s*\\(|\\bactions\\.${WRITE_VERB}[A-Z][A-Za-z0-9_]*\\s*\\(`);
const DIRECT_RISKY_WRITE_PATTERN = /\b(?:regenerateItem|touchClubAccess(?:Once)?)\s*\(/;
const FORBIDDEN_LEAF_PATTERN = /from\s+["'][^"']*\/(?:api|queries|route)(?:\/|["'])|from\s+["'](?:react-router|@\/src\/app|@\/src\/pages)|\bfetch\s*\(/;

function hasImportedWriteInvocation(source: string): boolean {
  const importPattern = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    const modulePath = match[2] ?? "";
    if (!/(?:\/api(?:\/|$)|\/actions(?:\/|$)|shared\/auth\/club-access-query)/.test(modulePath)) {
      continue;
    }
    const names = (match[1] ?? "")
      .split(",")
      .map((part) => part.trim().replace(/^type\s+/, ""))
      .map((part) => part.split(/\s+as\s+/).at(-1) ?? "")
      .filter((name) => new RegExp(`^${WRITE_VERB}[A-Z]`).test(name));
    if (names.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(source.slice(match.index! + match[0].length)))) {
      return true;
    }
  }
  return false;
}

export function detectMutationProducerPaths(sources: ReadonlyMap<string, string>): string[] {
  return [...sources]
    .filter(([path, source]) => !/\.(?:test|ct|story)\.[jt]sx?$/.test(path)
      && !path.includes("/api/") && !path.includes("/model/") && !path.includes("/storage/")
      && path !== "src/app/space-transition-producer-inventory.ts"
      && (MUTATION_PATTERN.test(source) || DIRECT_RISKY_WRITE_PATTERN.test(source) || hasImportedWriteInvocation(source)))
    .map(([path]) => path)
    .sort();
}

export function auditMutationProducerInventory(
  sources: ReadonlyMap<string, string>,
  mountedPaths: ReadonlySet<string>,
  inventory: readonly MutationProducerClassification[] = SPACE_TRANSITION_PRODUCER_INVENTORY,
): ProducerInventoryAudit {
  const inventoryPaths = new Set(inventory.map((candidate) => candidate.path));
  return {
    unclassifiedPaths: detectMutationProducerPaths(sources).filter((path) => !inventoryPaths.has(path)),
    unreachableExportsWithMountedImports: inventory.filter((candidate) => candidate.classification === "out-of-domain" && mountedPaths.has(candidate.path)).map((candidate) => `${candidate.path}#${candidate.exportName ?? "*"}`),
    modifyEntriesWithoutMountedOwner: inventory.filter((candidate) => candidate.classification === "modify" && !candidate.ownerPaths.some((owner) => mountedPaths.has(owner))).map((candidate) => candidate.path),
    verifiedLeavesWithForbiddenPublication: inventory.filter((candidate) => candidate.classification === "verified-no-change" && /^(?:features\/[^/]+\/.*\/ui\/|features\/[^/]+\/ui\/)/.test(candidate.path) && FORBIDDEN_LEAF_PATTERN.test(sources.get(candidate.path) ?? "")).map((candidate) => candidate.path),
  };
}
